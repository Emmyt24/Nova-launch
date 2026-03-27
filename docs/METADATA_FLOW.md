# Metadata Flow

## Overview

Token metadata is optional. When provided, it is uploaded to IPFS and the resulting URI is stored on-chain via the factory contract.

## Upload → Contract → Retrieval

```
User supplies image + description
        │
        ▼
IPFSService.uploadMetadata()
  1. POST image file → Pinata → returns imageHash
  2. Build TokenMetadata JSON { name, description, image: "ipfs://<imageHash>" }
  3. POST JSON → Pinata → returns metadataHash
  4. Returns "ipfs://<metadataHash>"
        │
        ▼
isValidIpfsUri(uri) — validated before contract call
        │
        ▼
StellarService.deployToken({ ..., metadataUri })
  → create_token(..., metadata_uri: Option<String>, fee_payment)
  → fee_payment = baseFee + metadataFee  (when metadataUri present)
        │
        ▼
On-chain: factory stores metadata_uri in TokenInfo
        │
        ▼
StellarService.getTokenMetadata(tokenAddress)
  → simulates get_metadata() on token contract
  → resolves ipfs:// URI
  → IPFSService.getMetadata(uri) — tries multiple gateways
  → returns TokenMetadata { name, description, image }
```

## Fee Impact

| Has Metadata | Fee |
|---|---|
| No | `baseFee` only |
| Yes | `baseFee + metadataFee` |

Fees are read live from the contract via `get_base_fee` / `get_metadata_fee` (see `useFactoryFees`).

## Canonical IPFS Service

`frontend/src/services/IPFSService.ts` is the single IPFS implementation.  
Do not add new IPFS service files — extend this class instead.

## Backend Metadata Retrieval

`backend/src/token-info/ipfs.service.ts` — `IpfsService.fetchMetadata(uri)`:
- Resolves `ipfs://`, raw hashes, and full HTTP URLs
- Sanitizes the response to a safe `TokenMetadata` shape
- Returns `null` on failure (non-fatal)
