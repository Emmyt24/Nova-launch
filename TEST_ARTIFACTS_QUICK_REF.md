# Test Artifacts Quick Reference

## 🎯 Quick Commands

```bash
# Replay a test from artifact
./scripts/replay-test.sh test-artifacts/test_name_timestamp.json

# Upload artifacts in CI
./scripts/upload-test-artifacts.sh

# List all artifacts
ls -lh test-artifacts/

# Clean old artifacts (older than 7 days)
find test-artifacts/ -name "*.json" -mtime +7 -delete
```

## 📦 Artifact Structure

```json
{
  "test_name": "string",
  "timestamp": 1234567890,
  "seed": 12345,
  "failure_message": "string",
  "call_sequence": ["call1", "call2"],
  "state_snapshot": "json_string",
  "replay_command": "string"
}
```

## 🦀 Rust Usage

```rust
use crate::test_artifacts::TestArtifact;

let mut artifact = TestArtifact::new("test_name")
    .with_seed(12345)
    .with_failure("message".to_string())
    .with_state("{\"key\":\"value\"}".to_string());

artifact.add_call("operation()".to_string());
artifact.save().unwrap();
```

## 📘 TypeScript Usage

```typescript
import { captureFailure } from '@/test/artifacts';

captureFailure(
  'test_name',
  error,
  ['call1', 'call2'],
  { key: 'value' },
  'seed'
);
```

## 🔄 CI Integration

### GitHub Actions
```yaml
- name: Upload artifacts
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: test-failure-artifacts-${{ github.run_number }}
    path: test-artifacts/
```

### Download from CI
```bash
gh run download <run-id> -n test-failure-artifacts-XXX
```

## 🐛 Debugging Workflow

1. **Test fails in CI** → Artifact generated
2. **Download artifact** → `gh run download`
3. **Replay locally** → `./scripts/replay-test.sh artifact.json`
4. **Fix issue** → Commit fix
5. **Verify** → Test passes

## 📊 Artifact Locations

- **Local**: `test-artifacts/*.json`
- **CI**: Workflow artifacts (30-day retention)
- **Ignored**: Added to `.gitignore`

## ⚙️ Configuration

### Rust (Cargo.toml)
```toml
[package.metadata.proptest]
rng_algorithm = "chacha"
cases = 100
max_shrink_iters = 1000
```

### TypeScript
```typescript
fc.assert(property, { numRuns: 100 });
```
