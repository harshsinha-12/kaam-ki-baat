# Kaam Ki Baat — AirPods motion companion

A small macOS 14+ app using **real `CMHeadphoneMotionManager` samples**. Motion selects Team Memory (left), Leader Desk (center), or Code Navigator (right). Activation is an explicit action in the browser; this app has no activation or call-start API.

**Hardware verification is outstanding.** No AirPods were available during the 2026-11-15 sprint; the user deferred physical testing. The Mac reported CoreMotion capability available and authorization `notDetermined`. That is not evidence of connected headphones, received motion, correct physical yaw direction, or granted permission. All sample-driven automated tests below are synthetic.

## Build and run

Requires macOS 14+, Xcode or a compatible Swift 6 toolchain. No third-party Swift dependencies or paid signing account are needed for this local build.

```bash
cd native/airpods
./run.sh
```

`build.sh` builds a release binary, packages `dist/Kaam Ki Baat AirPods.app` with the supplied `Info.plist`, ad-hoc signs it, and verifies the signature. `run.sh` opens that app through Launch Services. Build outputs are ignored. This is a local, unnotarized app, not a deployment or distributable release. Do not use an unbundled `swift run KaamKiBaatAirPods` to request motion access: launch the `.app` so macOS can identify the app and its usage descriptions.

## Connect to the browser

The server/browser must include Tab 4's `focus-input` API and provider arbitration (initial API commit `36443a2`, rebased to `7418d4c`; its integration branch is `codex/browser-focus-inputs`). A backend returning 404 pauses selection; there is no legacy fallback.

1. Use an authorized **device session**, issued by the existing server-side `npm run session:issue -- --participant <authorized-id> --device "AirPods demo"`. Issue it against the same snapshot/event store as the intended server. Keep the token private.
2. Enter the same device token in the browser's input controls and the companion's **Device session** field. A call token, board key, Bolna key, or server key is not a device-session token. Do not put tokens in command arguments, screenshots, Git, or URLs.
3. Enter the server **origin** (for example `http://localhost:3000`) and click **Connect session**. Remote connections require HTTPS; HTTP is allowed only for loopback hosts. Redirects are refused. The token is retained in memory only, cleared from the entry field after connecting, and discarded on disconnect/quit.
4. Select **AirPods** in the browser. The browser exclusively owns switching. Selecting Manual or Webcam pauses native writes without creating a new voice session.
5. When headphones are available, connect and wear them; click **Start**, approve motion access if macOS asks, then **Calibrate front** while facing the screen. Calibration needs at least 20 stable actual samples over one second.
6. Hold a deliberate left/center/right orientation to select. Use the browser's explicit action to activate. Center selection does not unlock leader access.

The app can open and connect without headphones. Start with no supported device stays waiting/unavailable; calibration cannot complete without fresh real samples. **Stop** stops motion/connection updates and clears calibration. **Disconnect session** stops API requests while leaving local motion available; **Stop** controls the sensor separately. Quit stops both. System sleep also stops motion.

## Permissions and motion behavior

`Info.plist` includes `NSMotionUsageDescription` (required by CoreMotion) and `NSLocalNetworkUsageDescription` for a local server, with ATS local-network support. The app requests no microphone, camera, Accessibility, Bluetooth discovery, or hardware-identity permission. If motion is denied/restricted, review the app's Motion & Fitness permission in System Settings → Privacy & Security where available, then Stop/Start or relaunch. OS prompt behavior with actual headphones remains unverified.

The selector subtracts the calibrated neutral angle and wraps yaw to `[-180°,180°)`. An angular EMA (alpha 0.35 at 50 ms), 22° entry / 12° exit hysteresis, and 450 ms dwell suppress brief glances and jitter. Circular calibration/filtering handle the ±180° seam. Calibration resets if the user moves more than 6° during the one-second capture. Sample gaps over 500 ms require recalibration; a 750 ms watchdog detects silent tracking loss. Disconnect, revoked permission, Stop, and sleep invalidate calibration. Head turns never infer identity or activate a zone.

The default mapping is positive CoreMotion yaw → the user's left. **Its physical direction must be checked on actual headphones.** If mirrored, enable **Reverse left/right** and recalibrate. Yaw drift and sensor reference-frame behavior must also be assessed on real hardware; neutral is captured explicitly, not inferred from hardware identity or continuous automatic re-centering.

## Wire contract

Every request uses `Authorization: Session <device token>`. Identity/roles/repository access remain server-owned.

- `GET /api/zones/me`: check the session and show the server-resolved participant name.
- Poll `GET /api/zones/focus-input` every 500 ms after each response. Read `{input:{provider,epoch},focus:{zone,provider,seq,inputEpoch,activeZone}}`. `provider`, zone, inputEpoch, activeZone and status can be null before events. No new input is inferred from old focus when the epoch changes.
- Only while `input.provider === "airpods"`: refresh the server sequence immediately before sending `POST /api/zones/focus` with exactly `{zone,provider:"airpods",seq:<latest+1>,confidence:1,inputEpoch}`. A successful POST is followed by GET read-back verifying zone, provider, sequence and epoch. Local pending and server-confirmed selections are shown separately.
- Provider/epoch changes, network failures and 409 responses discard the old selection. There is no automatic retry of that turn; fresh samples must satisfy dwell again. The server's epoch guard rejects in-flight stale writes. No focus event is queued for replay on reconnect.
- Every two seconds while AirPods is the active input: `POST /api/zones/focus-input-status` with exactly `{inputEpoch,state,calibrated,lastSampleAt}`. `lastSampleAt` is ISO-8601 or `null`; it is a device timestamp, not a freshness assertion. The server sets `receivedAt` and `fresh` (six-second timeout). State is one of `unavailable`, `permission_required`, `denied`, `waiting`, `uncalibrated`, `tracking`, `disconnected`, `stopped`. No raw yaw, audio or hardware IDs leave the Mac. On quit, the browser eventually marks the missing heartbeat stale.

## Checks

```bash
swift test
./build.sh
"dist/Kaam Ki Baat AirPods.app/Contents/MacOS/KaamKiBaatAirPods" --diagnose
"dist/Kaam Ki Baat AirPods.app/Contents/MacOS/KaamKiBaatAirPods" --smoke-ui
```

`--diagnose` is a read-only capability/authorization check; it explicitly reports `hardwareVerified:false`. `--smoke-ui` opens the window and closes after two seconds without starting motion or making API requests. Neither verifies physical motion. Swift tests cover calibration, wrapping, smoothing/dwell, hysteresis, loss/reset handling, protocol fields, authentication, stale provider/epoch refusal and persisted read-back.

Verified 2026-11-15 on macOS 27.0.1 / Swift 6.4.2: 18 Swift tests pass; debug/release builds, bundle plist/signature checks, launch/close smoke, native window layout and short-token form validation pass. A synthetic Swift HTTP integration passed against Tab 4's real backend dispatcher/store (API `7418d4c`) in an isolated fixture server. Full Next.js HTTP-route integration, real headphone samples, physical direction, hardware disconnect/reconnect and permission grant/denial with headphones were **not verified**.

For a reproducible **synthetic HTTP integration** against the real backend handlers, use a backend checkout containing Tab 4's API and installed Node dependencies. From `native/airpods`, in terminal one:

```bash
fixture_config=$(mktemp /tmp/kkb-airpods-fixture.XXXXXX)
echo "$fixture_config" # path only, never print its contents
/absolute/backend/node_modules/.bin/tsx Tests/fixture-server.ts /absolute/backend "$fixture_config"
```

In terminal two, use that temporary file path:

```bash
swift run AirPodsAPISmoke /tmp/kkb-airpods-fixture.REPLACE
```

Ctrl-C terminal one afterwards; it deletes its isolated store/config. The wrapper binds a random loopback port, imports actual `runZoneAction`/`EventStore`, creates a synthetic participant/device session, and never reads the live environment, private snapshot, or call runtime. The Swift client checks all three zone writes, read-back, sequence continuity, stale epoch/status refusal and absence of activation. The `SYNTHETIC_HTTP_PASS` result is not AirPods verification. Keep fixture credentials/config outside the repository. The HTTP wrapper exercises actual backend handlers, not the full Next.js route middleware.

## Deferred physical acceptance

When motion-capable headphones are available, record macOS/headphone model and app/backend commit, without serial numbers or tokens. On the packaged app:

1. Verify the motion permission prompt/denial/regrant behavior and confirm actual sample arrival, then calibrate front.
2. Hold left, center, right for about a second each. Confirm corresponding local yaw/zone and server-confirmed browser zone; check the sign and Reverse toggle. Repeat quick glances and threshold jitter to confirm no unwanted selection.
3. Verify center selection leaves leader access locked for a member; no turn activates or starts a call.
4. Switch AirPods → Webcam/Manual → AirPods while turning. Verify no native focus changes while inactive, no old selection replay, fresh dwell after switching back, and increasing global sequence.
5. Remove/disconnect headphones, reconnect, Stop/Start, put the Mac to sleep, and interrupt the API connection. Verify status becomes waiting/disconnected/unavailable, pending focus is discarded, and loss requires recalibration. Check browser status becomes stale within six seconds of quitting.

Only mark this acceptance verified after observing real headphone samples and persisted browser focus. Build, synthetic samples, platform capability and configuration entries do not satisfy it.

Apple reference: [CMHeadphoneMotionManager and required motion usage description](https://developer.apple.com/documentation/coremotion/cmheadphonemotionmanager).
