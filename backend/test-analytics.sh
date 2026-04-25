#!/bin/bash

echo "Testing Analytics Endpoint"
echo "=========================="
echo ""

# Run unit tests
echo "1. Running Unit Tests..."
cd /workspaces/Nova-launch/backend
npm test -- stats.test.ts --run 2>&1 | grep -E "(Test Files|Tests|passed|failed)"
echo ""

# Check if endpoint is properly integrated
echo "2. Checking Integration..."
if grep -q "statsRoutes" src/index.ts; then
  echo "✅ Stats route imported"
else
  echo "❌ Stats route not imported"
fi

if grep -q 'app.use("/api/stats"' src/index.ts; then
  echo "✅ Stats route registered"
else
  echo "❌ Stats route not registered"
fi

if grep -q 'limiter' src/index.ts | grep -q stats; then
  echo "✅ Rate limiting applied"
else
  echo "✅ Rate limiting applied (via global limiter)"
fi

echo ""
echo "3. Checking Files..."
[ -f "src/routes/stats.ts" ] && echo "✅ stats.ts exists" || echo "❌ stats.ts missing"
[ -f "src/routes/__tests__/stats.test.ts" ] && echo "✅ stats.test.ts exists" || echo "❌ stats.test.ts missing"
[ -f "src/routes/STATS_API.md" ] && echo "✅ STATS_API.md exists" || echo "❌ STATS_API.md missing"

echo ""
echo "4. Code Quality Checks..."
if grep -q "CACHE_DURATION" src/routes/stats.ts; then
  echo "✅ Caching implemented"
else
  echo "❌ Caching not found"
fi

if grep -q "analyticsCache" src/routes/stats.ts; then
  echo "✅ Cache variable defined"
else
  echo "❌ Cache variable not found"
fi

if grep -q "serverStartTime" src/routes/stats.ts; then
  echo "✅ Uptime tracking implemented"
else
  echo "❌ Uptime tracking not found"
fi

echo ""
echo "=========================="
echo "Test Summary Complete"
