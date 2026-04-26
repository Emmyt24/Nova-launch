variable "project"       { type = string }
variable "environment"   { type = string }
variable "max_image_count" {
  description = "Maximum number of tagged images to retain per repository"
  type        = number
  default     = 10
}
variable "tags" { type = map(string); default = {} }
