variable "project"             { type = string }
variable "environment"         { type = string }
variable "aws_region"          { type = string }
variable "aws_account_id"      { type = string }
variable "vpc_id"              { type = string }
variable "private_subnet_ids"  { type = list(string) }
variable "alb_security_group_id"       { type = string }
variable "backend_blue_target_group_arn"  { type = string }
variable "backend_green_target_group_arn" { type = string }
variable "frontend_blue_target_group_arn"  { type = string }
variable "frontend_green_target_group_arn" { type = string }
variable "backend_ecr_image"   { type = string }
variable "frontend_ecr_image"  { type = string }
variable "log_retention_days"  { type = number; default = 30 }
variable "backend_cpu"         { type = number; default = 512 }
variable "backend_memory"      { type = number; default = 1024 }
variable "frontend_cpu"        { type = number; default = 256 }
variable "frontend_memory"     { type = number; default = 512 }
variable "node_env"            { type = string; default = "production" }
variable "port"                { type = string; default = "3001" }
variable "stellar_network"     { type = string; default = "mainnet" }
variable "stellar_horizon_url" { type = string }
variable "frontend_url"        { type = string }
variable "database_url"        { type = string; sensitive = true }
variable "redis_url"           { type = string }
variable "jwt_secret_arn"          { type = string }
variable "admin_jwt_secret_arn"    { type = string }
variable "factory_contract_id_arn" { type = string }
variable "backend_min_count"   { type = number; default = 1 }
variable "backend_max_count"   { type = number; default = 10 }
variable "tags" { type = map(string); default = {} }
