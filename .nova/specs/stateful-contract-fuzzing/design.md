# Design Document: Stateful Contract Fuzzing

## Overview

This design implements a stateful property-based fuzzing system for the Nova-launch token factory smart contract using proptest. The system generates deterministic sequences of contract operations, executes them while maintaining an internal state model, and asserts invariants after each action. When failures occur, the system captures the seed and provides replay commands for debugging.

The design follows a model-based testing approach where an internal Rust model tracks expected contract state and is compared against actual contract state after each operation.

## Architecture

The stateful fuzzer consists of four main components:

1. **Action Generator**: Uses proptest strategies to generate deterministic sequences of contract operations from a seed
2. **State Model**: Maintains an in-memory representation of expected contract state
3. **Action Executor**: Executes actions against the actual contract and updates the state model
4. **Invariant Checker**: Validates that contract state matches the model and that invariants hold

```
┌─────────────────────────────────────────────────────────────┐
│                     Proptest Framework                      │
│  (Seed Management, Shrinking, Replay)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Action Generator (Strategies)                  │
│  - Initialize(admin, treasury, base_fee, metadata_fee)      │
│  - UpdateFees(caller, base_fee, metadata_fee)               │
│  - GetState()                                               │
│  - GetTokenCount()                                          │
│  - GetTokenInfo(index)                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Action Executor                           │
│  - Executes action against contract                         │
│  - Updates State Model                                      │
│  - Handles expected errors                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Invariant Checker                          │
│  - Contract state == Model state                            │
│  - Fees are non-negative                                    │
│  - Double initialization fails                              │
│  - Unauthorized access fails                                │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Action Enum

Represents all possible contract operations:

```rust
#[derive(Debug, Clone)]
enum Action {
    Initialize {
        admin: Address,
        treasury: Address,
        base_fee: i128,
        metadata_fee: i128,
    },
    UpdateFees {
        caller: Address,
        base_fee: Option<i128>,
        metadata_fee: Option<i128>,
    },
    GetState,
    GetTokenCount,
    GetTokenInfo { index: u32 },
}
```

### State Model

Tracks expected contract state:

```rust
#[derive(Debug, Clone)]
struct ContractModel {
    initialized: bool,
    admin: Option<Address>,
    treasury: Option<Address>,
    base_fee: i128,
    metadata_fee: i128,
    token_count: u32,
}

impl ContractModel {
    fn new() -> Self {
        ContractModel {
            initialized: false,
            admin: None,
            treasury: None,
            base_fee: 0,
            metadata_fee: 0,
            token_count: 0,
        }
    }
    
    fn apply_action(&mut self, action: &Action, result: &ActionResult) {
        // Update model based on action and its result
    }
}
```

### Action Generator Strategies

Proptest strategies for generating actions:

```rust
// Generate random addresses
fn address_strategy(env: &Env) -> impl Strategy<Value = Address> {
    // Generate from a pool of 5 addresses for better collision testing
}

// Generate fee values (including negative for error testing)
fn fee_strategy() -> impl Strategy<Value = i128> {
    prop_oneof![
        Just(0i128),
        Just(-1i128),
        1i128..1_000_000_000i128,
    ]
}

// Generate individual actions
fn action_strategy(env: &Env) -> impl Strategy<Value = Action> {
    prop_oneof![
        // Initialize action
        (address_strategy(env), address_strategy(env), fee_strategy(), fee_strategy())
            .prop_map(|(admin, treasury, base_fee, metadata_fee)| {
                Action::Initialize { admin, treasury, base_fee, metadata_fee }
            }),
        
        // UpdateFees action
        (address_strategy(env), option_fee_strategy(), option_fee_strategy())
            .prop_map(|(caller, base_fee, metadata_fee)| {
                Action::UpdateFees { caller, base_fee, metadata_fee }
            }),
        
        // Query actions
        Just(Action::GetState),
        Just(Action::GetTokenCount),
        
        // GetTokenInfo with random index
        (0u32..100u32).prop_map(|index| Action::GetTokenInfo { index }),
    ]
}

// Generate action sequences
fn action_sequence_strategy(env: &Env) -> impl Strategy<Value = Vec<Action>> {
    prop::collection::vec(action_strategy(env), 1..100)
}
```

### Action Executor

Executes actions and updates the model:

```rust
struct ActionExecutor<'a> {
    env: &'a Env,
    client: &'a TokenFactoryClient<'a>,
    model: ContractModel,
}

impl<'a> ActionExecutor<'a> {
    fn execute(&mut self, action: &Action) -> ActionResult {
        match action {
            Action::Initialize { admin, treasury, base_fee, metadata_fee } => {
                let result = self.client.try_initialize(admin, treasury, base_fee, metadata_fee);
                
                if result.is_ok() && !self.model.initialized {
                    self.model.initialized = true;
                    self.model.admin = Some(admin.clone());
                    self.model.treasury = Some(treasury.clone());
                    self.model.base_fee = *base_fee;
                    self.model.metadata_fee = *metadata_fee;
                }
                
                ActionResult::Initialize(result)
            },
            
            Action::UpdateFees { caller, base_fee, metadata_fee } => {
                let result = self.client.try_update_fees(caller, base_fee, metadata_fee);
                
                if result.is_ok() {
                    if let Some(fee) = base_fee {
                        self.model.base_fee = *fee;
                    }
                    if let Some(fee) = metadata_fee {
                        self.model.metadata_fee = *fee;
                    }
                }
                
                ActionResult::UpdateFees(result)
            },
            
            Action::GetState => {
                if self.model.initialized {
                    let state = self.client.get_state();
                    ActionResult::GetState(Ok(state))
                } else {
                    ActionResult::GetState(Err(()))
                }
            },
            
            Action::GetTokenCount => {
                if self.model.initialized {
                    let count = self.client.get_token_count();
                    ActionResult::GetTokenCount(Ok(count))
                } else {
                    ActionResult::GetTokenCount(Err(()))
                }
            },
            
            Action::GetTokenInfo { index } => {
                let result = self.client.try_get_token_info(index);
                ActionResult::GetTokenInfo(result)
            },
        }
    }
}
```

### Invariant Checker

Validates contract state after each action:

```rust
fn check_invariants(
    executor: &ActionExecutor,
    action: &Action,
    result: &ActionResult,
) -> Result<(), String> {
    // Invariant 1: If initialized, contract state must match model
    if executor.model.initialized {
        let state = executor.client.get_state();
        
        if state.admin != executor.model.admin.as_ref().unwrap() {
            return Err(format!("Admin mismatch: expected {:?}, got {:?}", 
                executor.model.admin, state.admin));
        }
        
        if state.base_fee != executor.model.base_fee {
            return Err(format!("Base fee mismatch: expected {}, got {}", 
                executor.model.base_fee, state.base_fee));
        }
        
        if state.metadata_fee != executor.model.metadata_fee {
            return Err(format!("Metadata fee mismatch: expected {}, got {}", 
                executor.model.metadata_fee, state.metadata_fee));
        }
    }
    
    // Invariant 2: Fees must always be non-negative when initialized
    if executor.model.initialized {
        if executor.model.base_fee < 0 {
            return Err(format!("Base fee is negative: {}", executor.model.base_fee));
        }
        if executor.model.metadata_fee < 0 {
            return Err(format!("Metadata fee is negative: {}", executor.model.metadata_fee));
        }
    }
    
    // Invariant 3: Double initialization must fail
    if let Action::Initialize { .. } = action {
        if let ActionResult::Initialize(result) = result {
            if executor.model.initialized && result.is_ok() {
                return Err("Double initialization succeeded but should have failed".to_string());
            }
            if !executor.model.initialized && result.is_err() {
                return Err("First initialization failed but should have succeeded".to_string());
            }
        }
    }
    
    // Invariant 4: Unauthorized fee updates must fail
    if let Action::UpdateFees { caller, .. } = action {
        if let ActionResult::UpdateFees(result) = result {
            if executor.model.initialized {
                let is_admin = executor.model.admin.as_ref().unwrap() == caller;
                if !is_admin && result.is_ok() {
                    return Err("Unauthorized update_fees succeeded".to_string());
                }
            }
        }
    }
    
    // Invariant 5: Token count must be non-negative
    if let ActionResult::GetTokenCount(Ok(count)) = result {
        if *count < 0 {
            return Err(format!("Token count is negative: {}", count));
        }
    }
    
    // Invariant 6: Getting non-existent token must fail
    if let Action::GetTokenInfo { index } = action {
        if let ActionResult::GetTokenInfo(result) = result {
            if executor.model.initialized {
                let token_count = executor.client.get_token_count();
                if *index >= token_count && result.is_ok() {
                    return Err(format!("get_token_info({}) succeeded but token_count is {}", 
                        index, token_count));
                }
            }
        }
    }
    
    Ok(())
}
```

## Data Models

### Action Result

Captures the result of executing an action:

```rust
#[derive(Debug)]
enum ActionResult {
    Initialize(Result<(), Error>),
    UpdateFees(Result<(), Error>),
    GetState(Result<FactoryState, ()>),
    GetTokenCount(Result<u32, ()>),
    GetTokenInfo(Result<TokenInfo, Error>),
}
```

### Test Configuration

```rust
const MIN_ACTIONS: usize = 1;
const MAX_ACTIONS: usize = 100;
const ADDRESS_POOL_SIZE: usize = 5;  // Small pool for better collision testing
const PROPTEST_CASES: u32 = 100;     // Number of test iterations
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Stateful Execution Maintains Invariants

*For any* action sequence, when executed against the contract, after each action the contract state must match the internal model state, and all invariants must hold:
- If initialized, contract state (admin, treasury, fees) matches model state
- Fees are always non-negative when contract is initialized
- Double initialization always fails
- Unauthorized fee updates always fail
- Token count is always non-negative
- Querying non-existent tokens always fails

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 2: Generator Produces Deterministic Sequences

*For any* seed value, generating an action sequence twice with the same seed must produce identical action sequences.

**Validates: Requirements 1.1**

### Property 3: Generator Covers All Operation Types

*For any* collection of generated action sequences (minimum 100 sequences), all operation types (Initialize, UpdateFees, GetState, GetTokenCount, GetTokenInfo) must appear at least once across all sequences, and fee values must include both positive and negative values.

**Validates: Requirements 1.2, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**

### Property 4: Generated Sequences Respect Length Bounds

*For any* generated action sequence, the length must be between 1 and 100 actions inclusive.

**Validates: Requirements 1.3**

### Property 5: Generated Actions Have Valid Structure

*For any* generated action, all parameters must be well-formed (addresses are valid Address types, indices are u32 values, fees are i128 values).

**Validates: Requirements 1.4**

## Error Handling

### Expected Errors

The fuzzer must handle these expected error conditions gracefully:

1. **AlreadyInitialized**: When initialize is called on an already initialized contract
2. **Unauthorized**: When update_fees is called by a non-admin address
3. **InvalidParameters**: When negative fees are provided
4. **TokenNotFound**: When get_token_info is called with an invalid index

### Error Handling Strategy

- Expected errors should not cause test failure
- The executor continues to the next action after expected errors
- The model is only updated when operations succeed
- Unexpected panics or errors should cause test failure with seed capture

### Uninitialized State Handling

Query operations (get_state, get_token_count) on uninitialized contracts will panic in Soroban. The executor must:
- Track initialization state in the model
- Skip query operations if not initialized
- Or wrap query operations in try_* variants if available

## Testing Strategy

### Dual Testing Approach

The stateful fuzzing feature will use both unit tests and property-based tests:

**Unit Tests**:
- Test individual components (Action enum, ContractModel, ActionExecutor)
- Test specific edge cases (empty sequences, single-action sequences)
- Test error handling for specific scenarios
- Verify invariant checker logic with known-bad states

**Property-Based Tests**:
- Main stateful fuzzing test (Property 1) - validates correctness across all action sequences
- Generator validation tests (Properties 2-5) - ensure generator quality
- Run with minimum 100 iterations per property test
- Each test tagged with: **Feature: stateful-contract-fuzzing, Property N: [property text]**

### Property-Based Testing Configuration

- **Library**: proptest (already in dev-dependencies)
- **Test iterations**: 100 minimum (configurable via proptest_config)
- **Seed persistence**: Proptest automatically captures and reports failing seeds
- **Replay**: Use `PROPTEST_CASES="seed [SEED]"` environment variable to replay failures

### Test Organization

All tests will be added to `contracts/token-factory/src/fuzz_test.rs`:
- Stateful fuzzing types and helpers at the top of the file
- Property tests in the existing `proptest!` macro block
- Unit tests in a new `#[cfg(test)] mod stateful_tests` module

### Example Test Tags

```rust
proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]
    
    #[test]
    // Feature: stateful-contract-fuzzing, Property 1: Stateful Execution Maintains Invariants
    fn stateful_fuzz_maintains_invariants(actions in action_sequence_strategy()) {
        // Test implementation
    }
    
    #[test]
    // Feature: stateful-contract-fuzzing, Property 2: Generator Produces Deterministic Sequences
    fn generator_is_deterministic(seed in any::<u64>()) {
        // Test implementation
    }
}
```

## Implementation Notes

### Proptest Integration

Proptest provides automatic:
- Seed management and reporting
- Test case shrinking (finding minimal failing examples)
- Replay functionality via environment variables
- Failure persistence

When a test fails, proptest outputs:
```
thread 'fuzz_test::stateful_fuzz_maintains_invariants' panicked at 'Test failed: ...'
minimal failing input: actions = [Initialize { ... }, UpdateFees { ... }]
    
If the failing test is non-deterministic, it may help to re-run with:
    PROPTEST_CASES="seed 1234567890abcdef" cargo test
```

### Address Generation Strategy

Use a small pool of addresses (5) to increase the likelihood of:
- Authorization collisions (same address used as admin and caller)
- State interactions between operations
- Edge cases in authorization logic

### Sequence Length Strategy

Generate sequences between 1-100 actions:
- Short sequences (1-10): Test basic operations
- Medium sequences (10-50): Test state transitions
- Long sequences (50-100): Test complex interactions and state accumulation

### Model Simplification

The ContractModel is intentionally simple:
- Only tracks essential state needed for invariant checking
- Does not model token registry details (not yet implemented in contract)
- Can be extended as contract features are added

## Future Extensions

As the token factory contract grows, the stateful fuzzer can be extended:

1. **Token Creation**: Add CreateToken action when implemented
2. **Token Registry**: Model token storage and retrieval
3. **Fee Collection**: Track fee payments and treasury balance
4. **Metadata Updates**: Add SetMetadata action
5. **Admin Transfer**: Add TransferAdmin action
6. **Shrinking Strategy**: Custom shrinking to find minimal failing sequences faster
