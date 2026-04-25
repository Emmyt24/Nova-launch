# Gas Snapshot Policy

- `gas-baseline.json` is the active threshold baseline used by CI.
- `gas-current.json` is the snapshot currently under regression test.
- `history/*.json` stores immutable baseline checkpoints over time.

## Required operations

CI enforces thresholds for:

- `create`
- `mint`
- `burn`
- `claim`
- `propose`
- `vote`
- `execute`

Each operation is validated for both CPU and memory values.
