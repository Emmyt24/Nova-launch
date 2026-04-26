##############################################################################
# Staging environment — Variables
##############################################################################

variable "aws_region"     { type = string; default = "us-east-1" }
variable "aws_account_id" { type = string }

# Secrets (provided via CI/CD or terraform.tfvars — never committed)
variable "jwt_secret"          { type = string; sensitive = true }
variable "admin_jwt_secret"    { type = string; sensitive = true }
variable "db_password"         { type = string; sensitive = true }
variable "redis_auth_token"    { type = string; sensitive = true; default = "" }
variable "factory_contract_id" { type = string; default = "" }
variable "ipfs_api_key"        { type = string; sensitive = true; default = "" }
variable "ipfs_api_secret"     { type = string; sensitive = true; default = "" }

# ACM certificate ARN for the staging domain
variable "acm_certificate_arn" { type = string }

# Container image tags (set by CI/CD pipeline)
variable "backend_image_tag"  { type = string; default = "latest" }
variable "frontend_image_tag" { type = string; default = "latest" }

# Stellar
variable "stellar_network"     { type = string; default = "testnet" }
variable "stellar_horizon_url" { type = string; default = "https://horizon-testnet.stellar.org" }
variable "frontend_url"        { type = string; default = "https://staging.nova-launch.io" }
