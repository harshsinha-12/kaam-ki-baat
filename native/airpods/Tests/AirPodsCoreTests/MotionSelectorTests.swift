import XCTest
@testable import AirPodsCore

final class MotionSelectorTests: XCTestCase {
    func testUncalibratedNeverSelectsAndInvalidValuesDoNotCalibrate() {
        var selector = MotionSelector()
        for i in 0..<100 { XCTAssertNil(selector.sample(yaw: 40, time: Double(i) * 0.05)) }
        selector.calibrate(yaw: .nan)
        XCTAssertNil(selector.neutralYaw)
    }

    func testLeftCenterRightNeedDwellAndEmitOnce() {
        var selector = MotionSelector(); selector.calibrate(yaw: 10)
        var time = 0.0
        func hold(_ yaw: Double, count: Int = 30) -> [FocusZone] {
            var emitted: [FocusZone] = []
            for _ in 0..<count {
                time += 0.05
                if let z = selector.sample(yaw: yaw, time: time) { emitted.append(z) }
            }
            return emitted
        }
        XCTAssertEqual(hold(45), [.teamMemory])
        XCTAssertEqual(hold(10), [], "looking back at the screen keeps the side choice")
        XCTAssertEqual(hold(10, count: 70), [.leaderDesk])
        XCTAssertEqual(hold(-25), [.codeNavigator])
        XCTAssertEqual(hold(-25), [])
    }

    func testShortGlanceDoesNotSelectSide() {
        var s = MotionSelector(); s.calibrate(yaw: 0)
        var emitted: [FocusZone] = []
        let samples = [Double](repeating: 0, count: 15) + [Double](repeating: 40, count: 3) + [Double](repeating: 0, count: 20)
        for (i, yaw) in samples.enumerated() {
            if let z = s.sample(yaw: yaw, time: Double(i) * 0.05) { emitted.append(z) }
        }
        XCTAssertFalse(emitted.contains(.teamMemory))
    }

    func testHysteresisHoldsSideAtThreshold() {
        var s = MotionSelector(); s.calibrate(yaw: 0)
        var emitted: [FocusZone] = []
        for i in 0..<90 {
            let yaw = i < 30 ? 35.0 : (i % 2 == 0 ? 19.0 : 25.0)
            if let z = s.sample(yaw: yaw, time: Double(i) * 0.05) { emitted.append(z) }
        }
        XCTAssertEqual(emitted, [.teamMemory])
    }

    func testYawWrapAndCircularFilterDoNotJumpThroughCenter() {
        XCTAssertEqual(wrappedDegrees(359), -1)
        XCTAssertEqual(wrappedDegrees(-359), 1)
        var s = MotionSelector(); s.calibrate(yaw: 179)
        for i in 0..<30 { _ = s.sample(yaw: -179, time: Double(i) * 0.05) }
        XCTAssertEqual(s.filteredYaw, 2, accuracy: 0.001)
        s.calibrate(yaw: 0)
        _ = s.sample(yaw: 179, time: 2)
        _ = s.sample(yaw: -179, time: 2.05)
        XCTAssertGreaterThan(abs(s.filteredYaw), 175)
    }

    func testGapAndProviderResetRequireFreshDwell() {
        var s = MotionSelector(); s.calibrate(yaw: 0)
        for i in 0..<8 { XCTAssertNil(s.sample(yaw: 35, time: Double(i) * 0.05)) }
        XCTAssertNil(s.sample(yaw: 35, time: 5))
        XCTAssertNil(s.sample(yaw: 35, time: 5.1))
        s.resetDwell()
        XCTAssertNil(s.sample(yaw: 35, time: 5.4))
        XCTAssertNil(s.sample(yaw: 35, time: 5.6))
        XCTAssertEqual(s.sample(yaw: 35, time: 5.9), .teamMemory)
        s.invalidate()
        XCTAssertNil(s.sample(yaw: 35, time: 6.5))
        XCTAssertNil(s.neutralYaw)
    }

    func testOutOfOrderAndNonFiniteSamplesBreakDwell() {
        var s = MotionSelector(); s.calibrate(yaw: 0)
        _ = s.sample(yaw: 35, time: 1)
        XCTAssertNil(s.sample(yaw: 35, time: 0.9))
        XCTAssertNil(s.sample(yaw: 35, time: 1.4))
        XCTAssertNil(s.sample(yaw: .nan, time: 1.5))
        XCTAssertNil(s.sample(yaw: 35, time: 1.9))
        XCTAssertNil(s.sample(yaw: 35, time: 2))
    }

    func testCalibrationCircularMeanAndMotionReject() {
        var c = NeutralCalibration()
        var value: Double?
        for i in 0..<25 { value = c.add(yaw: i % 2 == 0 ? 179 : -179, time: Double(i) * 0.05) }
        XCTAssertNotNil(value)
        XCTAssertLessThan(abs(wrappedDegrees(value! - 180)), 0.1)
        c = NeutralCalibration()
        for i in 0..<100 { XCTAssertNil(c.add(yaw: Double(i) * 8, time: Double(i) * 0.05)) }
    }
}
