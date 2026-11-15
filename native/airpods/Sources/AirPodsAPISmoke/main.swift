import Foundation
import AirPodsCore

// Synthetic HTTP test client. Only accepts a configuration written by fixture-server.ts.
// This executable has no CoreMotion dependency and cannot verify AirPods hardware.
@main
struct APISmoke {
    struct Config: Decodable { let origin: String; let token: String; let fixture: Bool }
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else { fatalError("Usage: AirPodsAPISmoke <fixture-config.json>") }
        let config = try JSONDecoder().decode(Config.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        guard config.fixture, URL(string: config.origin)?.host == "127.0.0.1" else { fatalError("Fixture localhost only") }
        let api = try FocusAPI(origin: config.origin, token: config.token)
        let identity = try await api.identity()
        try check(identity.participant.name == "Synthetic AirPods tester", "fixture identity")
        try await switchInput("manual", config: config)
        let initial = try await api.input()
        try check(initial.input.provider == .manual, "initial manual provider")
        try check(initial.focus.seq >= 1_700_000_000_000, "global pre-existing sequence")
        do { _ = try await api.select(.teamMemory, epoch: initial.input.epoch); throw Failure("inactive provider accepted") }
        catch FocusAPIError.inputChanged { }

        try await switchInput("airpods", config: config)
        let start = try await api.input()
        try await api.heartbeat(epoch: start.input.epoch, state: .stopped, calibrated: false, lastSampleAt: nil)
        let heartbeat = try await api.input()
        try check(heartbeat.status?.state == .stopped && heartbeat.status?.fresh == true && heartbeat.status?.lastSampleAt == nil, "persisted stopped heartbeat")
        for (index, zone) in FocusZone.allCases.enumerated() {
            let selected = try await api.select(zone, epoch: start.input.epoch)
            try check(selected.focus.zone == zone && selected.focus.seq == initial.focus.seq + index + 1, "persisted \(zone.rawValue)")
            try check(selected.focus.activeZone == nil, "motion never activated anything")
        }
        try await switchInput("webcam", config: config)
        do { _ = try await api.select(.teamMemory, epoch: start.input.epoch); throw Failure("old epoch accepted") }
        catch FocusAPIError.inputChanged { }
        do { try await api.heartbeat(epoch: start.input.epoch, state: .tracking, calibrated: true, lastSampleAt: Date()); throw Failure("stale heartbeat accepted") }
        catch FocusAPIError.http(409) { }
        try await switchInput("airpods", config: config)
        let resumed = try await api.input()
        try check(resumed.input.epoch > start.input.epoch, "new epoch on switch back")
        try check(resumed.focus.inputEpoch != resumed.input.epoch, "old focus not confirmed in new epoch")
        let selected = try await api.select(.teamMemory, epoch: resumed.input.epoch)
        try check(selected.focus.seq == initial.focus.seq + 4, "sequence continues across providers")
        print("SYNTHETIC_HTTP_PASS identity, inactive-provider refusal, ISO/null heartbeat, left/center/right persisted read-back, no activation, stale epoch/status refusal, switch-back sequence. hardwareVerified=false")
    }
    struct Failure: Error { let message: String; init(_ message: String) { self.message = message } }
    static func check(_ value: Bool, _ description: String) throws { if !value { throw Failure(description) } }

    static func switchInput(_ provider: String, config: Config) async throws {
        var request = URLRequest(url: URL(string: config.origin + "/api/zones/focus-input")!)
        request.httpMethod = "POST"
        request.setValue("Session \(config.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["provider": provider])
        let (_, response) = try await URLSession.shared.data(for: request)
        try check((response as? HTTPURLResponse)?.statusCode == 200, "fixture provider switch")
    }
}
