#!/bin/bash
# Run stateful model-based tests for Task #372

set -e

echo "========================================="
echo "Task #372: Stateful Model-Based Tests"
echo "========================================="
echo ""

cd "$(dirname "$0")"

echo "Running stateful model-based tests..."
PROPTEST_CASES=100 cargo test --lib stateful_model_based_test -- --nocapture

echo ""
echo "✅ All stateful model tests passed!"
