variable "project"     { type = string }
variable "environment" { type = string }

variable "jwt_secret" {
  description = "JWT signing key (min 32 chars)"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "jwt_secret must be at least 32 characters."
  }
}

variable "admin_jwt_secret" {
  description = "Admin JWT signing key (min 32 chars)"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.admin_jwt_secret) >= 32
    error_message = "admin_jwt_secret must be at least 32 characters."
  }
}

variable "db_password" {
  description = "RDS master password (min 16 chars)"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.db_password) >= 16
    error_message = "db_password must be at least 16 characters."
  }
}

variable "redis_auth_token" {
  description = "ElastiCache Redis auth token (leave empty to disable auth)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "factory_contract_id" {
  description = "Soroban factory contract ID (56-char, starts with C)"
  type        = string
  default     = ""
}

variable "ipfs_api_key" {
  description = "IPFS API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ipfs_api_secret" {
  description = "IPFS API secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "recovery_window_days" {
  description = "Days before a deleted secret is permanently removed (0 = immediate)"
  type        = number
  default     = 7
}

variable "tags" { type = map(string); default = {} }
