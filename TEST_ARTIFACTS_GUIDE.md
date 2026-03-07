# Test Failure Artifacts System

## Overview

The test failure artifacts system captures comprehensive forensic data when complex tests fail, enabling one-command local replay and faster debugging.

## Features

- **Automatic Capture**: Failures in property tests, fuzz tests, and integration tests automatically generate artifacts
- **Reproducible**: Captures seeds, timestamps, and exact call sequences
- **State Snapshots**: Records full state at failure point
- **CI Integration**: Automatically uploads artifacts in CI pipelines
- **One-Command Replay**: Simple script to reproduce failures locally

## Artifact Format

```json
{
  "test_name": "prop_supply_conservation",
  "timestamp": 1709820000,
  "seed": 12345,
  "failure_message": "Supply conservation violated: total_supply(900000) + total_burned(50000) != initial_supply(1000000)",
  "call_sequence": [
    "burn(creator, 0, 10000)",
    "burn(creator, 0, 20000)",
    "burn(creator, 0, 20000)"
  ],
  "state_snapshot": "{\"initial_supply\":1000000,\"total_supply\":900000,\"total_burned\":50000}",
  "replay_command": "cargo test prop_supply_conservation -- --exact"
}
```

## Usage

### Rust (Contracts)

#### Manual Capture

```rust
use crate::test_artifacts::TestArtifact;

#[test]
fn test_with_artifact_capture() {
    let mut calls = Vec::new();
    
    calls.push("create_token(...)".to_string());
    // ... test logic
    
    if failure_detected {
        let mut artifact = TestArtifact::new("test_with_artifact_capture")
            .with_seed(12345)
            .with_failure("Test failed".to_string())
            .with_state("{\"key\":\"value\"}".to_string());
        
        for call in calls {
            artifact.add_call(call);
        }
        
        artifact.save().unwrap();
    }
}
```

#### Property Test Integration

```rust
use proptest::prelude::*;
use crate::test_artifacts::TestArtifact;

proptest! {
    #[test]
    fn prop_test_with_artifacts(value in 0..1000i128) {
        let mut calls = Vec::new();
        
        calls.push(format!("operation({})", value));
        
        // Test logic
        let result = perform_operation(value);
        
        if !result.is_valid() {
            let mut artifact = TestArtifact::new("prop_test_with_artifacts")
                .with_failure(format!("Invalid result: {:?}", result))
                .with_state(format!("{{\"value\":{}}}", value));
            
            for call in calls {
                artifact.add_call(call);
            }
            
            let _ = artifact.save();
        }
        
        prop_assert!(result.is_valid());
    }
}
```

### TypeScript (Frontend)

```typescript
import { captureFailure, ArtifactCapture } from '@/test/artifacts';
import * as fc from 'fast-check';

describe('Test with artifacts', () => {
  it('captures failure artifacts', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const calls: string[] = [];
        const state = { value, timestamp: Date.now() };

        try {
          calls.push(`operation(${value})`);
          const result = performOperation(value);
          
          if (!result.valid) {
            throw new Error('Operation failed');
          }
          
          return true;
        } catch (error) {
          captureFailure('test_name', error as Error, calls, state);
          throw error;
        }
      })
    );
  });
});
```

## Replaying Failures

### Local Replay

```bash
# Replay from artifact file
./scripts/replay-test.sh test-artifacts/prop_supply_conservation_1709820000.json
```

The script will:
1. Display test metadata (name, timestamp, seed)
2. Show the call sequence
3. Display state snapshot
4. Show failure message
5. Execute the replay command with the original seed

### Manual Replay

```bash
# Rust tests
export PROPTEST_RNG_SEED=12345
cargo test prop_supply_conservation -- --exact

# Frontend tests
npm test -- test_name
```

## CI Integration

### GitHub Actions

Artifacts are automatically uploaded on test failures:

```yaml
- name: Run property tests
  id: property-tests
  run: cargo test --lib burn_property_test

- name: Upload test artifacts
  if: failure()
  run: ./scripts/upload-test-artifacts.sh

- name: Upload artifacts to GitHub
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: test-failure-artifacts-${{ github.run_number }}
    path: test-artifacts/
    retention-days: 30
```

### Downloading CI Artifacts

```bash
# From GitHub Actions UI
# 1. Go to failed workflow run
# 2. Scroll to "Artifacts" section
# 3. Download "test-failure-artifacts-XXX"

# Using GitHub CLI
gh run download <run-id> -n test-failure-artifacts-XXX
```

## Artifact Storage

### Local Development

Artifacts are stored in `test-artifacts/` directory:

```
test-artifacts/
├── prop_supply_conservation_1709820000.json
├── prop_burn_never_exceeds_balance_1709820100.json
└── integration_wallet_connection_1709820200.json
```

### CI Storage

- **GitHub Actions**: Stored as workflow artifacts (30-day retention)
- **GitLab CI**: Stored as job artifacts (configurable retention)

## Best Practices

1. **Capture Early**: Add artifact capture to all property tests and complex integration tests
2. **Meaningful Names**: Use descriptive test names for easy identification
3. **State Snapshots**: Include all relevant state, not just failing values
4. **Call Sequences**: Record every significant operation
5. **Clean Up**: Periodically clean old artifacts from local development

## Troubleshooting

### Artifact Not Generated

- Check that `test-artifacts/` directory is writable
- Verify artifact capture code is in the failure path
- Check for exceptions during artifact save

### Replay Fails

- Ensure seed is correctly set (`PROPTEST_RNG_SEED` for Rust)
- Verify test environment matches original (dependencies, data)
- Check that test is deterministic with fixed seed

### CI Upload Fails

- Verify `scripts/upload-test-artifacts.sh` is executable
- Check CI environment variables are set
- Ensure artifact directory exists before upload

## Examples

See:
- `contracts/token-factory/src/burn_property_test.rs` - Rust property test with artifacts
- `frontend/src/test/integration/artifact-example.test.ts` - TypeScript integration test with artifacts

## Configuration

### Rust

Configure in `Cargo.toml`:

```toml
[package.metadata.proptest]
rng_algorithm = "chacha"
cases = 100
max_shrink_iters = 1000
timeout = 5000
```

### TypeScript

Configure in test files:

```typescript
fc.assert(property, {
  numRuns: 100,
  seed: 12345, // For reproducibility
});
```
