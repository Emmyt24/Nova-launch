# Implementation Plan: Stateful Contract Fuzzing

## Overview

This plan implements a stateful property-based fuzzing system for the token factory contract. The implementation follows a bottom-up approach: first building the data structures and model, then the action generator, then the executor, and finally the property tests. Each step builds on the previous and includes validation through tests.

## Tasks

- [ ] 1. Define core data structures for stateful fuzzing
  - Create `Action` enum with all operation variants (Initialize, UpdateFees, GetState, GetTokenCount, GetTokenInfo)
  - Create `ContractModel` struct to track expected contract state
  - Create `ActionResult` enum to capture operation results
  - Add these types to the top of `fuzz_test.rs` before existing tests
  - _Requirements: 1.2, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 1.1 Write unit tests for ContractModel
  - Test model initialization with default values
  - Test model state updates for each action type
  - Test that model correctly tracks initialization state
  - _Requirements: 2.4_

- [ ] 2. Implement action generator strategies
  - [ ] 2.1 Create address pool strategy
    - Implement `address_strategy()` that generates from a pool of 5 addresses
    - Use `Address::generate()` to create the pool
    - _Requirements: 1.4, 6.1, 6.2_
  
  - [ ] 2.2 Create fee value strategy
    - Implement `fee_strategy()` that generates values including 0, negative, and positive fees
    - Use `prop_oneof!` to combine different fee ranges
    - _Requirements: 1.4, 1.5_
  
  - [ ] 2.3 Create optional fee strategy
    - Implement `option_fee_strategy()` for update_fees parameters
    - Generate Some(fee) and None variants
    - _Requirements: 1.4, 6.2_
  
  - [ ] 2.4 Create action strategy
    - Implement `action_strategy()` that generates all Action variants
    - Use `prop_oneof!` to combine Initialize, UpdateFees, GetState, GetTokenCount, GetTokenInfo
    - Ensure all operation types can be generated
    - _Requirements: 1.2, 1.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  
  - [ ] 2.5 Create action sequence strategy
    - Implement `action_sequence_strategy()` that generates Vec<Action> with length 1-100
    - Use `prop::collection::vec()` with appropriate bounds
    - _Requirements: 1.3_

- [ ]* 2.6 Write property test for generator determinism
  - **Property 2: Generator Produces Deterministic Sequences**
  - **Validates: Requirements 1.1**
  - Generate sequence from seed, regenerate from same seed, assert equality
  - Tag: Feature: stateful-contract-fuzzing, Property 2

- [ ]* 2.7 Write property test for generator coverage
  - **Property 3: Generator Covers All Operation Types**
  - **Validates: Requirements 1.2, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
  - Generate 100+ sequences, verify all action types appear
  - Verify both positive and negative fees appear
  - Tag: Feature: stateful-contract-fuzzing, Property 3

- [ ]* 2.8 Write property test for sequence length bounds
  - **Property 4: Generated Sequences Respect Length Bounds**
  - **Validates: Requirements 1.3**
  - Generate sequences, assert all have length between 1 and 100
  - Tag: Feature: stateful-contract-fuzzing, Property 4

- [ ]* 2.9 Write property test for action structure validity
  - **Property 5: Generated Actions Have Valid Structure**
  - **Validates: Requirements 1.4**
  - Generate actions, verify all parameters are well-formed
  - Tag: Feature: stateful-contract-fuzzing, Property 5

- [ ] 3. Implement action executor
  - [ ] 3.1 Create ActionExecutor struct
    - Define struct with env, client, and model fields
    - Implement `new()` constructor
    - _Requirements: 2.1_
  
  - [ ] 3.2 Implement execute method for Initialize action
    - Call `try_initialize()` on client
    - Update model state on success
    - Handle AlreadyInitialized error gracefully
    - _Requirements: 2.1, 2.3, 2.4, 3.3_
  
  - [ ] 3.3 Implement execute method for UpdateFees action
    - Call `try_update_fees()` on client with mock auth
    - Update model fees on success
    - Handle Unauthorized and InvalidParameters errors gracefully
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 3.6_
  
  - [ ] 3.4 Implement execute method for query actions
    - Implement GetState: call `get_state()` if initialized
    - Implement GetTokenCount: call `get_token_count()` if initialized
    - Implement GetTokenInfo: call `try_get_token_info()` with index
    - Handle uninitialized state by skipping or returning error result
    - _Requirements: 2.1, 2.2, 2.3_

- [ ]* 3.5 Write unit tests for ActionExecutor
  - Test executing each action type individually
  - Test that model updates correctly after successful operations
  - Test that model doesn't update after failed operations
  - Test handling of uninitialized state
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 4. Implement invariant checker
  - [ ] 4.1 Create check_invariants function
    - Define function signature: `fn check_invariants(executor: &ActionExecutor, action: &Action, result: &ActionResult) -> Result<(), String>`
    - _Requirements: 3.1_
  
  - [ ] 4.2 Implement state consistency invariant
    - If initialized, verify contract state matches model (admin, treasury, base_fee, metadata_fee)
    - Return descriptive error message on mismatch
    - _Requirements: 3.1_
  
  - [ ] 4.3 Implement fee non-negativity invariant
    - If initialized, verify base_fee >= 0 and metadata_fee >= 0
    - Return error if fees are negative
    - _Requirements: 3.2_
  
  - [ ] 4.4 Implement double initialization invariant
    - For Initialize actions, verify that second initialization fails
    - Check that first initialization succeeds
    - _Requirements: 3.3_
  
  - [ ] 4.5 Implement authorization invariant
    - For UpdateFees actions, verify unauthorized calls fail
    - Check that admin calls succeed (if fees are valid)
    - _Requirements: 3.6_
  
  - [ ] 4.6 Implement token count invariant
    - For GetTokenCount results, verify count >= 0
    - _Requirements: 3.4_
  
  - [ ] 4.7 Implement token bounds invariant
    - For GetTokenInfo actions, verify out-of-bounds access fails
    - Check that index >= token_count returns error
    - _Requirements: 3.5_

- [ ]* 4.8 Write unit tests for invariant checker
  - Test each invariant with known-good states (should pass)
  - Test each invariant with known-bad states (should fail)
  - Verify error messages are descriptive
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 5. Implement main stateful fuzzing property test
  - [ ] 5.1 Write stateful_fuzz_maintains_invariants test
    - **Property 1: Stateful Execution Maintains Invariants**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
    - Use `proptest!` macro with `ProptestConfig::with_cases(100)`
    - Generate action sequence using `action_sequence_strategy()`
    - Create test environment and contract client
    - Create ActionExecutor with fresh model
    - Loop through actions: execute each, check invariants after each
    - Assert that all invariants pass for entire sequence
    - Tag: Feature: stateful-contract-fuzzing, Property 1
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 6. Add documentation and examples
  - [ ] 6.1 Add module-level documentation
    - Document the stateful fuzzing approach
    - Explain how to interpret test failures
    - Provide example of replay command usage
    - _Requirements: 4.3, 4.5_
  
  - [ ] 6.2 Add inline comments to complex logic
    - Comment invariant checking logic
    - Comment action execution flow
    - Comment generator strategies
    - _Requirements: 5.5_

- [ ] 7. Checkpoint - Run all tests and verify
  - Run `cargo test` to execute all tests including stateful fuzzing
  - Verify that stateful fuzzing test runs 100 iterations
  - Verify that existing tests still pass
  - Verify that test output includes proptest seed information
  - If any issues arise, ask the user for guidance
  - _Requirements: 5.3_

## Notes

- Tasks marked with `*` are optional test tasks that can be skipped for faster MVP
- The main stateful fuzzing test (5.1) is the core deliverable that validates all key requirements
- Proptest automatically handles seed capture and replay (Requirements 4.1, 4.2, 4.4, 4.5)
- Each property test is tagged with its property number for traceability
- The implementation builds incrementally: data structures → generators → executor → invariants → main test
- Unit tests help validate individual components but the property tests provide comprehensive coverage
