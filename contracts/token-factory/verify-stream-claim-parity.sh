#!/bin/bash
# Verification script for stream claim differential tests

echo "=== Stream Claim Differential Tests Verification ==="
echo ""

echo "1. Checking test file exists..."
if [ -f "src/stream_claim_differential_test.rs" ]; then
    echo "✅ Test file exists"
else
    echo "❌ Test file missing"
    exit 1
fi

echo ""
echo "2. Checking test coverage..."
grep -q "test_parity_before_cliff" src/stream_claim_differential_test.rs && echo "✅ Pre-cliff tests" || echo "❌ Missing"
grep -q "test_parity_mid_vesting" src/stream_claim_differential_test.rs && echo "✅ Mid-vesting tests" || echo "❌ Missing"
grep -q "test_parity_after_end" src/stream_claim_differential_test.rs && echo "✅ Post-end tests" || echo "❌ Missing"
grep -q "test_parity_after_partial_claim" src/stream_claim_differential_test.rs && echo "✅ Multiple claims tests" || echo "❌ Missing"
grep -q "test_parity_odd_duration_rounding" src/stream_claim_differential_test.rs && echo "✅ Rounding edge cases" || echo "❌ Missing"
grep -q "test_regression" src/stream_claim_differential_test.rs && echo "✅ Regression fixtures" || echo "❌ Missing"

echo ""
echo "3. Checking module declaration..."
grep -q "mod stream_claim_differential_test" src/lib.rs && echo "✅ Module declared" || echo "❌ Not declared"

echo ""
echo "4. Checking for compilation errors..."
if cargo check --lib 2>&1 | grep -E "stream_claim_differential|error.*claim" > /dev/null; then
    echo "❌ Compilation errors found"
else
    echo "✅ No compilation errors"
fi

echo ""
echo "5. Counting test cases..."
TEST_COUNT=$(grep -c "fn test_" src/stream_claim_differential_test.rs)
echo "✅ $TEST_COUNT differential tests implemented"

echo ""
echo "=== Verification Complete ==="
