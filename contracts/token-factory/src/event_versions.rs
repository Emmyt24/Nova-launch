/// Event Version Constants
///
/// This module defines version identifiers for all event schemas in the token factory contract.
///
/// # Version Management
///
/// When introducing a new event version:
/// 1. Create a new constant with an incremented version number (e.g., `INIT_VERSION_V2 = 2`)
/// 2. Update the event emission function to use the new version
/// 3. Document the schema changes in the event function's documentation
/// 4. Update tests to validate both versions during the migration period
/// 5. Emit both old and new versions during the transition period
/// 6. Remove the old version after the deprecation timeline
///
/// # Schema Immutability
///
/// Once an event version is deployed, its schema MUST NOT be modified:
/// - Topic structure (indexed parameters) must remain unchanged
/// - Payload structure (non-indexed data) must remain unchanged
/// - Data types for all parameters must remain unchanged
///
/// Any schema changes require creating a new version with an incremented version number.

// Current event versions (all v1)
pub const INIT_VERSION: u32 = 1;
pub const TOKEN_REGISTERED_VERSION: u32 = 1;
pub const ADMIN_TRANSFER_VERSION: u32 = 1;
pub const PAUSE_VERSION: u32 = 1;
pub const UNPAUSE_VERSION: u32 = 1;
pub const FEES_UPDATED_VERSION: u32 = 1;
pub const ADMIN_BURN_VERSION: u32 = 1;
pub const CLAWBACK_VERSION: u32 = 1;
pub const TOKEN_BURNED_VERSION: u32 = 1;

// Governance event versions (v1)
pub const PROPOSAL_CREATED_VERSION: u32 = 1;
pub const VOTE_CAST_VERSION: u32 = 1;
pub const PROPOSAL_QUEUED_VERSION: u32 = 1;
pub const PROPOSAL_EXECUTED_VERSION: u32 = 1;
pub const PROPOSAL_CANCELLED_VERSION: u32 = 1;
