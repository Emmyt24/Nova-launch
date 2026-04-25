# Requirements Document

## Introduction

This document specifies requirements for a stateful fuzzing system for the Nova-launch token factory smart contract. The system will stress-test contract logic by generating and executing random sequences of interleaved operations (initialization, fee updates, state queries, token operations) while asserting invariants after each action. The fuzzer must provide deterministic reproducibility through seeded random generation and persist failing test cases for debugging.

## Glossary

- **Stateful_Fuzzer**: The property-based testing system that generates and executes sequences of contract operations while maintaining state
- **Action**: A single contract operation (initialize, update_fees, get_state, get_token_count, get_token_info)
- **Action_Sequence**: An ordered list of Actions generated from a seed
- **Seed**: A deterministic value used to generate reproducible Action_Sequences
- **Invariant**: A property that must hold true after every Action execution
- **Failing_Seed**: A Seed value that causes an invariant violation or contract panic
- **Replay_Command**: A command-line instruction that reproduces a specific test failure using a Failing_Seed
- **Contract_State**: The complete state of the token factory including admin, treasury, fees, and token registry

## Requirements

### Requirement 1: Deterministic Action Sequence Generation

**User Story:** As a developer, I want action sequences to be generated deterministically from seeds, so that I can reproduce any test failure exactly.

#### Acceptance Criteria

1. WHEN the Stateful_Fuzzer is provided with a Seed, THE Stateful_Fuzzer SHALL generate the same Action_Sequence every time
2. WHEN generating an Action_Sequence, THE Stateful_Fuzzer SHALL include multiple operation types (initialize, update_fees, get_state, get_token_count, get_token_info)
3. WHEN generating an Action_Sequence, THE Stateful_Fuzzer SHALL produce sequences of varying lengths between 1 and 100 Actions
4. WHEN generating Actions, THE Stateful_Fuzzer SHALL generate valid parameter values appropriate for each operation type
5. WHEN generating fee values, THE Stateful_Fuzzer SHALL include both valid (non-negative) and invalid (negative) values to test error handling

### Requirement 2: Stateful Action Execution

**User Story:** As a developer, I want the fuzzer to execute action sequences while maintaining contract state, so that I can test realistic multi-operation scenarios.

#### Acceptance Criteria

1. WHEN executing an Action_Sequence, THE Stateful_Fuzzer SHALL maintain Contract_State across all Actions
2. WHEN an Action requires the contract to be initialized, THE Stateful_Fuzzer SHALL only execute that Action if initialization has occurred
3. WHEN an Action fails with an expected error, THE Stateful_Fuzzer SHALL continue executing subsequent Actions
4. WHEN an Action succeeds, THE Stateful_Fuzzer SHALL update the internal Contract_State model to match the expected contract state
5. WHEN executing update_fees Actions, THE Stateful_Fuzzer SHALL track whether the caller is authorized

### Requirement 3: Invariant Assertion

**User Story:** As a developer, I want invariants to be checked after each action, so that state corruption is detected immediately.

#### Acceptance Criteria

1. WHEN an Action completes, THE Stateful_Fuzzer SHALL assert that the Contract_State matches the internal state model
2. WHEN fees are queried, THE Stateful_Fuzzer SHALL assert that base_fee and metadata_fee are non-negative
3. WHEN the contract is initialized, THE Stateful_Fuzzer SHALL assert that subsequent initialization attempts fail
4. WHEN get_token_count is called, THE Stateful_Fuzzer SHALL assert that the returned count is non-negative
5. WHEN get_token_info is called with an invalid index, THE Stateful_Fuzzer SHALL assert that an error is returned
6. WHEN update_fees is called by a non-admin address, THE Stateful_Fuzzer SHALL assert that an Unauthorized error is returned

### Requirement 4: Failure Persistence and Replay

**User Story:** As a developer, I want failing test seeds to be saved and replay commands to be generated, so that I can debug failures efficiently.

#### Acceptance Criteria

1. WHEN an invariant violation occurs, THE Stateful_Fuzzer SHALL capture the Failing_Seed
2. WHEN a test failure is detected, THE Stateful_Fuzzer SHALL output the Failing_Seed to the test output
3. WHEN a test failure is detected, THE Stateful_Fuzzer SHALL generate a Replay_Command that can reproduce the failure
4. WHEN a Replay_Command is executed, THE Stateful_Fuzzer SHALL run only the specific failing test case with the captured Seed
5. THE Replay_Command SHALL use the standard proptest replay format compatible with the PROPTEST_CASES environment variable

### Requirement 5: Integration with Existing Test Infrastructure

**User Story:** As a developer, I want stateful fuzzing to integrate with the existing proptest-based test suite, so that I can run all tests together.

#### Acceptance Criteria

1. THE Stateful_Fuzzer SHALL use the proptest library for property-based test execution
2. THE Stateful_Fuzzer SHALL be defined in the existing fuzz_test.rs file
3. WHEN running cargo test, THE Stateful_Fuzzer SHALL execute alongside existing property tests
4. THE Stateful_Fuzzer SHALL use proptest configuration to control the number of test iterations
5. THE Stateful_Fuzzer SHALL follow Rust and Soroban SDK testing conventions

### Requirement 6: Comprehensive Operation Coverage

**User Story:** As a developer, I want the fuzzer to exercise all contract operations, so that I can find bugs in any part of the system.

#### Acceptance Criteria

1. THE Stateful_Fuzzer SHALL generate initialize Actions with random admin, treasury, and fee parameters
2. THE Stateful_Fuzzer SHALL generate update_fees Actions with random caller addresses and fee values
3. THE Stateful_Fuzzer SHALL generate get_state Actions to verify state consistency
4. THE Stateful_Fuzzer SHALL generate get_token_count Actions to verify token registry state
5. THE Stateful_Fuzzer SHALL generate get_token_info Actions with random indices including out-of-bounds values
6. THE Stateful_Fuzzer SHALL interleave different operation types within a single Action_Sequence
