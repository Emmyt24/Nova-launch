##############################################################################
# Module: secrets
#
# Creates AWS Secrets Manager entries for all sensitive Nova Launch
# configuration values. ECS tasks reference these secrets by ARN so
# plaintext values never appear in task definitions or environment variables.
#
# Secrets created:
#   - jwt_secret          — JWT signing key
#   - admin_jwt_secret    — Admin JWT signing key
#   - db_password         — RDS master password
#   - redis_auth_token    — ElastiCache auth token (optional)
#   - factory_contract_id — Soroban contract ID
#   - ipfs_credentials    — IPFS API key + secret
##############################################################################

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  prefix = "${var.project}/${var.environment}"
}

# ---------------------------------------------------------------------------
# JWT Secret
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.prefix}/jwt-secret"
  description             = "JWT signing key for Nova Launch backend"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { Name = "${local.prefix}/jwt-secret" })
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret

  lifecycle {
    # Prevent Terraform from overwriting a secret that was rotated externally
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# Admin JWT Secret
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "admin_jwt_secret" {
  name                    = "${local.prefix}/admin-jwt-secret"
  description             = "Admin JWT signing key for Nova Launch backend"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { Name = "${local.prefix}/admin-jwt-secret" })
}

resource "aws_secretsmanager_secret_version" "admin_jwt_secret" {
  secret_id     = aws_secretsmanager_secret.admin_jwt_secret.id
  secret_string = var.admin_jwt_secret

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# Database Password
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${local.prefix}/db-password"
  description             = "RDS PostgreSQL master password for Nova Launch"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { Name = "${local.prefix}/db-password" })
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# Redis Auth Token (optional — only created when auth is enabled)
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "redis_auth_token" {
  count = var.redis_auth_token != "" ? 1 : 0

  name                    = "${local.prefix}/redis-auth-token"
  description             = "ElastiCache Redis auth token for Nova Launch"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { Name = "${local.prefix}/redis-auth-token" })
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  count = var.redis_auth_token != "" ? 1 : 0

  secret_id     = aws_secretsmanager_secret.redis_auth_token[0].id
  secret_string = var.redis_auth_token

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# Soroban Factory Contract ID
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "factory_contract_id" {
  name                    = "${local.prefix}/factory-contract-id"
  description             = "Soroban token factory contract ID for Nova Launch"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { Name = "${local.prefix}/factory-contract-id" })
}

resource "aws_secretsmanager_secret_version" "factory_contract_id" {
  secret_id     = aws_secretsmanager_secret.factory_contract_id.id
  secret_string = var.factory_contract_id

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# IPFS Credentials
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "ipfs_credentials" {
  name                    = "${local.prefix}/ipfs-credentials"
  description             = "IPFS API key and secret for Nova Launch"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, { Name = "${local.prefix}/ipfs-credentials" })
}

resource "aws_secretsmanager_secret_version" "ipfs_credentials" {
  secret_id = aws_secretsmanager_secret.ipfs_credentials.id
  secret_string = jsonencode({
    api_key    = var.ipfs_api_key
    api_secret = var.ipfs_api_secret
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
