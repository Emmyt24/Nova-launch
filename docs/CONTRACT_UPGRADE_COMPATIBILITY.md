# Contract Upgrade Compatibility

Checklist and process for verifying that a new contract version is compatible with the frontend ABI registry, backend event decoders, and projection schemas before promotion.

---

## When to Run This

Run before every contract promotion — including hotfixes. A contract that passes unit tests can still silently break the frontend or backend indexer if method names or event topics change.

---

## Automated Check

```bash
./scripts/check-upgrade-compatibility.sh <new_contract_id> [testnet|mainnet]
```

This script verifies:

1. Contract is reachable and responds to `get_state`
2. Every method in `frontend/src/contracts/factoryAbi.ts` exists on-chain
3. Critical backend routes return expected HTTP status codes
4. Every event topic emitted by `contracts/token-factory/src/events.rs` is registered in `backend/src/services/eventVersioning/decoderRegistry.ts`
5. Frontend builds successfully with the new contract ID

**Exit 0 = safe to promote. Exit 1 = do not promote.**

---

## Manual Checklist

### Frontend ABI (`frontend/src/contracts/factoryAbi.ts`)

- [ ] Every `FACTORY_METHODS` value matches an exported function in `contracts/token-factory/src/lib.rs`
- [ ] Any renamed or removed method is removed from `FACTORY_METHODS` and all call sites updated
- [ ] New methods are added to `FACTORY_METHODS` with correct parameter interfaces
- [ ] ABI drift regression tests pass: `cd frontend && npm test -- factoryAbi`

### Backend Event Decoder (`backend/src/services/eventVersioning/decoderRegistry.ts`)

- [ ] Every `symbol!(...)` topic in `contracts/token-factory/src/events.rs` has an entry in `TOPIC_KIND`
- [ ] Every new topic has a corresponding decoder in `DECODERS`
- [ ] Old topic aliases are kept (not removed) to handle events from the previous contract version still in the ledger
- [ ] Versioning tests pass: `cd backend && npm test -- eventVersioning`

### Projection Schemas

- [ ] Prisma schema fields match the normalized event shapes in `decoderRegistry.ts`
- [ ] Any new event fields have a corresponding migration: `npx prisma migrate dev --name <description>`
- [ ] Schema evolution tests pass: `cd backend && npm test -- schemaEvolution`

### Smoke Tests

- [ ] `./scripts/smoke-test.sh` passes against the new contract on testnet
- [ ] `./scripts/fullstack-smoke-test.sh` passes with backend running

---

## Rollback

If a promoted contract breaks compatibility:

```bash
./scripts/rollback-upgrade.sh backups/<timestamp> <network>
./scripts/update-frontend-env.sh <network>
```

Then re-run `./scripts/check-upgrade-compatibility.sh` against the restored contract to confirm it passes before re-opening traffic.

---

## Adding a New Contract Method

1. Add the function to `contracts/token-factory/src/lib.rs`
2. Add the method name to `FACTORY_METHODS` in `frontend/src/contracts/factoryAbi.ts`
3. Add parameter interface if needed
4. Update call sites in `frontend/src/services/stellar.service.ts`
5. Run `./scripts/check-upgrade-compatibility.sh <new_contract_id>`

## Adding a New Event Topic

1. Emit the event in `contracts/token-factory/src/events.rs`
2. Add the topic alias to `TOPIC_KIND` in `decoderRegistry.ts`
3. Add a decoder to `DECODERS`
4. Add the normalized shape to the `NormalizedEvent` union type
5. Add a Prisma migration if the event needs to be persisted
6. Run `./scripts/check-upgrade-compatibility.sh <new_contract_id>`
