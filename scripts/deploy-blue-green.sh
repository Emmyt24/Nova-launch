#!/usr/bin/env bash
##############################################################################
# deploy-blue-green.sh — Nova Launch Blue-Green Deployment Script
#
# Orchestrates a zero-downtime blue-green deployment for the Nova Launch
# backend and/or frontend services on AWS ECS Fargate.
#
# Usage:
#   ./scripts/deploy-blue-green.sh [OPTIONS]
#
# Options:
#   --env <staging|production>   Target environment (required)
#   --service <backend|frontend> Service to deploy (required)
#   --image <uri>                Full ECR image URI with tag (required)
#   --region <aws-region>        AWS region (default: us-east-1)
#   --dry-run                    Plan without executing
#   --no-smoke-tests             Skip smoke tests
#   --canary                     Use canary traffic shifting (10→25→50→100%)
#   --rollback                   Force rollback to previous slot
#   --help                       Show this help
#
# Examples:
#   # Deploy backend to staging
#   ./scripts/deploy-blue-green.sh \
#     --env staging \
#     --service backend \
#     --image 123456789012.dkr.ecr.us-east-1.amazonaws.com/nova-launch/staging/backend:v1.2.3
#
#   # Dry-run production deployment
#   ./scripts/deploy-blue-green.sh \
#     --env production \
#     --service backend \
#     --image 123456789012.dkr.ecr.us-east-1.amazonaws.com/nova-launch/production/backend:v1.2.3 \
#     --dry-run
#
#   # Force rollback
#   ./scripts/deploy-blue-green.sh \
#     --env production \
#     --service backend \
#     --rollback
#
# Required environment variables (or AWS CLI profile):
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY
#   AWS_REGION (or --region flag)
#
# Exit codes:
#   0 — deployment succeeded
#   1 — deployment failed (rollback attempted)
#   2 — invalid arguments
#   3 — pre-flight checks failed
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BG_DIR="${SCRIPT_DIR}/blue-green"

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENV=""
SERVICE=""
IMAGE_URI=""
AWS_REGION="${AWS_REGION:-us-east-1}"
DRY_RUN=false
SMOKE_TESTS=true
CANARY=false
FORCE_ROLLBACK=false
PROJECT="nova-launch"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)          ENV="$2";         shift 2 ;;
    --service)      SERVICE="$2";     shift 2 ;;
    --image)        IMAGE_URI="$2";   shift 2 ;;
    --region)       AWS_REGION="$2";  shift 2 ;;
    --dry-run)      DRY_RUN=true;     shift ;;
    --no-smoke-tests) SMOKE_TESTS=false; shift ;;
    --canary)       CANARY=true;      shift ;;
    --rollback)     FORCE_ROLLBACK=true; shift ;;
    --help|-h)
      sed -n '/^# Usage:/,/^##/p' "$0" | head -n -1
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown argument: $1${NC}" >&2
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
log_info()    { echo -e "${CYAN}[blue-green]${NC} ℹ️  $*"; }
log_success() { echo -e "${GREEN}[blue-green]${NC} ✅ $*"; }
log_warn()    { echo -e "${YELLOW}[blue-green]${NC} ⚠️  $*"; }
log_error()   { echo -e "${RED}[blue-green]${NC} ❌ $*" >&2; }
log_step()    { echo -e "${BOLD}[blue-green]${NC} [$1] $2"; }

if [[ -z "${ENV}" ]]; then
  log_error "--env is required (staging|production)"
  exit 2
fi

if [[ "${ENV}" != "staging" && "${ENV}" != "production" ]]; then
  log_error "--env must be 'staging' or 'production', got '${ENV}'"
  exit 2
fi

if [[ -z "${SERVICE}" ]]; then
  log_error "--service is required (backend|frontend)"
  exit 2
fi

if [[ "${SERVICE}" != "backend" && "${SERVICE}" != "frontend" ]]; then
  log_error "--service must be 'backend' or 'frontend', got '${SERVICE}'"
  exit 2
fi

if [[ -z "${IMAGE_URI}" && "${FORCE_ROLLBACK}" == "false" ]]; then
  log_error "--image is required unless --rollback is specified"
  exit 2
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log_step "PRE" "Running pre-flight checks…"

# Check AWS CLI
if ! command -v aws &>/dev/null; then
  log_error "AWS CLI not found. Install from: https://aws.amazon.com/cli/"
  exit 3
fi

# Check AWS credentials
if ! aws sts get-caller-identity --region "${AWS_REGION}" > /dev/null 2>&1; then
  log_error "AWS credentials not configured or invalid"
  exit 3
fi

CALLER_IDENTITY=$(aws sts get-caller-identity --region "${AWS_REGION}" --output json)
AWS_ACCOUNT_ID=$(echo "${CALLER_IDENTITY}" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])" 2>/dev/null || \
                 echo "${CALLER_IDENTITY}" | grep -o '"Account": "[^"]*"' | cut -d'"' -f4)

log_info "AWS Account: ${AWS_ACCOUNT_ID}, Region: ${AWS_REGION}"

# Check ECS cluster exists
CLUSTER_NAME="${PROJECT}-${ENV}"
if ! aws ecs describe-clusters \
     --clusters "${CLUSTER_NAME}" \
     --region "${AWS_REGION}" \
     --query "clusters[0].status" \
     --output text 2>/dev/null | grep -q "ACTIVE"; then
  log_error "ECS cluster '${CLUSTER_NAME}' not found or not ACTIVE"
  exit 3
fi

log_success "Pre-flight checks passed"

# ---------------------------------------------------------------------------
# Determine current active slot
# ---------------------------------------------------------------------------
log_step "1/6" "Determining active slot…"

BLUE_SERVICE="${PROJECT}-${ENV}-${SERVICE}-blue"
GREEN_SERVICE="${PROJECT}-${ENV}-${SERVICE}-green"

# Check which service has running tasks
BLUE_RUNNING=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${BLUE_SERVICE}" \
  --region "${AWS_REGION}" \
  --query "services[0].runningCount" \
  --output text 2>/dev/null || echo "0")

GREEN_RUNNING=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${GREEN_SERVICE}" \
  --region "${AWS_REGION}" \
  --query "services[0].runningCount" \
  --output text 2>/dev/null || echo "0")

log_info "Running tasks — blue: ${BLUE_RUNNING}, green: ${GREEN_RUNNING}"

if [[ "${BLUE_RUNNING}" -gt 0 && "${GREEN_RUNNING}" -eq 0 ]]; then
  ACTIVE_SLOT="blue"
  INACTIVE_SLOT="green"
elif [[ "${GREEN_RUNNING}" -gt 0 && "${BLUE_RUNNING}" -eq 0 ]]; then
  ACTIVE_SLOT="green"
  INACTIVE_SLOT="blue"
else
  # Default to blue as active if ambiguous
  log_warn "Ambiguous slot state — defaulting active=blue, inactive=green"
  ACTIVE_SLOT="blue"
  INACTIVE_SLOT="green"
fi

ACTIVE_SERVICE="${PROJECT}-${ENV}-${SERVICE}-${ACTIVE_SLOT}"
INACTIVE_SERVICE="${PROJECT}-${ENV}-${SERVICE}-${INACTIVE_SLOT}"

log_info "Active slot: ${ACTIVE_SLOT} (${ACTIVE_SERVICE})"
log_info "Inactive slot: ${INACTIVE_SLOT} (${INACTIVE_SERVICE})"

# ---------------------------------------------------------------------------
# Force rollback path
# ---------------------------------------------------------------------------
if [[ "${FORCE_ROLLBACK}" == "true" ]]; then
  log_warn "FORCE ROLLBACK requested — switching traffic back to ${INACTIVE_SLOT}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    log_warn "DRY RUN — would shift traffic to ${INACTIVE_SLOT}"
    exit 0
  fi

  # Get target group ARNs
  ACTIVE_TG_ARN=$(aws ecs describe-services \
    --cluster "${CLUSTER_NAME}" \
    --services "${ACTIVE_SERVICE}" \
    --region "${AWS_REGION}" \
    --query "services[0].loadBalancers[0].targetGroupArn" \
    --output text 2>/dev/null || echo "")

  INACTIVE_TG_ARN=$(aws ecs describe-services \
    --cluster "${CLUSTER_NAME}" \
    --services "${INACTIVE_SERVICE}" \
    --region "${AWS_REGION}" \
    --query "services[0].loadBalancers[0].targetGroupArn" \
    --output text 2>/dev/null || echo "")

  if [[ -z "${ACTIVE_TG_ARN}" || -z "${INACTIVE_TG_ARN}" ]]; then
    log_error "Could not determine target group ARNs for rollback"
    exit 1
  fi

  # Find listener rule ARN
  LISTENER_RULE_ARN=$(aws elbv2 describe-rules \
    --region "${AWS_REGION}" \
    --query "Rules[?Actions[?ForwardConfig.TargetGroups[?TargetGroupArn=='${ACTIVE_TG_ARN}']]] | [0].RuleArn" \
    --output text 2>/dev/null || echo "")

  if [[ -n "${LISTENER_RULE_ARN}" && "${LISTENER_RULE_ARN}" != "None" ]]; then
    aws elbv2 modify-rule \
      --rule-arn "${LISTENER_RULE_ARN}" \
      --region "${AWS_REGION}" \
      --actions "[{\"Type\":\"forward\",\"ForwardConfig\":{\"TargetGroups\":[{\"TargetGroupArn\":\"${INACTIVE_TG_ARN}\",\"Weight\":100},{\"TargetGroupArn\":\"${ACTIVE_TG_ARN}\",\"Weight\":0}]}}]" \
      > /dev/null

    log_success "Traffic shifted to ${INACTIVE_SLOT} slot"
  else
    log_warn "Could not find listener rule — manual traffic shift may be required"
  fi

  # Scale down the current active slot
  aws ecs update-service \
    --cluster "${CLUSTER_NAME}" \
    --service "${ACTIVE_SERVICE}" \
    --desired-count 0 \
    --region "${AWS_REGION}" \
    > /dev/null

  log_success "Rollback complete — ${INACTIVE_SLOT} is now active"
  exit 0
fi

# ---------------------------------------------------------------------------
# Dry-run summary
# ---------------------------------------------------------------------------
if [[ "${DRY_RUN}" == "true" ]]; then
  echo ""
  echo -e "${BOLD}━━━ DRY RUN SUMMARY ━━━${NC}"
  echo "  Environment  : ${ENV}"
  echo "  Service      : ${SERVICE}"
  echo "  Image        : ${IMAGE_URI}"
  echo "  Active slot  : ${ACTIVE_SLOT}"
  echo "  Deploy to    : ${INACTIVE_SLOT} (${INACTIVE_SERVICE})"
  echo "  Smoke tests  : ${SMOKE_TESTS}"
  echo "  Canary mode  : ${CANARY}"
  echo ""
  log_warn "DRY RUN — no changes made"
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 2: Get current task definition and register new one
# ---------------------------------------------------------------------------
log_step "2/6" "Registering new task definition…"

CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${INACTIVE_SERVICE}" \
  --region "${AWS_REGION}" \
  --query "services[0].taskDefinition" \
  --output text)

log_info "Current task definition: ${CURRENT_TASK_DEF}"

# Get the task definition JSON and update the image
TASK_DEF_JSON=$(aws ecs describe-task-definition \
  --task-definition "${CURRENT_TASK_DEF}" \
  --region "${AWS_REGION}" \
  --query "taskDefinition" \
  --output json)

# Update the image in the first container
NEW_TASK_DEF_JSON=$(echo "${TASK_DEF_JSON}" | python3 -c "
import sys, json
td = json.load(sys.stdin)
td['containerDefinitions'][0]['image'] = '${IMAGE_URI}'
# Remove fields that can't be in RegisterTaskDefinition
for field in ['taskDefinitionArn','revision','status','requiresAttributes','compatibilities','registeredAt','registeredBy']:
    td.pop(field, None)
print(json.dumps(td))
")

NEW_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --region "${AWS_REGION}" \
  --cli-input-json "${NEW_TASK_DEF_JSON}" \
  --query "taskDefinition.taskDefinitionArn" \
  --output text)

log_success "New task definition: ${NEW_TASK_DEF_ARN}"

# ---------------------------------------------------------------------------
# Step 3: Deploy to inactive slot
# ---------------------------------------------------------------------------
log_step "3/6" "Deploying to ${INACTIVE_SLOT} slot (${INACTIVE_SERVICE})…"

aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${INACTIVE_SERVICE}" \
  --task-definition "${NEW_TASK_DEF_ARN}" \
  --desired-count 2 \
  --force-new-deployment \
  --region "${AWS_REGION}" \
  > /dev/null

log_success "ECS service update triggered"

# ---------------------------------------------------------------------------
# Step 4: Wait for health checks
# ---------------------------------------------------------------------------
log_step "4/6" "Waiting for ${INACTIVE_SLOT} slot to become healthy…"

INACTIVE_TG_ARN=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${INACTIVE_SERVICE}" \
  --region "${AWS_REGION}" \
  --query "services[0].loadBalancers[0].targetGroupArn" \
  --output text)

HEALTH_TIMEOUT=300
HEALTH_INTERVAL=15
ELAPSED=0
HEALTHY=false

while [[ "${ELAPSED}" -lt "${HEALTH_TIMEOUT}" ]]; do
  HEALTHY_COUNT=$(aws elbv2 describe-target-health \
    --target-group-arn "${INACTIVE_TG_ARN}" \
    --region "${AWS_REGION}" \
    --query "length(TargetHealthDescriptions[?TargetHealth.State=='healthy'])" \
    --output text 2>/dev/null || echo "0")

  log_info "Healthy targets: ${HEALTHY_COUNT} (elapsed: ${ELAPSED}s)"

  if [[ "${HEALTHY_COUNT}" -ge 1 ]]; then
    HEALTHY=true
    break
  fi

  sleep "${HEALTH_INTERVAL}"
  ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
done

if [[ "${HEALTHY}" != "true" ]]; then
  log_error "Health check timeout after ${HEALTH_TIMEOUT}s — rolling back"

  # Rollback: scale down inactive slot
  aws ecs update-service \
    --cluster "${CLUSTER_NAME}" \
    --service "${INACTIVE_SERVICE}" \
    --desired-count 0 \
    --region "${AWS_REGION}" \
    > /dev/null

  log_error "Deployment failed — ${ACTIVE_SLOT} slot remains active"
  exit 1
fi

log_success "Health checks passed"

# ---------------------------------------------------------------------------
# Step 5: Smoke tests
# ---------------------------------------------------------------------------
log_step "5/6" "Running smoke tests…"

if [[ "${SMOKE_TESTS}" == "true" ]]; then
  # Get a healthy target IP
  TARGET_IP=$(aws elbv2 describe-target-health \
    --target-group-arn "${INACTIVE_TG_ARN}" \
    --region "${AWS_REGION}" \
    --query "TargetHealthDescriptions[?TargetHealth.State=='healthy'][0].Target.Id" \
    --output text 2>/dev/null || echo "")

  if [[ -n "${TARGET_IP}" && "${TARGET_IP}" != "None" ]]; then
    PORT=3001
    if [[ "${SERVICE}" == "frontend" ]]; then PORT=80; fi

    SMOKE_URL="http://${TARGET_IP}:${PORT}/health"
    log_info "Smoke test URL: ${SMOKE_URL}"

    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      --connect-timeout 5 \
      --max-time 10 \
      "${SMOKE_URL}" 2>/dev/null || echo "000")

    if [[ "${HTTP_STATUS}" == "200" ]]; then
      log_success "Smoke test passed (HTTP ${HTTP_STATUS})"
    else
      log_error "Smoke test failed (HTTP ${HTTP_STATUS}) — rolling back"

      aws ecs update-service \
        --cluster "${CLUSTER_NAME}" \
        --service "${INACTIVE_SERVICE}" \
        --desired-count 0 \
        --region "${AWS_REGION}" \
        > /dev/null

      exit 1
    fi
  else
    log_warn "Could not get target IP for smoke test — skipping"
  fi
else
  log_warn "Smoke tests disabled"
fi

# ---------------------------------------------------------------------------
# Step 6: Shift traffic
# ---------------------------------------------------------------------------
log_step "6/6" "Shifting traffic to ${INACTIVE_SLOT} slot…"

ACTIVE_TG_ARN=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${ACTIVE_SERVICE}" \
  --region "${AWS_REGION}" \
  --query "services[0].loadBalancers[0].targetGroupArn" \
  --output text)

# Find the listener rule that currently forwards to the active target group
LISTENER_RULE_ARN=$(aws elbv2 describe-rules \
  --region "${AWS_REGION}" \
  --query "Rules[?Actions[?ForwardConfig.TargetGroups[?TargetGroupArn=='${ACTIVE_TG_ARN}']]] | [0].RuleArn" \
  --output text 2>/dev/null || echo "")

if [[ -z "${LISTENER_RULE_ARN}" || "${LISTENER_RULE_ARN}" == "None" ]]; then
  log_warn "Could not find listener rule — attempting to find by target group"
  # Try to find via the inactive target group
  LISTENER_RULE_ARN=$(aws elbv2 describe-rules \
    --region "${AWS_REGION}" \
    --query "Rules[?Actions[?ForwardConfig.TargetGroups[?TargetGroupArn=='${INACTIVE_TG_ARN}']]] | [0].RuleArn" \
    --output text 2>/dev/null || echo "")
fi

if [[ -n "${LISTENER_RULE_ARN}" && "${LISTENER_RULE_ARN}" != "None" ]]; then
  if [[ "${CANARY}" == "true" ]]; then
    # Canary: gradual traffic shift
    for WEIGHT in 10 25 50 100; do
      OLD_WEIGHT=$((100 - WEIGHT))
      log_info "Canary step: ${WEIGHT}% to ${INACTIVE_SLOT}, ${OLD_WEIGHT}% to ${ACTIVE_SLOT}"

      aws elbv2 modify-rule \
        --rule-arn "${LISTENER_RULE_ARN}" \
        --region "${AWS_REGION}" \
        --actions "[{\"Type\":\"forward\",\"ForwardConfig\":{\"TargetGroups\":[{\"TargetGroupArn\":\"${INACTIVE_TG_ARN}\",\"Weight\":${WEIGHT}},{\"TargetGroupArn\":\"${ACTIVE_TG_ARN}\",\"Weight\":${OLD_WEIGHT}}]}}]" \
        > /dev/null

      if [[ "${WEIGHT}" -lt 100 ]]; then
        log_info "Waiting 60s before next canary step…"
        sleep 60
      fi
    done
  else
    # Instant: 100% traffic shift
    aws elbv2 modify-rule \
      --rule-arn "${LISTENER_RULE_ARN}" \
      --region "${AWS_REGION}" \
      --actions "[{\"Type\":\"forward\",\"ForwardConfig\":{\"TargetGroups\":[{\"TargetGroupArn\":\"${INACTIVE_TG_ARN}\",\"Weight\":100},{\"TargetGroupArn\":\"${ACTIVE_TG_ARN}\",\"Weight\":0}]}}]" \
      > /dev/null
  fi

  log_success "Traffic shifted to ${INACTIVE_SLOT} slot"
else
  log_warn "Could not find listener rule — traffic shift must be done manually"
  log_warn "  New target group: ${INACTIVE_TG_ARN}"
  log_warn "  Old target group: ${ACTIVE_TG_ARN}"
fi

# Drain old slot after 60s
log_info "Waiting 60s for connections to drain from ${ACTIVE_SLOT} slot…"
sleep 60

aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${ACTIVE_SERVICE}" \
  --desired-count 0 \
  --region "${AWS_REGION}" \
  > /dev/null

log_success "Old slot (${ACTIVE_SLOT}) drained and scaled to 0"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━ DEPLOYMENT COMPLETE ━━━${NC}"
echo "  Environment  : ${ENV}"
echo "  Service      : ${SERVICE}"
echo "  Image        : ${IMAGE_URI}"
echo "  Previous slot: ${ACTIVE_SLOT}"
echo "  Active slot  : ${INACTIVE_SLOT}"
echo "  Task def     : ${NEW_TASK_DEF_ARN}"
echo ""
log_success "Blue-green deployment succeeded — ${INACTIVE_SLOT} is now active"
exit 0
