variable "project"            { type = string }
variable "environment"        { type = string }
variable "vpc_id"             { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to RDS (e.g. ECS task SG)"
  type        = list(string)
}
variable "db_name"            { type = string; default = "nova_launch" }
variable "db_username"        { type = string; default = "nova_user" }
variable "db_password"        { type = string; sensitive = true }
variable "instance_class"     { type = string; default = "db.t3.micro" }
variable "allocated_storage"  { type = number; default = 20 }
variable "max_allocated_storage" { type = number; default = 100 }
variable "engine_version"     { type = string; default = "16.3" }
variable "multi_az"           { type = bool; default = false }
variable "backup_retention_days" { type = number; default = 7 }
variable "deletion_protection" { type = bool; default = true }
variable "skip_final_snapshot" { type = bool; default = false }
variable "log_retention_days" { type = number; default = 30 }
variable "tags"               { type = map(string); default = {} }
