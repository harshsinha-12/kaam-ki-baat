import AppKit
import SwiftUI
@preconcurrency import CoreMotion
import AirPodsCore

@MainActor
final class CompanionModel: NSObject, ObservableObject {
    @Published var origin = "http://localhost:3000"
    @Published var token = ""
    @Published private(set) var identity = "Not connected"
    @Published private(set) var apiMessage = "Enter the same device-session token used by the browser."
    @Published private(set) var motionMessage = "Press Start, then calibrate while facing the screen."
    @Published private(set) var permission = "Not requested"
    @Published private(set) var state: CompanionState = .stopped
    @Published private(set) var running = false
    @Published private(set) var connected = false
    @Published private(set) var provider: InputProvider?
    @Published private(set) var calibrated = false
    @Published private(set) var calibrating = false
    @Published private(set) var yaw = 0.0
    @Published private(set) var localZone: FocusZone?
    @Published private(set) var confirmedZone: FocusZone?
    @Published private(set) var sequence = 0
    @Published var invertYaw = false { didSet { invalidateCalibration(); motionMessage = "Direction changed. Calibrate front again." } }

    private let motion = CMHeadphoneMotionManager()
    private var selector = MotionSelector()
    private var calibration: NeutralCalibration?
    private var lastSample: Date?
    private var lastSampleUptime: Double?
    private var api: FocusAPI?
    private var epoch: Int?
    private var connectionTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var selectionTask: Task<Void, Never>?
    private var selectionRevision = 0
    private var generation = 0
    private var motionGeneration = 0
    private var lastHeartbeat = Date.distantPast
    private var watchdog: Timer?

    override init() {
        super.init()
        motion.delegate = self
        refreshPermission()
        watchdog = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkTracking() }
        }
        // Sleep/wake can change the reference frame. Never retain calibration.
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
    }

    func connectSession() {
        let enteredOrigin = origin.trimmingCharacters(in: .whitespacesAndNewlines)
        let enteredToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
        disconnectSession()
        let client: FocusAPI
        do { client = try FocusAPI(origin: enteredOrigin, token: enteredToken) }
        catch { apiMessage = error.localizedDescription; return }
        apiMessage = "Checking authenticated device session…"
        let run = generation
        connectionTask = Task { [weak self] in
            do {
                let me = try await client.identity()
                guard let self, !Task.isCancelled, self.generation == run else { return }
                self.api = client
                self.connected = true
                self.identity = me.participant.name
                self.token = "" // Credentials only live in this in-memory client, never defaults/files/logs.
                self.pollTask = Task { [weak self] in await self?.poll(client: client, generation: run) }
            } catch {
                guard let self, self.generation == run, !Task.isCancelled else { return }
                self.apiMessage = Self.message(error)
            }
        }
    }

    func disconnectSession() {
        generation += 1
        connectionTask?.cancel(); connectionTask = nil
        pollTask?.cancel(); pollTask = nil
        cancelSelection()
        api = nil; epoch = nil; provider = nil; connected = false
        token = ""; identity = "Not connected"; confirmedZone = nil; sequence = 0
        selector.resetDwell(); localZone = nil
        apiMessage = "Device session disconnected. Local motion can still be calibrated."
    }

    func startMotion() {
        guard !running else { return }
        refreshPermission()
        guard CMHeadphoneMotionManager.authorizationStatus() != .denied,
              CMHeadphoneMotionManager.authorizationStatus() != .restricted else {
            state = .denied; motionMessage = "Motion access denied/restricted. Check System Settings → Privacy & Security."
            return
        }
        guard motion.isDeviceMotionAvailable else {
            state = .unavailable; motionMessage = "Headphone motion is unavailable on this device. Connect supported headphones."
            return
        }
        invalidateCalibration()
        lastSample = nil; lastSampleUptime = nil
        running = true
        state = CMHeadphoneMotionManager.authorizationStatus() == .notDetermined ? .permissionRequired : .waiting
        motionMessage = "Waiting for real headphone samples. Connect and wear supported headphones."
        motionGeneration += 1
        let run = motionGeneration
        motion.startConnectionStatusUpdates()
        motion.startDeviceMotionUpdates(to: .main) { [weak self] sample, error in
            // Cross the actor boundary with values, never CMDeviceMotion/NSError.
            let yaw = sample?.attitude.yaw
            let time = sample?.timestamp
            let failed = error != nil
            Task { @MainActor in
                guard let self, self.running, self.motionGeneration == run else { return }
                if failed {
                    self.loseTracking(message: "Headphone motion stopped or is unavailable. Reconnect, then Start again.")
                    self.refreshPermission()
                    if CMHeadphoneMotionManager.authorizationStatus() == .denied || CMHeadphoneMotionManager.authorizationStatus() == .restricted { self.state = .denied }
                } else if let yaw, let time { self.receive(radians: yaw, time: time) }
            }
        }
    }

    func stopMotion() {
        motionGeneration += 1
        // CoreMotion's stop can enter TCC too. A launch-only app must never ask
        // for motion permission just because the window closes.
        if running {
            motion.stopDeviceMotionUpdates(); motion.stopConnectionStatusUpdates()
        }
        running = false
        invalidateCalibration()
        state = .stopped
        lastSample = nil; lastSampleUptime = nil
        motionMessage = "Stopped. Head movement cannot select a zone."
        refreshPermission()
    }

    func calibrateFront() {
        guard running, let lastSample, Date().timeIntervalSince(lastSample) < 0.5 else {
            motionMessage = "Calibration needs fresh headphone samples. Start and connect supported headphones first."
            return
        }
        invalidateCalibration()
        calibrating = true
        calibration = NeutralCalibration()
        state = .uncalibrated
        motionMessage = "Face the screen and hold still for one second…"
    }

    func shutdown() { stopMotion(); disconnectSession(); watchdog?.invalidate() }

    @objc private func willSleep() { stopMotion() }

    private func refreshPermission() {
        permission = switch CMHeadphoneMotionManager.authorizationStatus() {
        case .notDetermined: "Not determined (Start requests access)"
        case .restricted: "Restricted by system"
        case .denied: "Denied"
        case .authorized: "Authorized"
        @unknown default: "Unknown"
        }
    }

    private func invalidateCalibration() {
        cancelSelection()
        selector.invalidate(); calibration = nil; calibrated = false; calibrating = false
        localZone = nil; yaw = 0
        if running { state = .uncalibrated }
    }

    private func loseTracking(message: String) {
        invalidateCalibration()
        state = .disconnected
        motionMessage = message
    }

    private func checkTracking() {
        refreshPermission()
        guard running else { return }
        let auth = CMHeadphoneMotionManager.authorizationStatus()
        if auth == .denied || auth == .restricted {
            stopMotion(); state = .denied; motionMessage = "Motion permission was denied or revoked."
        } else if let lastSample, Date().timeIntervalSince(lastSample) > 0.75, state != .disconnected {
            loseTracking(message: "Motion samples lost. Selection paused; recalibrate after reconnecting.")
        } else if lastSample == nil, auth == .authorized, state != .disconnected { state = .waiting }
    }

    private func receive(radians: Double, time: Double) {
        guard radians.isFinite, time.isFinite else { loseTracking(message: "Invalid motion sample. Recalibrate."); return }
        if let previous = lastSampleUptime, time <= previous || time - previous > 0.5 {
            invalidateCalibration()
            motionMessage = "Tracking resumed. Calibrate front again."
        }
        lastSampleUptime = time
        lastSample = Date()
        let normalized = wrappedDegrees(radians * 180 / .pi * (invertYaw ? -1 : 1))
        if calibrating {
            if let neutral = calibration?.add(yaw: normalized, time: time) {
                selector.calibrate(yaw: neutral); calibrated = true; calibrating = false; calibration = nil
                motionMessage = "Calibrated from real samples. Turn and hold to select; activate in the browser."
            }
            state = calibrated ? .tracking : .uncalibrated
            return
        }
        state = calibrated ? .tracking : .uncalibrated
        guard calibrated else { return }
        // No dwell accumulation while a different provider controls focus.
        guard provider == .airpods, let epoch, let api, selectionTask == nil else {
            if provider != .airpods { selector.resetDwell() }
            yaw = wrappedDegrees(normalized - (selector.neutralYaw ?? normalized))
            return
        }
        let zone = selector.sample(yaw: normalized, time: time)
        yaw = selector.filteredYaw
        if let zone {
            localZone = zone
            publish(zone: zone, epoch: epoch, client: api)
        }
    }

    private func publish(zone: FocusZone, epoch: Int, client: FocusAPI) {
        let run = generation
        let motionRun = motionGeneration
        let revision = selectionRevision
        selectionTask = Task { [weak self] in
            defer { if let self, self.generation == run, self.motionGeneration == motionRun, self.selectionRevision == revision { self.selectionTask = nil } }
            do {
                let result = try await client.select(zone, epoch: epoch)
                guard let self, !Task.isCancelled, self.generation == run, self.motionGeneration == motionRun else { return }
                self.apply(result)
                self.apiMessage = "Confirmed by server read-back: \(zone.title), sequence \(result.focus.seq)."
            } catch {
                guard let self, !Task.isCancelled, self.generation == run, self.motionGeneration == motionRun else { return }
                self.selector.resetDwell(); self.localZone = nil
                self.apiMessage = Self.message(error)
                // Clear ownership until the next successful poll; never retry a stale selection.
                self.epoch = nil; self.provider = nil
            }
        }
    }

    private func apply(_ snapshot: InputSnapshot) {
        if epoch != snapshot.input.epoch || provider != snapshot.input.provider {
            cancelSelection()
            selector.resetDwell(); localZone = nil
            lastHeartbeat = .distantPast
        }
        epoch = snapshot.input.epoch
        provider = snapshot.input.provider
        if snapshot.focus.seq >= sequence {
            confirmedZone = snapshot.focus.provider == snapshot.input.provider && snapshot.focus.inputEpoch == snapshot.input.epoch ? snapshot.focus.zone : nil
            sequence = snapshot.focus.seq
        }
    }

    private func cancelSelection() {
        selectionRevision += 1
        selectionTask?.cancel(); selectionTask = nil
    }

    private func poll(client: FocusAPI, generation run: Int) async {
        while !Task.isCancelled, generation == run {
            do {
                let snapshot = try await client.input()
                guard !Task.isCancelled, generation == run else { return }
                apply(snapshot)
                apiMessage = snapshot.input.provider == .airpods ? "AirPods input selected in browser. Waiting for a deliberate turn." : "\(snapshot.input.provider.rawValue.capitalized) input controls focus. Choose AirPods in the browser to enable motion."
                if snapshot.input.provider == .airpods, Date().timeIntervalSince(lastHeartbeat) >= 2 {
                    try await client.heartbeat(epoch: snapshot.input.epoch, state: state, calibrated: calibrated, lastSampleAt: lastSample)
                    lastHeartbeat = Date()
                }
            } catch {
                guard !Task.isCancelled, generation == run else { return }
                cancelSelection()
                selector.resetDwell(); localZone = nil; epoch = nil; provider = nil
                apiMessage = Self.message(error)
                if case FocusAPIError.http(let status) = error, status == 401 || status == 403 {
                    connected = false; identity = "Session refused — reconnect"
                    api = nil
                    return
                }
            }
            do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
        }
    }

    private static func message(_ error: Error) -> String {
        if let error = error as? FocusAPIError { return error.localizedDescription }
        return "Cannot reach the input API. Motion selection paused; retrying."
    }
}

extension CompanionModel: CMHeadphoneMotionManagerDelegate {
    nonisolated func headphoneMotionManagerDidConnect(_ manager: CMHeadphoneMotionManager) {
        Task { @MainActor [weak self] in
            guard let self, self.running else { return }
            self.invalidateCalibration()
            self.motionMessage = "Headphones connected. Wait for samples, then calibrate front."
        }
    }
    nonisolated func headphoneMotionManagerDidDisconnect(_ manager: CMHeadphoneMotionManager) {
        Task { @MainActor [weak self] in
            guard let self, self.running else { return }
            self.loseTracking(message: "Headphones disconnected. Reconnect and calibrate front again.")
        }
    }
}
