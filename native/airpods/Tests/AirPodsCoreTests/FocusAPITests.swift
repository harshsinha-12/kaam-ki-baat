import XCTest
import Foundation
@testable import AirPodsCore

private struct Reply: Sendable {
    let method: String
    let path: String
    let status: Int
    let json: String
    init(_ method: String, _ path: String, _ json: String, status: Int = 200) {
        self.method = method; self.path = path; self.status = status; self.json = json
    }
}

private final class Scenario: @unchecked Sendable {
    private let lock = NSLock()
    private var replies: [Reply]
    private var seen: [URLRequest] = []
    init(_ replies: [Reply]) { self.replies = replies }
    func next(_ request: URLRequest) -> Reply {
        lock.lock(); defer { lock.unlock() }
        seen.append(request)
        guard !replies.isEmpty else { XCTFail("Unexpected request: \(request.url!.path)"); return Reply("", "", "{}", status: 500) }
        let reply = replies.removeFirst()
        XCTAssertEqual(request.httpMethod, reply.method)
        XCTAssertEqual(request.url?.path, "/api/zones/" + reply.path)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Session synthetic-device-session-token")
        return reply
    }
    var requests: [URLRequest] { lock.lock(); defer { lock.unlock() }; return seen }
    var remaining: Int { lock.lock(); defer { lock.unlock() }; return replies.count }
}

private final class Registry: @unchecked Sendable {
    private let lock = NSLock()
    private var scenarios: [String: Scenario] = [:]
    func put(_ scenario: Scenario, host: String) { lock.lock(); defer { lock.unlock() }; scenarios[host] = scenario }
    func get(_ host: String) -> Scenario? { lock.lock(); defer { lock.unlock() }; return scenarios[host] }
}

private final class StubProtocol: URLProtocol, @unchecked Sendable {
    static let registry = Registry()
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let host = request.url?.host, let scenario = Self.registry.get(host) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        let reply = scenario.next(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class FocusAPITests: XCTestCase, @unchecked Sendable {
    private func make(_ replies: [Reply]) throws -> (FocusAPI, Scenario) {
        let host = "test-\(UUID().uuidString.lowercased()).example"
        let scenario = Scenario(replies)
        StubProtocol.registry.put(scenario, host: host)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let api = try FocusAPI(origin: "https://\(host)", token: "synthetic-device-session-token", session: URLSession(configuration: config))
        return (api, scenario)
    }

    private func input(_ provider: String = "airpods", epoch: Int = 4, seq: Int = 1_700_000_000_123, zone: String? = nil) -> String {
        let zoneJSON = zone.map { "\"\($0)\"" } ?? "null"
        return """
        {"ok":true,"input":{"provider":"\(provider)","epoch":\(epoch)},"focus":{"zone":\(zoneJSON),"provider":\(zone == nil ? "null" : "\"airpods\""),"seq":\(seq),"inputEpoch":\(epoch),"activeZone":null}}
        """
    }

    func testSessionIdentityUsesOnlySessionHeader() async throws {
        let (api, scenario) = try make([Reply("GET", "me", "{\"ok\":true,\"participant\":{\"name\":\"Synthetic member\"}}")])
        let identity = try await api.identity()
        XCTAssertEqual(identity.participant.name, "Synthetic member")
        XCTAssertNil(scenario.requests.first?.httpBody)
    }

    func testGlobalSequenceRefreshedAndPersistedReadBackRequired() async throws {
        let (api, scenario) = try make([
            Reply("GET", "focus-input", input()),
            Reply("POST", "focus", "{\"ok\":true,\"zone\":\"team_memory\",\"seq\":1700000000124,\"locked\":false}"),
            Reply("GET", "focus-input", input(seq: 1_700_000_000_124, zone: "team_memory")),
        ])
        let result = try await api.select(.teamMemory, epoch: 4)
        XCTAssertEqual(result.focus.seq, 1_700_000_000_124)
        let body = try jsonBody(scenario.requests[1])
        XCTAssertEqual(Set(body.keys), ["zone", "provider", "seq", "confidence", "inputEpoch"])
        XCTAssertEqual(body["provider"] as? String, "airpods")
        XCTAssertEqual(body["seq"] as? Int, 1_700_000_000_124)
        XCTAssertEqual(body["inputEpoch"] as? Int, 4)
        XCTAssertEqual(scenario.remaining, 0)
    }

    func testInactiveProviderOrChangedEpochNeverPosts() async throws {
        for reply in [input("webcam"), input(epoch: 5)] {
            let (api, scenario) = try make([Reply("GET", "focus-input", reply)])
            do { _ = try await api.select(.codeNavigator, epoch: 4); XCTFail("Must refuse") }
            catch { XCTAssertEqual(error as? FocusAPIError, .inputChanged) }
            XCTAssertEqual(scenario.requests.count, 1)
        }
    }

    func test409IsNotRetriedAndNoFallbackOrActivation() async throws {
        let (api, scenario) = try make([
            Reply("GET", "focus-input", input()),
            Reply("POST", "focus", "{\"ok\":false}", status: 409),
        ])
        do { _ = try await api.select(.leaderDesk, epoch: 4); XCTFail("Must refuse") }
        catch { XCTAssertEqual(error as? FocusAPIError, .http(409)) }
        XCTAssertEqual(scenario.requests.count, 2)
    }

    func testSupersededReadBackAndFalseAcknowledgmentFail() async throws {
        let (api, _) = try make([
            Reply("GET", "focus-input", input()), Reply("POST", "focus", "{\"ok\":true}"),
            Reply("GET", "focus-input", input(seq: 1_700_000_000_125, zone: "code_navigator")),
        ])
        do { _ = try await api.select(.teamMemory, epoch: 4); XCTFail("Must refuse") }
        catch { XCTAssertEqual(error as? FocusAPIError, .readBackMismatch) }
        let (falseAPI, scenario) = try make([
            Reply("GET", "focus-input", input()), Reply("POST", "focus", "{\"ok\":false}"),
        ])
        do { _ = try await falseAPI.select(.teamMemory, epoch: 4); XCTFail("Must refuse") }
        catch { XCTAssertEqual(error as? FocusAPIError, .invalidResponse) }
        XCTAssertEqual(scenario.requests.count, 2)
    }

    func testHeartbeatExactFieldsISOStringOrNullAndNoYaw() async throws {
        let (api, scenario) = try make([
            Reply("POST", "focus-input-status", "{\"ok\":true}"), Reply("POST", "focus-input-status", "{\"ok\":true}"),
        ])
        try await api.heartbeat(epoch: 4, state: .tracking, calibrated: true, lastSampleAt: Date(timeIntervalSince1970: 1_700_000_000))
        try await api.heartbeat(epoch: 4, state: .stopped, calibrated: false, lastSampleAt: nil)
        let body = try jsonBody(scenario.requests[0])
        XCTAssertEqual(Set(body.keys), ["inputEpoch", "state", "calibrated", "lastSampleAt"])
        let date = body["lastSampleAt"] as? String
        XCTAssertNotNil(date.flatMap { ISO8601DateFormatter().date(from: $0) })
        XCTAssertTrue(try jsonBody(scenario.requests[1])["lastSampleAt"] is NSNull)
    }

    func testNoLegacyFallbackWhenInputEndpointMissing() async throws {
        let (api, scenario) = try make([Reply("GET", "focus-input", "{\"ok\":false}", status: 404)])
        do { _ = try await api.select(.teamMemory, epoch: 4); XCTFail("Must refuse") }
        catch { XCTAssertEqual(error as? FocusAPIError, .http(404)) }
        XCTAssertEqual(scenario.requests.count, 1)
    }

    func testOldEpochReadBackCannotConfirmNewSelection() async throws {
        let stale = input(seq: 1_700_000_000_124, zone: "team_memory").replacingOccurrences(of: "\"inputEpoch\":4", with: "\"inputEpoch\":3")
        let (api, _) = try make([
            Reply("GET", "focus-input", input()), Reply("POST", "focus", "{\"ok\":true}"), Reply("GET", "focus-input", stale),
        ])
        do { _ = try await api.select(.teamMemory, epoch: 4); XCTFail("Old epoch cannot confirm") }
        catch { XCTAssertEqual(error as? FocusAPIError, .readBackMismatch) }
    }

    func testRejectsUnsafeOriginsTokensAndInvalidContract() async throws {
        for origin in ["http://remote.example", "https://user:pass@example.com", "https://example.com/?key=x", "https://example.com/path", "file:///tmp", "https://example.com/#secret"] {
            XCTAssertThrowsError(try FocusAPI(origin: origin, token: "synthetic-device-session-token"))
        }
        XCTAssertThrowsError(try FocusAPI(origin: "http://localhost:3000", token: "short"))
        XCTAssertThrowsError(try FocusAPI(origin: "https://example.com", token: "synthetic-token\nspoof"))
        let (api, _) = try make([Reply("GET", "focus-input", "{\"ok\":true,\"input\":{\"provider\":\"airpods\",\"epoch\":4},\"focus\":{\"seq\":-1}}")])
        do { _ = try await api.input(); XCTFail("Invalid sequence") }
        catch { XCTAssertEqual(error as? FocusAPIError, .invalidResponse) }
    }

    func testAuthFailureDoesNotExposeServerBody() async throws {
        let (api, _) = try make([Reply("GET", "me", "{\"error\":\"private-server-detail\"}", status: 401)])
        do { _ = try await api.identity(); XCTFail("Must refuse") }
        catch { XCTAssertEqual(error as? FocusAPIError, .http(401)); XCTAssertFalse(error.localizedDescription.contains("private-server-detail")) }
    }

    private func jsonBody(_ request: URLRequest) throws -> [String: Any] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count <= 0 { break }
                data.append(contentsOf: buffer.prefix(count))
            }
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}
