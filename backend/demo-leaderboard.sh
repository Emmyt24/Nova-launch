#!/bin/bash

# Token Leaderboard API Demo Script
# This script demonstrates all leaderboard endpoints

BASE_URL="http://localhost:3001"
API_PATH="/api/leaderboard"

echo "🚀 Token Leaderboard API Demo"
echo "================================"
echo ""

# Check if server is running
echo "📡 Checking server status..."
if ! curl -s "${BASE_URL}/health" > /dev/null 2>&1; then
    echo "❌ Server is not running at ${BASE_URL}"
    echo "Please start the server with: npm run dev"
    exit 1
fi
echo "✅ Server is running"
echo ""

# Function to make API call and display result
call_api() {
    local endpoint=$1
    local description=$2
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 ${description}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Endpoint: ${endpoint}"
    echo ""
    
    response=$(curl -s "${BASE_URL}${endpoint}")
    
    if [ $? -eq 0 ]; then
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        echo "❌ Request failed"
    fi
    
    echo ""
    echo ""
}

# Demo 1: Most Burned Tokens (Last 7 days)
call_api "${API_PATH}/most-burned?period=7d&limit=5" \
    "Most Burned Tokens (Last 7 Days)"

# Demo 2: Most Active Tokens (Last 24 hours)
call_api "${API_PATH}/most-active?period=24h&limit=5" \
    "Most Active Tokens (Last 24 Hours)"

# Demo 3: Newest Tokens
call_api "${API_PATH}/newest?limit=5" \
    "Newest Tokens"

# Demo 4: Largest Supply Tokens
call_api "${API_PATH}/largest-supply?limit=5" \
    "Largest Supply Tokens"

# Demo 5: Most Burners (Last 30 days)
call_api "${API_PATH}/most-burners?period=30d&limit=5" \
    "Most Burners (Last 30 Days)"

# Demo 6: Pagination Example
call_api "${API_PATH}/most-burned?period=all&page=2&limit=3" \
    "Pagination Example (Page 2, 3 items per page)"

# Demo 7: All Time Most Burned
call_api "${API_PATH}/most-burned?period=all&limit=10" \
    "All Time Most Burned Tokens"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Demo Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Documentation:"
echo "  - Full API Docs: backend/LEADERBOARD_API.md"
echo "  - Quick Reference: backend/LEADERBOARD_QUICK_REF.md"
echo ""
echo "🧪 Run Tests:"
echo "  npm test -- leaderboard"
echo ""
