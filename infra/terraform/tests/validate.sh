#!/usr/bin/env bash
##############################################################################
# validate.sh — Terraform IaC Validation Tests
#
# Runs structural and security checks on all Terraform configurations:
#   1. terraform fmt  — formatting consistency
#   2. terraform validate — syntax + schema validation
#   3. tfsec / checkov — security policy checks (if installed)
#   4. Custom checks  — required tags, sensitive variable markings, etc.
#
# Usage:
#   ./infra/terraform/tests/validate.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0

section() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
pass()    { echo -e "  ${GREEN}✓ $1${NC}"; PASS=$((PASS + 1)); }
fail()    { echo -e "  ${RED}✗ $1${NC}"; FAIL=$((FAIL + 1)); }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }

echo -e "${BOLD}🏗️  Nova Launch Terraform Validation${NC}"
echo "   Root: ${TERRAFORM_ROOT}"

# ---------------------------------------------------------------------------
# 1. Terraform format check
# ---------------------------------------------------------------------------
section "1. Terraform Format (fmt)"

if command -v terraform &>/dev/null; then
  if terraform fmt -check -recursive "${TERRAFORM_ROOT}" 2>&1; then
    pass "All .tf files are properly formatted"
  else
    fail "Some .tf files need formatting — run: terraform fmt -recursive infra/terraform/"
  fi
else
  warn "terraform not installed — skipping fmt check"
fi

# ---------------------------------------------------------------------------
# 2. Terraform validate (per environment, no backend)
# ---------------------------------------------------------------------------
section "2. Terraform Validate"

ENVIRONMENTS=("staging" "production")

for env in "${ENVIRONMENTS[@]}"; do
  env_dir="${TERRAFORM_ROOT}/environments/${env}"
  if [[ -d "${env_dir}" ]]; then
    if command -v terraform &>/dev/null; then
      pushd "${env_dir}" > /dev/null
      if terraform init -backend=false -input=false > /dev/null 2>&1 && \
         terraform validate > /dev/null 2>&1; then
        pass "terraform validate: ${env}"
      else
        fail "terraform validate failed: ${env}"
      fi
      popd > /dev/null
    else
      warn "terraform not installed — skipping validate for ${env}"
    fi
  else
    fail "Environment directory not found: ${env_dir}"
  fi
done

# ---------------------------------------------------------------------------
# 3. Required files check
# ---------------------------------------------------------------------------
section "3. Required Files"

REQUIRED_FILES=(
  "README.md"
  "modules/networking/main.tf"
  "modules/networking/variables.tf"
  "modules/networking/outputs.tf"
  "modules/ecr/main.tf"
  "modules/ecr/variables.tf"
  "modules/ecr/outputs.tf"
  "modules/rds/main.tf"
  "modules/rds/variables.tf"
  "modules/rds/outputs.tf"
  "modules/elasticache/main.tf"
  "modules/elasticache/variables.tf"
  "modules/elasticache/outputs.tf"
  "modules/alb/main.tf"
  "modules/alb/variables.tf"
  "modules/alb/outputs.tf"
  "modules/ecs/main.tf"
  "modules/ecs/variables.tf"
  "modules/ecs/outputs.tf"
  "modules/secrets/main.tf"
  "modules/secrets/variables.tf"
  "modules/secrets/outputs.tf"
  "environments/staging/main.tf"
  "environments/staging/variables.tf"
  "environments/staging/outputs.tf"
  "environments/staging/terraform.tfvars.example"
  "environments/production/main.tf"
  "environments/production/variables.tf"
  "environments/production/outputs.tf"
  "environments/production/terraform.tfvars.example"
)

for file in "${REQUIRED_FILES[@]}"; do
  full_path="${TERRAFORM_ROOT}/${file}"
  if [[ -f "${full_path}" ]]; then
    pass "File exists: ${file}"
  else
    fail "Missing required file: ${file}"
  fi
done

# ---------------------------------------------------------------------------
# 4. Security checks — sensitive variables must be marked sensitive = true
# ---------------------------------------------------------------------------
section "4. Sensitive Variable Declarations"

SENSITIVE_VARS=("jwt_secret" "admin_jwt_secret" "db_password" "redis_auth_token" "ipfs_api_key" "ipfs_api_secret")

for var_name in "${SENSITIVE_VARS[@]}"; do
  # Check that any variable with this name has sensitive = true
  found_sensitive=false
  while IFS= read -r -d '' tf_file; do
    if grep -q "variable \"${var_name}\"" "${tf_file}" 2>/dev/null; then
      # Check if the variable block contains sensitive = true
      if awk "/variable \"${var_name}\"/,/^}/" "${tf_file}" | grep -q "sensitive\s*=\s*true"; then
        found_sensitive=true
        break
      fi
    fi
  done < <(find "${TERRAFORM_ROOT}" -name "variables.tf" -print0)

  if [[ "${found_sensitive}" == "true" ]]; then
    pass "Variable '${var_name}' is marked sensitive"
  else
    fail "Variable '${var_name}' is NOT marked sensitive = true"
  fi
done

# ---------------------------------------------------------------------------
# 5. No hardcoded secrets check
# ---------------------------------------------------------------------------
section "5. No Hardcoded Secrets"

SECRET_PATTERNS=(
  "password\s*=\s*\"[^\"]{8,}\""
  "secret\s*=\s*\"[^\"]{8,}\""
  "api_key\s*=\s*\"[^\"]{8,}\""
)

HARDCODED_FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  # Exclude example files and variable declarations
  matches=$(grep -rn --include="*.tf" -E "${pattern}" "${TERRAFORM_ROOT}" \
    --exclude-path="*/terraform.tfvars*" \
    --exclude-path="*/.terraform/*" 2>/dev/null | \
    grep -v "variable\s*\"" | \
    grep -v "description\s*=" | \
    grep -v "\.example" || true)

  if [[ -n "${matches}" ]]; then
    fail "Potential hardcoded secret matching '${pattern}':"
    echo "${matches}" | while IFS= read -r line; do
      echo "    ${line}"
    done
    HARDCODED_FOUND=1
  fi
done

if [[ "${HARDCODED_FOUND}" -eq 0 ]]; then
  pass "No hardcoded secrets detected in .tf files"
fi

# ---------------------------------------------------------------------------
# 6. tfvars.example files must not contain real secrets
# ---------------------------------------------------------------------------
section "6. tfvars.example Safety"

while IFS= read -r -d '' example_file; do
  # Check that example files use REPLACE_ placeholders, not real values
  if grep -qE "(password|secret|key)\s*=\s*\"[^\"]{20,}\"" "${example_file}" 2>/dev/null; then
    # Check if it's a placeholder
    if grep -qE "REPLACE_WITH" "${example_file}" 2>/dev/null; then
      pass "$(basename "$(dirname "${example_file}")")/terraform.tfvars.example uses REPLACE_ placeholders"
    else
      fail "$(basename "$(dirname "${example_file}")")/terraform.tfvars.example may contain real secrets"
    fi
  else
    pass "$(basename "$(dirname "${example_file}")")/terraform.tfvars.example looks safe"
  fi
done < <(find "${TERRAFORM_ROOT}" -name "terraform.tfvars.example" -print0)

# ---------------------------------------------------------------------------
# 7. tfsec (optional — skip if not installed)
# ---------------------------------------------------------------------------
section "7. tfsec Security Scan (optional)"

if command -v tfsec &>/dev/null; then
  if tfsec "${TERRAFORM_ROOT}" --no-color --minimum-severity HIGH 2>&1; then
    pass "tfsec: no HIGH or CRITICAL issues found"
  else
    fail "tfsec: security issues found"
  fi
else
  warn "tfsec not installed — skipping (install: https://github.com/aquasecurity/tfsec)"
fi

# ---------------------------------------------------------------------------
# 8. checkov (optional — skip if not installed)
# ---------------------------------------------------------------------------
section "8. Checkov Security Scan (optional)"

if command -v checkov &>/dev/null; then
  if checkov -d "${TERRAFORM_ROOT}" --framework terraform --quiet 2>&1; then
    pass "checkov: no issues found"
  else
    fail "checkov: security issues found"
  fi
else
  warn "checkov not installed — skipping (install: pip install checkov)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━ Summary ━━━${NC}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
echo -e "  ${RED}Failed: ${FAIL}${NC}"
echo ""

if [[ "${FAIL}" -gt 0 ]]; then
  echo -e "${RED}${BOLD}❌ Terraform validation FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}✅ Terraform validation PASSED${NC}"
  exit 0
fi
