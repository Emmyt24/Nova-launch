#!/usr/bin/env bash
# deploy-multi-region.sh — Deploy the token-factory contract to all configured regions.
#
# Usage:
#   ./scripts/deploy-multi-region.sh [--network testnet|mainnet] [--sequential] [--regions id,id]
#
# Prerequisites:
#   - soroban CLI installed and configured
#   - Admin/treasury identities created (run setup-soroban.sh first)
#   - Contract WASM built (cargo build --target wasm32-unknown-unknown --release)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "🌍 Nova Launch — Multi-Region Deployment"
echo "========================================="

# Forward all arguments to the TypeScript CLI
cd "${REPO_ROOT}/scripts/deployment"
exec npx tsx deployMultiRegion.ts "$@"
