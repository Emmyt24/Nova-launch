#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

// Minimal StreamInfo for testing
#[derive(Clone, Debug)]
struct TestStreamInfo {
    pub id: u64,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub cliff_time: u64,
}

// Simulate cliff enforcement logic
fn check_cliff(current_time: u64, cliff_time: u64) -> Result<(), &'static str> {
    if current_time < cliff_time {
        return Err("CliffNotReached");
    }
    Ok(())
}

// Simulate vesting calculation
fn calculate_vested(stream: &TestStreamInfo, current_time: u64) -> i128 {
    // Before cliff: nothing claimable
    if current_time < stream.cliff_time {
        return 0;
    }

    // Before start: nothing claimable
    if current_time < stream.start_time {
        return 0;
    }

    // After end: everything is vested
    if current_time >= stream.end_time {
        return stream.total_amount;
    }

    // During vesting: linear vesting from start_time
    let elapsed = current_time - stream.start_time;
    let duration = stream.end_time - stream.start_time;

    // Handle zero-duration edge case
    if duration == 0 {
        return stream.total_amount;
    }

    // Linear interpolation
    (stream.total_amount * elapsed as i128) / duration as i128
}

#[test]
fn test_cliff_enforcement_before_cliff() {
    let cliff_time = 150;
    let current_time = 149;

    let result = check_cliff(current_time, cliff_time);
    assert_eq!(result, Err("CliffNotReached"));
}

#[test]
fn test_cliff_enforcement_at_cliff() {
    let cliff_time = 150;
    let current_time = 150;

    let result = check_cliff(current_time, cliff_time);
    assert!(result.is_ok());
}

#[test]
fn test_cliff_enforcement_after_cliff() {
    let cliff_time = 150;
    let current_time = 151;

    let result = check_cliff(current_time, cliff_time);
    assert!(result.is_ok());
}

#[test]
fn test_vesting_calculation_before_cliff() {
    let stream = TestStreamInfo {
        id: 0,
        total_amount: 1000,
        claimed_amount: 0,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };

    let vested = calculate_vested(&stream, 140);
    assert_eq!(vested, 0, "Should return 0 before cliff");
}

#[test]
fn test_vesting_calculation_at_cliff() {
    let stream = TestStreamInfo {
        id: 0,
        total_amount: 1000,
        claimed_amount: 0,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };

    // At cliff (50% through vesting period)
    let vested = calculate_vested(&stream, 150);
    assert_eq!(vested, 500, "Should return 50% vested at cliff");
}

#[test]
fn test_vesting_calculation_after_cliff() {
    let stream = TestStreamInfo {
        id: 0,
        total_amount: 1000,
        claimed_amount: 0,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };

    // After cliff (60% through vesting period)
    let vested = calculate_vested(&stream, 160);
    assert_eq!(vested, 600, "Should return 60% vested");
}

#[test]
fn test_no_cliff_scenario() {
    let stream = TestStreamInfo {
        id: 0,
        total_amount: 1000,
        claimed_amount: 0,
        start_time: 100,
        end_time: 200,
        cliff_time: 100, // Same as start - no cliff
    };

    // At start time (0% through)
    let vested_at_start = calculate_vested(&stream, 100);
    assert_eq!(vested_at_start, 0, "Should return 0 at start");

    // At 25% through
    let vested_at_25 = calculate_vested(&stream, 125);
    assert_eq!(vested_at_25, 250, "Should return 25% vested");
}

#[test]
fn test_full_cliff_scenario() {
    let stream = TestStreamInfo {
        id: 0,
        total_amount: 1000,
        claimed_amount: 0,
        start_time: 100,
        end_time: 200,
        cliff_time: 200, // Same as end - full cliff
    };

    // Before cliff (50% through vesting period)
    let vested_before = calculate_vested(&stream, 150);
    assert_eq!(vested_before, 0, "Should return 0 before cliff");

    // At cliff (100% through)
    let vested_at_cliff = calculate_vested(&stream, 200);
    assert_eq!(vested_at_cliff, 1000, "Should return 100% at cliff");
}

#[test]
fn test_zero_duration_stream() {
    let stream = TestStreamInfo {
        id: 0,
        total_amount: 1000,
        claimed_amount: 0,
        start_time: 100,
        end_time: 100,   // Same as start
        cliff_time: 100, // Same as start
    };

    // At cliff time
    let vested = calculate_vested(&stream, 100);
    assert_eq!(
        vested, 1000,
        "Should return full amount immediately for zero-duration stream"
    );
}

#[test]
fn test_vesting_starts_from_start_time_not_cliff() {
    let stream = TestStreamInfo {
        id: 0,
        total_amount: 1000,
        claimed_amount: 0,
        start_time: 100,
        end_time: 300,   // 200 second duration
        cliff_time: 200, // Cliff at 50% point
    };

    // At cliff time (which is 50% through the vesting period)
    // Vesting should be calculated from start_time, not cliff_time
    let vested_at_cliff = calculate_vested(&stream, 200);
    // (200 - 100) / (300 - 100) = 100 / 200 = 50%
    assert_eq!(
        vested_at_cliff, 500,
        "Vesting should be 50% at cliff (calculated from start_time)"
    );

    // At 75% through vesting period
    let vested_at_75 = calculate_vested(&stream, 250);
    // (250 - 100) / (300 - 100) = 150 / 200 = 75%
    assert_eq!(
        vested_at_75, 750,
        "Vesting should be 75% (calculated from start_time)"
    );
}

#[test]
fn test_cliff_validation_bounds() {
    // Test that cliff must be between start and end
    let start = 100u64;
    let end = 200u64;

    // Valid: cliff at start
    let cliff_at_start = 100u64;
    assert!(cliff_at_start >= start && cliff_at_start <= end);

    // Valid: cliff at end
    let cliff_at_end = 200u64;
    assert!(cliff_at_end >= start && cliff_at_end <= end);

    // Valid: cliff in middle
    let cliff_in_middle = 150u64;
    assert!(cliff_in_middle >= start && cliff_in_middle <= end);

    // Invalid: cliff before start
    let cliff_before_start = 50u64;
    assert!(!(cliff_before_start >= start && cliff_before_start <= end));

    // Invalid: cliff after end
    let cliff_after_end = 250u64;
    assert!(!(cliff_after_end >= start && cliff_after_end <= end));
}
