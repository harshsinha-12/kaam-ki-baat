import Foundation

public enum FocusZone: String, Codable, Sendable, CaseIterable {
    case teamMemory = "team_memory"
    case leaderDesk = "leader_desk"
    case codeNavigator = "code_navigator"

    public var title: String {
        switch self {
        case .teamMemory: "Left · Team Memory"
        case .leaderDesk: "Center · Leader Desk"
        case .codeNavigator: "Right · Code Navigator"
        }
    }
}

/// Degrees in [-180, 180). Both subtraction and filtering must respect the seam.
public func wrappedDegrees(_ degrees: Double) -> Double {
    guard degrees.isFinite else { return .nan }
    let r = (degrees + 180).truncatingRemainder(dividingBy: 360)
    return (r < 0 ? r + 360 : r) - 180
}

/// One second of stationary, real samples. Circular mean handles +179/-179.
public struct NeutralCalibration: Sendable {
    private var samples: [(yaw: Double, time: Double)] = []
    public init() {}
    public mutating func add(yaw: Double, time: Double) -> Double? {
        guard yaw.isFinite, time.isFinite else { samples = []; return nil }
        if let last = samples.last, time <= last.time || time - last.time > 0.5 { samples = [] }
        if let first = samples.first, abs(wrappedDegrees(yaw - first.yaw)) > 6 { samples = [] }
        samples.append((yaw, time))
        guard let first = samples.first, time - first.time >= 1, samples.count >= 20 else { return nil }
        let sine = samples.reduce(0.0) { $0 + sin($1.yaw * .pi / 180) }
        let cosine = samples.reduce(0.0) { $0 + cos($1.yaw * .pi / 180) }
        return atan2(sine, cosine) * 180 / .pi
    }
}

/// Positive provider-normalized yaw is the user's left. Emits selections only.
public struct MotionSelector: Sendable {
    public private(set) var neutralYaw: Double?
    public private(set) var filteredYaw = 0.0
    public private(set) var selected: FocusZone?
    private var candidate: FocusZone = .leaderDesk
    private var candidateSince: Double?
    private var lastTime: Double?

    public init() {}
    public mutating func calibrate(yaw: Double) {
        guard yaw.isFinite else { return }
        neutralYaw = wrappedDegrees(yaw)
        resetDwell()
    }

    /// Provider handoff/API conflict retains neutral but never replays an old turn.
    public mutating func resetDwell() {
        filteredYaw = 0
        selected = nil
        candidate = .leaderDesk
        candidateSince = nil
        lastTime = nil
    }

    /// Disconnect/permission loss requires an explicit fresh calibration.
    public mutating func invalidate() { self = MotionSelector() }

    public mutating func sample(yaw: Double, time: Double) -> FocusZone? {
        guard let neutralYaw, yaw.isFinite, time.isFinite else { resetDwell(); return nil }
        if let lastTime, time <= lastTime { resetDwell(); return nil }
        let gap = lastTime.map { time - $0 }
        let resumed = gap == nil || gap! > 0.5
        let relative = wrappedDegrees(yaw - neutralYaw)
        // Time-aware EMA: alpha .35 at 50ms, stable across headphone sample rates.
        let alpha = 1 - pow(0.65, min(gap ?? 0.05, 0.5) / 0.05)
        filteredYaw = resumed ? relative : wrappedDegrees(filteredYaw + alpha * wrappedDegrees(relative - filteredYaw))
        self.lastTime = time

        let zone: FocusZone
        switch candidate {
        case .teamMemory where filteredYaw >= 12: zone = .teamMemory
        case .codeNavigator where filteredYaw <= -12: zone = .codeNavigator
        default:
            zone = filteredYaw > 24 ? .teamMemory : (filteredYaw < -24 ? .codeNavigator : .leaderDesk)
        }
        if zone != candidate || resumed || candidateSince == nil {
            candidate = zone
            candidateSince = time
        }
        // Glance and latch (mirrors lib/focus/selector.ts): a side needs 0.3 s; looking
        // back at the screen keeps the side choice unless the head stays centred 4 s.
        let needed = (zone == .leaderDesk && selected != nil) ? 4.0 : 0.30
        guard let candidateSince, time - candidateSince >= needed, selected != zone else { return nil }
        selected = zone
        return zone
    }
}
