variable "project"            { type = string }
variable "environment"        { type = string }
variable "vpc_id"             { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "allowed_security_group_ids" { type = list(string) }
variable "node_type"          { type = string; default = "cache.t3.micro" }
variable "num_cache_nodes"    { type = number; default = 1 }
variable "engine_version"     { type = string; default = "7.1" }
variable "auth_token"         { type = string; sensitive = true; default = "" }
variable "tags"               { type = map(string); default = {} }
