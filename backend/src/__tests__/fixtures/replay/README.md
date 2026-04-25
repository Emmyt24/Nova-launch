# Replay Fixtures

Fixture sequences used by `eventReplay.integration.test.ts` to drive the backend ingestion pipeline deterministically.

## Fixture Format

Each fixture is a plain object matching the `StellarEvent` shape consumed by `StellarEventListener.replayBatch()`:

```ts
{
  type: "contract",
  ledger: number,           // monotonically increasing within a sequence
  ledger_close_time: string, // ISO-8601 UTC — used for ingestion lag metrics
  contract_id: string,
  id: string,               // unique event ID
  paging_token: string,     // unique cursor token
  topic: string[],          // [event_kind, ...args]
  value: object,            // event payload
  in_successful_contract_call: boolean,
  transaction_hash: string, // unique per event — used for idempotency
}
```

## Sequences

| Sequence | File | Events | Covers |
|----------|------|--------|--------|
| `tokenLifecycleReplaySequence` | `contractEvents.ts` | tok_reg → tok_burn → adm_burn | Token creation and burns |
| `governanceLifecycleReplaySequence` | `governanceEvents.ts` | prop_create → vote × 2 → status → exec | Full governance lifecycle |
| Stream lifecycle | inline in test | vlt_cr_v1 → vlt_cl_v1 | Vault create and claim |
| Campaign lifecycle | inline in test | camp_cr_v1 → camp_ex_v1 | Campaign create and execute |

## Idempotency Contract

Every parser must satisfy:

1. **Replay safety** — replaying the same sequence twice produces identical DB state (no duplicate rows, no double-counted amounts).
2. **Duplicate event safety** — a batch containing the same event twice is equivalent to the batch containing it once.
3. **Out-of-order safety** — events arriving out of ledger order must either be handled correctly or fail with a logged error without corrupting existing state.

The `transaction_hash` field is the primary idempotency key for burn records and campaign executions. Token creation uses `upsert` with an empty `update` block.

## Adding New Fixtures

1. Add the raw event object to the appropriate fixture file.
2. Export it as part of a named lifecycle sequence.
3. Add a corresponding assertion in `eventReplay.integration.test.ts`.
4. Update this table.
