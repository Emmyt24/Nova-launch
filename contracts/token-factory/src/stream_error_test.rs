#![cfg(test)]

use crate::types::Error;

/// Test that StreamNotFound error returns correct error code (27)
#[test]
fn test_stream_not_found_error_code() {
    let error = Error::StreamNotFound;
    assert_eq!(error as u32, 27);
}

/// Test that InvalidSchedule error returns correct error code (30)
#[test]
fn test_invalid_schedule_error_code() {
    let error = Error::InvalidSchedule;
    assert_eq!(error as u32, 30);
}

/// Test that CliffNotReached error returns correct error code (28)
#[test]
fn test_cliff_not_reached_error_code() {
    let error = Error::CliffNotReached;
    assert_eq!(error as u32, 28);
}

/// Test that NothingToClaim error returns correct error code (65)
#[test]
fn test_nothing_to_claim_error_code() {
    let error = Error::NothingToClaim;
    assert_eq!(error as u32, 65);
}

/// Test that StreamPaused error returns correct error code (31)
#[test]
fn test_stream_paused_error_code() {
    let error = Error::StreamPaused;
    assert_eq!(error as u32, 31);
}

/// Test that StreamCancelled error returns correct error code (29)
#[test]
fn test_stream_cancelled_error_code() {
    let error = Error::StreamCancelled;
    assert_eq!(error as u32, 29);
}

/// Test stream error codes remain stable
#[test]
fn test_stream_errors_sequential() {
    assert_eq!(Error::StreamNotFound as u32, 27);
    assert_eq!(Error::InvalidSchedule as u32, 30);
    assert_eq!(Error::CliffNotReached as u32, 28);
    assert_eq!(Error::NothingToClaim as u32, 65);
    assert_eq!(Error::StreamPaused as u32, 31);
    assert_eq!(Error::StreamCancelled as u32, 29);
}

/// Test error equality and cloning
#[test]
fn test_stream_error_traits() {
    let e1 = Error::StreamNotFound;
    let e2 = e1;
    assert_eq!(e1, e2);
    
    let e3 = Error::StreamPaused;
    assert_ne!(e1, e3);
}

/// Mock function simulating stream lookup failure
fn mock_get_stream(stream_id: u32, max_id: u32) -> Result<(), Error> {
    if stream_id >= max_id {
        return Err(Error::StreamNotFound);
    }
    Ok(())
}

/// Mock function simulating schedule validation
fn mock_validate_schedule(start: u64, cliff: u64, end: u64) -> Result<(), Error> {
    if cliff < start || end <= cliff {
        return Err(Error::InvalidSchedule);
    }
    Ok(())
}

/// Mock function simulating cliff check
fn mock_check_cliff(current_time: u64, cliff_time: u64) -> Result<(), Error> {
    if current_time < cliff_time {
        return Err(Error::CliffNotReached);
    }
    Ok(())
}

/// Mock function simulating claim availability
fn mock_check_claimable(amount: i128) -> Result<(), Error> {
    if amount == 0 {
        return Err(Error::NothingToClaim);
    }
    Ok(())
}

/// Mock function simulating stream pause check
fn mock_check_paused(is_paused: bool) -> Result<(), Error> {
    if is_paused {
        return Err(Error::StreamPaused);
    }
    Ok(())
}

/// Mock function simulating stream cancellation check
fn mock_check_cancelled(is_cancelled: bool) -> Result<(), Error> {
    if is_cancelled {
        return Err(Error::StreamCancelled);
    }
    Ok(())
}

/// Test StreamNotFound error path
#[test]
fn test_stream_not_found_path() {
    let result = mock_get_stream(10, 5);
    assert_eq!(result, Err(Error::StreamNotFound));
    
    let result_ok = mock_get_stream(3, 5);
    assert!(result_ok.is_ok());
}

/// Test InvalidSchedule error path
#[test]
fn test_invalid_schedule_path() {
    // Cliff before start
    let result = mock_validate_schedule(100, 50, 200);
    assert_eq!(result, Err(Error::InvalidSchedule));
    
    // End before cliff
    let result = mock_validate_schedule(100, 150, 140);
    assert_eq!(result, Err(Error::InvalidSchedule));
    
    // Valid schedule
    let result_ok = mock_validate_schedule(100, 150, 200);
    assert!(result_ok.is_ok());
}

/// Test CliffNotReached error path
#[test]
fn test_cliff_not_reached_path() {
    let result = mock_check_cliff(100, 200);
    assert_eq!(result, Err(Error::CliffNotReached));
    
    let result_ok = mock_check_cliff(200, 100);
    assert!(result_ok.is_ok());
}

/// Test NothingToClaim error path
#[test]
fn test_nothing_to_claim_path() {
    let result = mock_check_claimable(0);
    assert_eq!(result, Err(Error::NothingToClaim));
    
    let result_ok = mock_check_claimable(100);
    assert!(result_ok.is_ok());
}

/// Test StreamPaused error path
#[test]
fn test_stream_paused_path() {
    let result = mock_check_paused(true);
    assert_eq!(result, Err(Error::StreamPaused));
    
    let result_ok = mock_check_paused(false);
    assert!(result_ok.is_ok());
}

/// Test StreamCancelled error path
#[test]
fn test_stream_cancelled_path() {
    let result = mock_check_cancelled(true);
    assert_eq!(result, Err(Error::StreamCancelled));
    
    let result_ok = mock_check_cancelled(false);
    assert!(result_ok.is_ok());
}

/// Test error propagation in nested calls
#[test]
fn test_error_propagation() {
    fn nested_operation(stream_id: u32, is_paused: bool) -> Result<(), Error> {
        mock_get_stream(stream_id, 10)?;
        mock_check_paused(is_paused)?;
        Ok(())
    }
    
    // StreamNotFound propagates
    assert_eq!(nested_operation(20, false), Err(Error::StreamNotFound));
    
    // StreamPaused propagates
    assert_eq!(nested_operation(5, true), Err(Error::StreamPaused));
    
    // Success case
    assert!(nested_operation(5, false).is_ok());
}

/// Test multiple error conditions in sequence
#[test]
fn test_multiple_error_conditions() {
    fn validate_stream_claim(
        stream_id: u32,
        max_id: u32,
        is_paused: bool,
        is_cancelled: bool,
        current_time: u64,
        cliff_time: u64,
        claimable: i128,
    ) -> Result<(), Error> {
        mock_get_stream(stream_id, max_id)?;
        mock_check_paused(is_paused)?;
        mock_check_cancelled(is_cancelled)?;
        mock_check_cliff(current_time, cliff_time)?;
        mock_check_claimable(claimable)?;
        Ok(())
    }
    
    // Each error condition
    assert_eq!(validate_stream_claim(100, 10, false, false, 200, 100, 50), Err(Error::StreamNotFound));
    assert_eq!(validate_stream_claim(5, 10, true, false, 200, 100, 50), Err(Error::StreamPaused));
    assert_eq!(validate_stream_claim(5, 10, false, true, 200, 100, 50), Err(Error::StreamCancelled));
    assert_eq!(validate_stream_claim(5, 10, false, false, 50, 100, 50), Err(Error::CliffNotReached));
    assert_eq!(validate_stream_claim(5, 10, false, false, 200, 100, 0), Err(Error::NothingToClaim));
    
    // Success
    assert!(validate_stream_claim(5, 10, false, false, 200, 100, 50).is_ok());
}
