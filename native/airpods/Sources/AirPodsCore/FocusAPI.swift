import Foundation

public enum CompanionState: String, Codable, Sendable {
    case unavailable, permissionRequired = "permission_required", denied, waiting, uncalibrated, tracking, disconnected, stopped
}

public enum InputProvider: String, Codable, Sendable { case manual, webcam, airpods }

public struct InputSnapshot: Decodable, Sendable {
    public struct Input: Decodable, Sendable { public let provider: InputProvider; public let epoch: Int }
    public struct Focus: Decodable, Sendable {
        public let zone: FocusZone?
        public let provider: InputProvider?
        public let seq: Int
        public let inputEpoch: Int?
        public let activeZone: FocusZone?
    }
    public struct Status: Decodable, Sendable {
        public let state: CompanionState
        public let calibrated: Bool
        public let lastSampleAt: String?
        public let receivedAt: String
        public let fresh: Bool
    }
    public let ok: Bool
    public let input: Input
    public let focus: Focus
    public let status: Status?
}

public struct SessionIdentity: Decodable, Sendable {
    public struct Participant: Decodable, Sendable { public let name: String }
    public let ok: Bool
    public let participant: Participant
}

public enum FocusAPIError: Error, LocalizedError, Equatable {
    case invalidOrigin, invalidToken, http(Int), invalidResponse, inputChanged, readBackMismatch
    public var errorDescription: String? {
        switch self {
        case .invalidOrigin: "Use an HTTPS origin, or HTTP on localhost. Do not include a path, credentials or query."
        case .invalidToken: "Enter the browser's device-session token (at least 16 characters)."
        case .http(401), .http(403): "Device session refused or expired. Reconnect with a valid device token."
        case .http(404): "Input API unavailable. Run Tab 4's focus-input backend."
        case .http(409), .inputChanged: "Input changed or sequence was superseded. Waiting for a fresh turn."
        case .http(let status): "Server request failed (HTTP \(status))."
        case .invalidResponse: "Server returned an invalid input response."
        case .readBackMismatch: "Selection was superseded or could not be confirmed by read-back."
        }
    }
}

/// Never follow a redirect with the user's device token.
private final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// The caller serializes requests; the server owns global sequence and epoch.
/// No provider switch, activation, Bolna session, hardware ID or raw yaw API exists here.
public actor FocusAPI {
    private let origin: URL
    private let token: String
    private let session: URLSession
    private static let maxSequence = 9_007_199_254_740_990

    public init(origin: String, token: String, session: URLSession? = nil) throws {
        guard let parts = URLComponents(string: origin), let url = parts.url,
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil, parts.path == "" || parts.path == "/",
              parts.scheme == "https" || (parts.scheme == "http" && ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host))
        else { throw FocusAPIError.invalidOrigin }
        guard token.count >= 16, token.count <= 4096, !token.contains(where: { $0.isWhitespace || $0.isNewline })
        else { throw FocusAPIError.invalidToken }
        self.origin = url
        self.token = token
        if let session { self.session = session }
        else {
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = 3
            config.timeoutIntervalForResource = 5
            config.urlCache = nil
            config.httpCookieStorage = nil
            config.urlCredentialStorage = nil
            self.session = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
        }
    }

    public func identity() async throws -> SessionIdentity {
        let value: SessionIdentity = try await request("me")
        guard value.ok else { throw FocusAPIError.invalidResponse }
        return value
    }

    public func input() async throws -> InputSnapshot {
        let value: InputSnapshot = try await request("focus-input")
        guard value.ok, value.input.epoch >= 0, value.focus.seq >= 0, value.focus.seq <= Self.maxSequence
        else { throw FocusAPIError.invalidResponse }
        return value
    }

    /// Refresh seq immediately before the write. On conflict, do not retry the turn.
    /// Success requires persisted read-back, not just a POST response.
    public func select(_ zone: FocusZone, epoch: Int) async throws -> InputSnapshot {
        let before = try await input()
        guard before.input.provider == .airpods, before.input.epoch == epoch else { throw FocusAPIError.inputChanged }
        let body = Selection(zone: zone, provider: "airpods", seq: before.focus.seq + 1, confidence: 1, inputEpoch: epoch)
        let _: OKResponse = try await request("focus", body: JSONEncoder().encode(body))
        let after = try await input()
        guard after.input.provider == .airpods, after.input.epoch == epoch else { throw FocusAPIError.inputChanged }
        guard after.focus.seq == body.seq, after.focus.zone == zone, after.focus.provider == .airpods, after.focus.inputEpoch == epoch
        else { throw FocusAPIError.readBackMismatch }
        return after
    }

    public func heartbeat(epoch: Int, state: CompanionState, calibrated: Bool, lastSampleAt: Date?) async throws {
        let body = Heartbeat(inputEpoch: epoch, state: state, calibrated: calibrated,
                             lastSampleAt: lastSampleAt.map { ISO8601DateFormatter().string(from: $0) })
        let _: OKResponse = try await request("focus-input-status", body: JSONEncoder().encode(body))
    }

    private struct Selection: Encodable { let zone: FocusZone; let provider: String; let seq: Int; let confidence: Int; let inputEpoch: Int }
    private struct Heartbeat: Encodable {
        let inputEpoch: Int; let state: CompanionState; let calibrated: Bool; let lastSampleAt: String?
        // Keep the contract's four fields present, including a null lastSampleAt.
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: Keys.self)
            try c.encode(inputEpoch, forKey: .inputEpoch); try c.encode(state, forKey: .state)
            try c.encode(calibrated, forKey: .calibrated); try c.encode(lastSampleAt, forKey: .lastSampleAt)
        }
        enum Keys: String, CodingKey { case inputEpoch, state, calibrated, lastSampleAt }
    }
    private struct OKResponse: Decodable { let ok: Bool }

    private func request<T: Decodable>(_ action: String, body: Data? = nil) async throws -> T {
        try Task.checkCancellation()
        var req = URLRequest(url: origin.appendingPathComponent("api/zones/\(action)"))
        req.httpMethod = body == nil ? "GET" : "POST"
        req.setValue("Session \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if let body { req.httpBody = body; req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: req)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse else { throw FocusAPIError.invalidResponse }
        guard http.statusCode == 200 else { throw FocusAPIError.http(http.statusCode) }
        guard data.count <= 1_048_576 else { throw FocusAPIError.invalidResponse }
        do {
            // Even HTTP 200 must explicitly acknowledge success.
            guard try JSONDecoder().decode(OKResponse.self, from: data).ok else { throw FocusAPIError.invalidResponse }
            return try JSONDecoder().decode(T.self, from: data)
        } catch { throw FocusAPIError.invalidResponse }
    }
}
