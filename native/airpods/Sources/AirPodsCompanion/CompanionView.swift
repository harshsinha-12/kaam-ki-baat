import SwiftUI
import AirPodsCore

struct CompanionView: View {
    @ObservedObject var model: CompanionModel
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Kaam Ki Baat").font(.largeTitle.bold())
            Text("AirPods motion companion").font(.title3).foregroundStyle(.secondary)
            GroupBox("Device session") {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Server origin", text: $model.origin).textFieldStyle(.roundedBorder).disabled(model.connected)
                    SecureField("Browser device-session token", text: $model.token).textFieldStyle(.roundedBorder).disabled(model.connected)
                    HStack {
                        Button("Connect session") { model.connectSession() }.disabled(model.connected)
                        Button("Disconnect session") { model.disconnectSession() }.disabled(!model.connected)
                        Text(model.identity).foregroundStyle(.secondary)
                    }
                    Text(model.apiMessage).font(.callout).textSelection(.enabled)
                }.padding(8).frame(maxWidth: .infinity, alignment: .leading)
            }
            GroupBox("Real headphone motion") {
                VStack(alignment: .leading, spacing: 10) {
                    LabeledContent("Permission", value: model.permission)
                    LabeledContent("Motion state", value: model.state.rawValue)
                    LabeledContent("Calibration", value: model.calibrating ? "Hold still…" : (model.calibrated ? "Ready" : "Required"))
                    LabeledContent("Active input", value: model.provider?.rawValue ?? "Unknown / offline")
                    HStack {
                        Button("Start") { model.startMotion() }.disabled(model.running)
                        Button("Stop") { model.stopMotion() }.disabled(!model.running)
                        Button("Calibrate front") { model.calibrateFront() }.disabled(!model.running)
                        Toggle("Reverse left/right", isOn: $model.invertYaw).toggleStyle(.checkbox)
                    }
                    Text(model.motionMessage).font(.callout)
                    Text(String(format: "Relative yaw: %+.1f° (local only)", model.yaw)).monospacedDigit().foregroundStyle(.secondary)
                }.padding(8).frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 10) {
                ForEach(FocusZone.allCases, id: \.self) { zone in
                    VStack(spacing: 6) {
                        Text(zone.title).font(.headline)
                        Text(model.confirmedZone == zone ? "Server selected · #\(model.sequence)" : (model.localZone == zone ? "Local selection · sending" : " ")).font(.caption)
                    }
                    .frame(maxWidth: .infinity).padding(12)
                    .background(model.confirmedZone == zone ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            Text("Head turns select only. Activate explicitly in the browser. Leader access is checked by the server. No microphone, camera, Bluetooth identity or raw yaw is sent.")
                .font(.callout).foregroundStyle(.secondary)
        }
        .padding(24).frame(width: 760)
    }
}
