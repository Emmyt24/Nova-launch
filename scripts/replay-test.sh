#!/bin/bash
# Replay a test from an artifact file

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <artifact-file.json>"
    echo ""
    echo "Example:"
    echo "  $0 test-artifacts/prop_supply_conservation_1234567890.json"
    exit 1
fi

ARTIFACT_FILE="$1"

if [ ! -f "$ARTIFACT_FILE" ]; then
    echo "Error: Artifact file not found: $ARTIFACT_FILE"
    exit 1
fi

echo "📋 Loading test artifact: $ARTIFACT_FILE"
echo ""

TEST_NAME=$(jq -r '.test_name' "$ARTIFACT_FILE")
SEED=$(jq -r '.seed // empty' "$ARTIFACT_FILE")
REPLAY_CMD=$(jq -r '.replay_command' "$ARTIFACT_FILE")
TIMESTAMP=$(jq -r '.timestamp' "$ARTIFACT_FILE")

echo "Test: $TEST_NAME"
echo "Time: $(date -d @$TIMESTAMP 2>/dev/null || date -r $TIMESTAMP 2>/dev/null || echo $TIMESTAMP)"
[ -n "$SEED" ] && echo "Seed: $SEED"
echo ""

echo "Call Sequence:"
jq -r '.call_sequence[]' "$ARTIFACT_FILE" | nl -w2 -s'. '
echo ""

echo "State Snapshot:"
jq '.state_snapshot' "$ARTIFACT_FILE"
echo ""

echo "Failure Message:"
jq -r '.failure_message' "$ARTIFACT_FILE"
echo ""

echo "🔄 Replaying test..."
echo "Command: $REPLAY_CMD"
echo ""

# Set seed if available
if [ -n "$SEED" ]; then
    export PROPTEST_RNG_SEED="$SEED"
fi

# Execute replay command
eval "$REPLAY_CMD"
