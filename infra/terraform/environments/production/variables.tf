variable "aws_region"     { type = string; default = "us-east-1" }
variable "aws_account_id" { type = string }
variable "jwt_secret"          { type = string; sensitive = true }
variable "admin_jwt_secret"    { type = string; sensitive = true }
variable "db_password"         { type = string; sensitive = true }
variable "redis_auth_token"    { type = string; sensitive = true; default = "" }
variable "factory_contract_id" { type = string; default = "" }
variable "ipfs_api_key"        { type = string; sensitive = true; default = "" }
variable "ipfs_api_secret"     { type = string; sensitive = true; default = "" }
variable "acm_certificate_arn" { type = string }
variable "backend_image_tag"   { type = string; default = "latest" }
variable "frontend_image_tag"  { type = string; default = "latest" }
variable "stellar_network"     { type = string; default = "mainnet" }
variable "stellar_horizon_url" { type = string; default = "https://horizon.stellar.org" }
variable "frontend_url"        { type = string; default = "https://nova-launch.io" }
