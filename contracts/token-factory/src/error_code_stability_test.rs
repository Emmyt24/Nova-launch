//! Error Code Stability Tests
//!
//! This module protects API consumers by enforcing stable contract error-code mappings.
//! Any change to error codes will break client integrations, so these tests ensure:
//!
//! 1. Error codes remain stable across contract versions
//! 2. No accidental enum reordering occurs
//! 3. New errors are added with explicit codes, not auto-incremented
//! 4. Common failure paths have well-known, documented error codes
//!
//! ## Why This Matters
//!
//! Smart contract error codes are part of the public API. Client applications,
//! indexers, and monitoring systems rely on specific error codes to handle
//! failures correctly. Changing error codes is a breaking change that can cause:
//!
//! - Incorrect error handling in client applications
//! - Failed transactions being misclassified
//! - Monitoring alerts triggering incorrectly
//! - User-facing error messages showing wrong information
//!
//! ## Test Coverage
//!
//! These tests cover all critical error scenarios:
//! - Authentication failures (Unauthorized)
//! - Invalid parameters and validation errors
//! - Resource not found errors
//! - Contract state errors (paused, already initialized)
//! - Replay protection (already executed, already voted)
//! - Vault-specific errors (locked, claimed, cancelled)
//! - Milestone verification errors (invalid proof, proof required)
//!
//! ## CI Integration
//!
//! These tests run in CI to detect:
//! - Accidental enum reordering
//! - Error code drift
//! - Breaking changes to error mappings

#![cfg(test)]

use super::types::Error;

/// Canonical error code mappings that MUST remain stable.
///
/// This is the source of truth for error codes. Any change here
/// requires a major version bump and migration guide for clients.
#[test]
fn test_error_code_stability_core_errors() {
    // Core validation errors (1-10)
    assert_eq!(Error::InsufficientFee as u32, 1, "InsufficientFee must be code 1");
    assert_eq!(Error::Unauthorized as u32, 2, "Unauthorized must be code 2");
    assert_eq!(Error::InvalidParameters as u32, 3, "InvalidParameters must be code 3");
    assert_eq!(Error::TokenNotFound as u32, 4, "TokenNotFound must be code 4");
    assert_eq!(Error::MetadataAlreadySet as u32, 5, "MetadataAlreadySet must be code 5");
    assert_eq!(Error::AlreadyInitialized as u32, 6, "AlreadyInitialized must be code 6");
    assert_eq!(Error::InsufficientBalance as u32, 7, "InsufficientBalance must be code 7");
    assert_eq!(Error::ArithmeticError as u32, 8, "ArithmeticError must be code 8");
    assert_eq!(Error::BatchTooLarge as u32, 9, "BatchTooLarge must be code 9");
    assert_eq!(Error::InvalidAmount as u32, 10, "InvalidAmount must be code 10");
}

#[test]
fn test_error_code_stability_token_errors() {
    // Token-specific errors (11-18)
    assert_eq!(Error::ClawbackDisabled as u32, 11, "ClawbackDisabled must be code 11");
    assert_eq!(Error::InvalidBurnAmount as u32, 12, "InvalidBurnAmount must be code 12");
    assert_eq!(Error::BurnAmountExceedsBalance as u32, 13, "BurnAmountExceedsBalance must be code 13");
    assert_eq!(Error::ContractPaused as u32, 14, "ContractPaused must be code 14");
    assert_eq!(Error::TimelockNotExpired as u32, 15, "TimelockNotExpired must be code 15");
    assert_eq!(Error::ChangeAlreadyExecuted as u32, 16, "ChangeAlreadyExecuted must be code 16");
    assert_eq!(Error::MaxSupplyExceeded as u32, 17, "MaxSupplyExceeded must be code 17");
    assert_eq!(Error::InvalidMaxSupply as u32, 18, "InvalidMaxSupply must be code 18");
}

#[test]
fn test_error_code_stability_treasury_errors() {
    // Treasury errors (19-20)
    assert_eq!(Error::WithdrawalCapExceeded as u32, 19, "WithdrawalCapExceeded must be code 19");
    assert_eq!(Error::RecipientNotAllowed as u32, 20, "RecipientNotAllowed must be code 20");
}

#[test]
fn test_error_code_stability_validation_errors() {
    // Validation errors (21-26)
    assert_eq!(Error::MissingAdmin as u32, 21, "MissingAdmin must be code 21");
    assert_eq!(Error::MissingTreasury as u32, 22, "MissingTreasury must be code 22");
    assert_eq!(Error::InvalidBaseFee as u32, 23, "InvalidBaseFee must be code 23");
    assert_eq!(Error::InvalidMetadataFee as u32, 24, "InvalidMetadataFee must be code 24");
    assert_eq!(Error::InconsistentTokenCount as u32, 25, "InconsistentTokenCount must be code 25");
    assert_eq!(Error::TokenPaused as u32, 26, "TokenPaused must be code 26");
}

#[test]
fn test_error_code_stability_stream_errors() {
    // Stream errors (27-31)
    assert_eq!(Error::StreamNotFound as u32, 27, "StreamNotFound must be code 27");
    assert_eq!(Error::CliffNotReached as u32, 28, "CliffNotReached must be code 28");
    assert_eq!(Error::StreamCancelled as u32, 29, "StreamCancelled must be code 29");
    assert_eq!(Error::InvalidSchedule as u32, 30, "InvalidSchedule must be code 30");
    assert_eq!(Error::StreamPaused as u32, 31, "StreamPaused must be code 31");
}

#[test]
fn test_error_code_stability_governance_errors() {
    // Governance errors (32-41)
    assert_eq!(Error::VotingNotStarted as u32, 32, "VotingNotStarted must be code 32");
    assert_eq!(Error::VotingEnded as u32, 33, "VotingEnded must be code 33");
    assert_eq!(Error::ProposalExecuted as u32, 34, "ProposalExecuted must be code 34");
    assert_eq!(Error::ProposalCancelled as u32, 35, "ProposalCancelled must be code 35");
    assert_eq!(Error::InvalidVote as u32, 36, "InvalidVote must be code 36");
    assert_eq!(Error::ProposalInTerminalState as u32, 37, "ProposalInTerminalState must be code 37");
    assert_eq!(Error::InvalidStateTransition as u32, 38, "InvalidStateTransition must be code 38");
    assert_eq!(Error::QuorumNotMet as u32, 39, "QuorumNotMet must be code 39");
    assert_eq!(Error::ProposalNotFound as u32, 40, "ProposalNotFound must be code 40");
    assert_eq!(Error::ProposalNotQueued as u32, 41, "ProposalNotQueued must be code 41");
}

#[test]
fn test_error_code_stability_milestone_verification_errors() {
    // Milestone verification errors (42-43)
    assert_eq!(Error::InvalidProof as u32, 42, "InvalidProof must be code 42");
    assert_eq!(Error::ProofRequired as u32, 43, "ProofRequired must be code 43");
}

#[test]
fn test_error_code_stability_misc_errors() {
    // Miscellaneous errors (44-51)
    assert_eq!(Error::InvalidTimeWindow as u32, 44, "InvalidTimeWindow must be code 44");
    assert_eq!(Error::PayloadTooLarge as u32, 45, "PayloadTooLarge must be code 45");
    assert_eq!(Error::AlreadyVoted as u32, 46, "AlreadyVoted must be code 46");
    assert_eq!(Error::VotingClosed as u32, 47, "VotingClosed must be code 47");
    assert_eq!(Error::AddressFrozen as u32, 48, "AddressFrozen must be code 48");
    assert_eq!(Error::FreezeNotEnabled as u32, 49, "FreezeNotEnabled must be code 49");
    assert_eq!(Error::AddressNotFrozen as u32, 50, "AddressNotFrozen must be code 50");
    assert_eq!(Error::VerificationUnavailable as u32, 51, "VerificationUnavailable must be code 51");
}

#[test]
fn test_error_code_stability_vault_errors() {
    // Vault errors (60-65)
    assert_eq!(Error::VaultNotFound as u32, 60, "VaultNotFound must be code 60");
    assert_eq!(Error::VaultLocked as u32, 61, "VaultLocked must be code 61");
    assert_eq!(Error::VaultAlreadyClaimed as u32, 62, "VaultAlreadyClaimed must be code 62");
    assert_eq!(Error::VaultCancelled as u32, 63, "VaultCancelled must be code 63");
    assert_eq!(Error::InvalidVaultConfig as u32, 64, "InvalidVaultConfig must be code 64");
    assert_eq!(Error::NothingToClaim as u32, 65, "NothingToClaim must be code 65");
}

/// Test common authentication failure scenarios
#[test]
fn test_auth_failure_error_codes() {
    // Unauthorized is the primary auth error
    assert_eq!(Error::Unauthorized as u32, 2);
    
    // Related auth/permission errors
    assert_eq!(Error::RecipientNotAllowed as u32, 20);
    assert_eq!(Error::AddressFrozen as u32, 48);
}

/// Test common validation failure scenarios
#[test]
fn test_validation_failure_error_codes() {
    // Parameter validation errors
    assert_eq!(Error::InvalidParameters as u32, 3);
    assert_eq!(Error::InvalidAmount as u32, 10);
    assert_eq!(Error::InvalidBurnAmount as u32, 12);
    assert_eq!(Error::InvalidMaxSupply as u32, 18);
    assert_eq!(Error::InvalidBaseFee as u32, 23);
    assert_eq!(Error::InvalidMetadataFee as u32, 24);
    assert_eq!(Error::InvalidSchedule as u32, 30);
    assert_eq!(Error::InvalidVote as u32, 36);
    assert_eq!(Error::InvalidTimeWindow as u32, 44);
    assert_eq!(Error::InvalidVaultConfig as u32, 64);
}

/// Test common not-found error scenarios
#[test]
fn test_not_found_error_codes() {
    assert_eq!(Error::TokenNotFound as u32, 4);
    assert_eq!(Error::StreamNotFound as u32, 27);
    assert_eq!(Error::ProposalNotFound as u32, 40);
    assert_eq!(Error::VaultNotFound as u32, 60);
}

/// Test contract paused scenarios
#[test]
fn test_paused_error_codes() {
    assert_eq!(Error::ContractPaused as u32, 14);
    assert_eq!(Error::TokenPaused as u32, 26);
    assert_eq!(Error::StreamPaused as u32, 31);
}

/// Test replay protection and idempotency errors
#[test]
fn test_replay_protection_error_codes() {
    // These errors prevent replay attacks and duplicate operations
    assert_eq!(Error::AlreadyInitialized as u32, 6);
    assert_eq!(Error::MetadataAlreadySet as u32, 5);
    assert_eq!(Error::ChangeAlreadyExecuted as u32, 16);
    assert_eq!(Error::ProposalExecuted as u32, 34);
    assert_eq!(Error::AlreadyVoted as u32, 46);
    assert_eq!(Error::VaultAlreadyClaimed as u32, 62);
}

/// Test milestone verification error codes
#[test]
fn test_milestone_verification_error_codes() {
    assert_eq!(Error::InvalidProof as u32, 42);
    assert_eq!(Error::ProofRequired as u32, 43);
    assert_eq!(Error::VerificationUnavailable as u32, 51);
}

/// Test vault lifecycle error codes
#[test]
fn test_vault_lifecycle_error_codes() {
    assert_eq!(Error::VaultNotFound as u32, 60);
    assert_eq!(Error::VaultLocked as u32, 61);
    assert_eq!(Error::VaultAlreadyClaimed as u32, 62);
    assert_eq!(Error::VaultCancelled as u32, 63);
    assert_eq!(Error::InvalidVaultConfig as u32, 64);
    assert_eq!(Error::NothingToClaim as u32, 65);
}

/// Comprehensive test ensuring no error code collisions
#[test]
fn test_no_error_code_collisions() {
    use soroban_sdk::vec;
    
    let error_codes = [
        Error::InsufficientFee as u32,
        Error::Unauthorized as u32,
        Error::InvalidParameters as u32,
        Error::TokenNotFound as u32,
        Error::MetadataAlreadySet as u32,
        Error::AlreadyInitialized as u32,
        Error::InsufficientBalance as u32,
        Error::ArithmeticError as u32,
        Error::BatchTooLarge as u32,
        Error::InvalidAmount as u32,
        Error::ClawbackDisabled as u32,
        Error::InvalidBurnAmount as u32,
        Error::BurnAmountExceedsBalance as u32,
        Error::ContractPaused as u32,
        Error::TimelockNotExpired as u32,
        Error::ChangeAlreadyExecuted as u32,
        Error::MaxSupplyExceeded as u32,
        Error::InvalidMaxSupply as u32,
        Error::WithdrawalCapExceeded as u32,
        Error::RecipientNotAllowed as u32,
        Error::MissingAdmin as u32,
        Error::MissingTreasury as u32,
        Error::InvalidBaseFee as u32,
        Error::InvalidMetadataFee as u32,
        Error::InconsistentTokenCount as u32,
        Error::TokenPaused as u32,
        Error::StreamNotFound as u32,
        Error::CliffNotReached as u32,
        Error::StreamCancelled as u32,
        Error::InvalidSchedule as u32,
        Error::StreamPaused as u32,
        Error::VotingNotStarted as u32,
        Error::VotingEnded as u32,
        Error::ProposalExecuted as u32,
        Error::ProposalCancelled as u32,
        Error::InvalidVote as u32,
        Error::ProposalInTerminalState as u32,
        Error::InvalidStateTransition as u32,
        Error::QuorumNotMet as u32,
        Error::ProposalNotFound as u32,
        Error::ProposalNotQueued as u32,
        Error::InvalidProof as u32,
        Error::ProofRequired as u32,
        Error::InvalidTimeWindow as u32,
        Error::PayloadTooLarge as u32,
        Error::AlreadyVoted as u32,
        Error::VotingClosed as u32,
        Error::AddressFrozen as u32,
        Error::FreezeNotEnabled as u32,
        Error::AddressNotFrozen as u32,
        Error::VerificationUnavailable as u32,
        Error::VaultNotFound as u32,
        Error::VaultLocked as u32,
        Error::VaultAlreadyClaimed as u32,
        Error::VaultCancelled as u32,
        Error::InvalidVaultConfig as u32,
        Error::NothingToClaim as u32,
    ];
    
    // Check for duplicates by comparing each pair
    for i in 0..error_codes.len() {
        for j in (i + 1)..error_codes.len() {
            assert_ne!(
                error_codes[i], error_codes[j],
                "Error code collision detected at indices {} and {}: both have code {}",
                i, j, error_codes[i]
            );
        }
    }
}

/// Test that error codes are in expected ranges
#[test]
fn test_error_code_ranges() {
    // Core errors: 1-10
    assert!((Error::InsufficientFee as u32) >= 1 && (Error::InsufficientFee as u32) <= 10);
    assert!((Error::InvalidAmount as u32) >= 1 && (Error::InvalidAmount as u32) <= 10);
    
    // Token errors: 11-18
    assert!((Error::ClawbackDisabled as u32) >= 11 && (Error::ClawbackDisabled as u32) <= 18);
    
    // Treasury errors: 19-20
    assert!((Error::WithdrawalCapExceeded as u32) >= 19 && (Error::WithdrawalCapExceeded as u32) <= 20);
    
    // Validation errors: 21-26
    assert!((Error::MissingAdmin as u32) >= 21 && (Error::MissingAdmin as u32) <= 26);
    
    // Stream errors: 27-31
    assert!((Error::StreamNotFound as u32) >= 27 && (Error::StreamNotFound as u32) <= 31);
    
    // Governance errors: 32-41
    assert!((Error::VotingNotStarted as u32) >= 32 && (Error::VotingNotStarted as u32) <= 41);
    
    // Milestone verification: 42-43
    assert!((Error::InvalidProof as u32) >= 42 && (Error::InvalidProof as u32) <= 43);
    
    // Misc errors: 44-51
    assert!((Error::InvalidTimeWindow as u32) >= 44 && (Error::InvalidTimeWindow as u32) <= 51);
    
    // Vault errors: 60-65
    assert!((Error::VaultNotFound as u32) >= 60 && (Error::VaultNotFound as u32) <= 65);
}

/// Documentation test: Ensure error codes are well-documented
///
/// This test serves as living documentation for error code categories.
#[test]
fn test_error_code_documentation() {
    // This test always passes but serves as documentation
    
    // Category 1-10: Core validation and initialization errors
    let _core_errors = [
        Error::InsufficientFee,
        Error::Unauthorized,
        Error::InvalidParameters,
        Error::TokenNotFound,
        Error::MetadataAlreadySet,
        Error::AlreadyInitialized,
        Error::InsufficientBalance,
        Error::ArithmeticError,
        Error::BatchTooLarge,
        Error::InvalidAmount,
    ];
    
    // Category 11-18: Token-specific errors
    let _token_errors = [
        Error::ClawbackDisabled,
        Error::InvalidBurnAmount,
        Error::BurnAmountExceedsBalance,
        Error::ContractPaused,
        Error::TimelockNotExpired,
        Error::ChangeAlreadyExecuted,
        Error::MaxSupplyExceeded,
        Error::InvalidMaxSupply,
    ];
    
    // Category 19-20: Treasury errors
    let _treasury_errors = [
        Error::WithdrawalCapExceeded,
        Error::RecipientNotAllowed,
    ];
    
    // Category 21-26: Validation errors
    let _validation_errors = [
        Error::MissingAdmin,
        Error::MissingTreasury,
        Error::InvalidBaseFee,
        Error::InvalidMetadataFee,
        Error::InconsistentTokenCount,
        Error::TokenPaused,
    ];
    
    // Category 27-31: Stream errors
    let _stream_errors = [
        Error::StreamNotFound,
        Error::CliffNotReached,
        Error::StreamCancelled,
        Error::InvalidSchedule,
        Error::StreamPaused,
    ];
    
    // Category 32-41: Governance errors
    let _governance_errors = [
        Error::VotingNotStarted,
        Error::VotingEnded,
        Error::ProposalExecuted,
        Error::ProposalCancelled,
        Error::InvalidVote,
        Error::ProposalInTerminalState,
        Error::InvalidStateTransition,
        Error::QuorumNotMet,
        Error::ProposalNotFound,
        Error::ProposalNotQueued,
    ];
    
    // Category 42-43: Milestone verification errors
    let _milestone_errors = [
        Error::InvalidProof,
        Error::ProofRequired,
    ];
    
    // Category 44-51: Miscellaneous errors
    let _misc_errors = [
        Error::InvalidTimeWindow,
        Error::PayloadTooLarge,
        Error::AlreadyVoted,
        Error::VotingClosed,
        Error::AddressFrozen,
        Error::FreezeNotEnabled,
        Error::AddressNotFrozen,
        Error::VerificationUnavailable,
    ];
    
    // Category 60-65: Vault errors
    let _vault_errors = [
        Error::VaultNotFound,
        Error::VaultLocked,
        Error::VaultAlreadyClaimed,
        Error::VaultCancelled,
        Error::InvalidVaultConfig,
        Error::NothingToClaim,
    ];
    
    assert!(true, "Error code categories documented");
}
