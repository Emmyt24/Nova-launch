#!/bin/bash
# CI Test Artifact Upload Script
# Uploads test failure artifacts to CI storage

set -e

ARTIFACT_DIR="test-artifacts"
CI_ARTIFACT_PATH="${CI_ARTIFACT_PATH:-artifacts/test-failures}"

if [ ! -d "$ARTIFACT_DIR" ]; then
    echo "No test artifacts found"
    exit 0
fi

ARTIFACT_COUNT=$(find "$ARTIFACT_DIR" -name "*.json" | wc -l)

if [ "$ARTIFACT_COUNT" -eq 0 ]; then
    echo "No test failure artifacts to upload"
    exit 0
fi

echo "Found $ARTIFACT_COUNT test failure artifact(s)"

# GitHub Actions
if [ -n "$GITHUB_ACTIONS" ]; then
    echo "Uploading to GitHub Actions artifacts..."
    mkdir -p "$CI_ARTIFACT_PATH"
    cp -r "$ARTIFACT_DIR"/* "$CI_ARTIFACT_PATH/"
    echo "::set-output name=artifact-count::$ARTIFACT_COUNT"
    
    # Generate summary
    echo "## Test Failure Artifacts" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "Found $ARTIFACT_COUNT failure artifact(s):" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    
    for artifact in "$ARTIFACT_DIR"/*.json; do
        test_name=$(jq -r '.test_name' "$artifact")
        timestamp=$(jq -r '.timestamp' "$artifact")
        replay=$(jq -r '.replay_command' "$artifact")
        
        echo "- **$test_name** ($(date -d @$timestamp))" >> $GITHUB_STEP_SUMMARY
        echo "  \`\`\`bash" >> $GITHUB_STEP_SUMMARY
        echo "  $replay" >> $GITHUB_STEP_SUMMARY
        echo "  \`\`\`" >> $GITHUB_STEP_SUMMARY
    done
fi

# GitLab CI
if [ -n "$GITLAB_CI" ]; then
    echo "Uploading to GitLab artifacts..."
    mkdir -p "$CI_ARTIFACT_PATH"
    cp -r "$ARTIFACT_DIR"/* "$CI_ARTIFACT_PATH/"
fi

echo "✅ Artifacts uploaded successfully"
