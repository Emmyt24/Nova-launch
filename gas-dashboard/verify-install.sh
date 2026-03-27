#!/bin/bash

echo "🔍 Gas Dashboard Installation Verification"
echo "=========================================="
echo ""

# Check Node.js
echo "✓ Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "  Node.js version: $NODE_VERSION"
else
    echo "  ❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check npm
echo "✓ Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo "  npm version: $NPM_VERSION"
else
    echo "  ❌ npm not found"
    exit 1
fi

# Check directory structure
echo ""
echo "✓ Checking directory structure..."
REQUIRED_DIRS=("src" "scripts" "data" "docs")
for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  ✓ $dir/ exists"
    else
        echo "  ❌ $dir/ missing"
        exit 1
    fi
done

# Check required files
echo ""
echo "✓ Checking required files..."
REQUIRED_FILES=(
    "package.json"
    "vite.config.js"
    "index.html"
    ".env.example"
    "README.md"
    "src/main.jsx"
    "src/dashboard/Dashboard.jsx"
    "src/tracker/GasTracker.js"
    "src/alerts/AlertSystem.js"
    "src/reports/ReportGenerator.js"
    "scripts/measure.js"
    "scripts/alert.js"
    "scripts/report.js"
    "scripts/scheduler.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ❌ $file missing"
        exit 1
    fi
done

# Check documentation
echo ""
echo "✓ Checking documentation..."
DOC_FILES=(
    "docs/SETUP.md"
    "docs/MEASUREMENT.md"
    "docs/ALERTS.md"
    "QUICK_REFERENCE.md"
    "IMPLEMENTATION_COMPLETE.md"
)

for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ❌ $file missing"
    fi
done

# Check data files
echo ""
echo "✓ Checking data files..."
if [ -f "data/optimizations.json" ]; then
    echo "  ✓ data/optimizations.json"
fi
if [ -f "data/benchmarks.json" ]; then
    echo "  ✓ data/benchmarks.json"
fi

# Check .env
echo ""
echo "✓ Checking configuration..."
if [ -f ".env" ]; then
    echo "  ✓ .env configured"
else
    echo "  ⚠️  .env not found (copy from .env.example)"
fi

# Summary
echo ""
echo "=========================================="
echo "✅ Installation verification complete!"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and configure"
echo "  2. Run: npm install"
echo "  3. Run: npm run measure"
echo "  4. Run: npm run dev"
echo ""
echo "For help, see: docs/SETUP.md"
