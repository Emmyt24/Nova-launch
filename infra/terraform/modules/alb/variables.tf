variable "project"             { type = string }
variable "environment"         { type = string }
variable "vpc_id"              { type = string }
variable "public_subnet_ids"   { type = list(string) }
variable "acm_certificate_arn" { type = string }
variable "aws_account_id"      { type = string }
variable "log_retention_days"  { type = number; default = 90 }
variable "tags"                { type = map(string); default = {} }

# ELB service account ID per region — used for S3 bucket policy
# See: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html
variable "elb_account_id" {
  description = "AWS ELB service account ID for the target region"
  type        = string
  default     = "127311923021" # us-east-1
}
