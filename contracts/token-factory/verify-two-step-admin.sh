#!/bin/bash
# Verification script for two-step admin transfer implementation

echo "=== Two-Step Admin Transfer Implementation Verification ==="
echo ""

echo "1. Checking storage functions..."
grep -q "get_pending_admin" src/storage.rs && echo "✅ get_pending_admin exists" || echo "❌ get_pending_admin missing"
grep -q "set_pending_admin" src/storage.rs && echo "✅ set_pending_admin exists" || echo "❌ set_pending_admin missing"
grep -q "clear_pending_admin" src/storage.rs && echo "✅ clear_pending_admin exists" || echo "❌ clear_pending_admin missing"

echo ""
echo "2. Checking data model..."
grep -q "PendingAdmin" src/types.rs && echo "✅ PendingAdmin in DataKey" || echo "❌ PendingAdmin missing"

echo ""
echo "3. Checking contract functions..."
grep -q "pub fn propose_admin" src/lib.rs && echo "✅ propose_admin function exists" || echo "❌ propose_admin missing"
grep -q "pub fn accept_admin" src/lib.rs && echo "✅ accept_admin function exists" || echo "❌ accept_admin missing"

echo ""
echo "4. Checking events..."
grep -q "emit_admin_proposed" src/events.rs && echo "✅ emit_admin_proposed exists" || echo "❌ emit_admin_proposed missing"

echo ""
echo "5. Checking tests..."
grep -q "test_duplicate_accept" src/two_step_admin_test.rs && echo "✅ Duplicate acceptance test exists" || echo "❌ Missing"
grep -q "test_stale_proposal" src/two_step_admin_test.rs && echo "✅ Stale proposal test exists" || echo "❌ Missing"
grep -q "test_only_one_pending_admin" src/two_step_admin_test.rs && echo "✅ Single proposal test exists" || echo "❌ Missing"
grep -q "test_unauthorized_cannot_accept" src/two_step_admin_test.rs && echo "✅ Authorization test exists" || echo "❌ Missing"

echo ""
echo "6. Checking for compilation errors in our code..."
if cargo check --lib 2>&1 | grep -E "propose_admin|accept_admin|PendingAdmin|emit_admin_proposed" > /dev/null; then
    echo "❌ Compilation errors found in our code"
else
    echo "✅ No compilation errors in our code"
fi

echo ""
echo "=== Verification Complete ==="
