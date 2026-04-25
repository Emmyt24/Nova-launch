# Mainnet Readiness Checklist

Audit checklist to ensure no testnet assumptions leak into production. Complete every item before promoting to mainnet.

---

## Network Configuration

- [ ] `VITE_NETWORK=mainnet` in `frontend/.env`
- [ ] `STELLAR_NETWORK=mainnet` in backend `.env`
- [ ] `STELLAR_HORIZON_URL=https://horizon.stellar.org` in backend `.env`
- [ ] `STELLAR_SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org` in backend `.env`
- [ ] `VITE_FACTORY_CONTRACT_ID` points to a mainnet contract (starts with `C`, 56 chars)

Verify no production code path references testnet URLs:

```bash
grep -r "horizon-testnet\|soroban-testnet\|friendbot" \
  frontend/src backend/src \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir="__tests__" --exclude-dir="test" --exclude="*.test.*" --exclude="*.spec.*"
```

Expected: no matches outside test files.

---

## Friendbot

- [ ] `fundTestAccount()` in `stellar.service.ts` throws when `network !== 'testnet'`
- [ ] No UI element calls `fundTestAccount` in a production code path
- [ ] No backend route calls Friendbot

---

## Explorer Links

- [ ] All explorer links use `getTxUrl` / `getContractUrl` / `getAccountUrl` from `frontend/src/utils/explorer.ts`
- [ ] `CampaignDashboard` derives `network` from `VITE_NETWORK` env var, not a hardcoded default
- [ ] No component hardcodes `stellar.expert/explorer/testnet`

Verify:

```bash
grep -r "explorer/testnet" frontend/src --include="*.ts" --include="*.tsx" \
  --exclude-dir="__tests__" --exclude="*.test.*"
```

Expected: no matches.

---

## RPC Endpoints

- [ ] `transactionMonitor.ts` `getRPCUrl()` returns `https://soroban-mainnet.stellar.org` for mainnet
- [ ] `stellar.config.ts` in backend uses `STELLAR_SOROBAN_RPC_URL` env var (no hardcoded fallback to testnet in production paths)
- [ ] `backend/src/lib/stellar/index.ts` reads `STELLAR_HORIZON_URL` from env

---

## Fee Display

- [ ] Fee amounts shown in UI match the deployed contract's `get_base_fee` and `get_metadata_fee` values
- [ ] No UI text says "free" or references Friendbot for mainnet users

---

## Boot Validation

- [ ] `frontend/src/config/env.ts` `getBootErrors()` catches missing `VITE_FACTORY_CONTRACT_ID` and shows `IntegrationBootError`
- [ ] Backend `validateEnv()` in `backend/src/config/env.ts` throws on missing `STELLAR_HORIZON_URL` or `FACTORY_CONTRACT_ID`

---

## Smoke Test (Both Networks)

```bash
# Testnet
STELLAR_NETWORK=testnet ./scripts/smoke-test.sh

# Mainnet (read-only — no token creation)
STELLAR_NETWORK=mainnet \
FACTORY_CONTRACT_ID=$(jq -r .contractId deployment-mainnet.json) \
soroban contract invoke --id $FACTORY_CONTRACT_ID --network mainnet -- get_state
```

---

## Final Sign-off

| Item | Owner | Status |
|------|-------|--------|
| No hardcoded testnet URLs in production paths | | |
| Friendbot guard in place | | |
| Explorer links network-aware | | |
| RPC endpoints correct for mainnet | | |
| Boot validation catches misconfiguration | | |
| Smoke test passes on mainnet | | |
