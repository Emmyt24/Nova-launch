output "alb_arn"                  { value = aws_lb.main.arn }
output "alb_dns_name"             { value = aws_lb.main.dns_name }
output "alb_zone_id"              { value = aws_lb.main.zone_id }
output "alb_security_group_id"    { value = aws_security_group.alb.id }
output "backend_target_group_arn" { value = aws_lb_target_group.backend.arn }
output "frontend_target_group_arn"{ value = aws_lb_target_group.frontend.arn }
output "https_listener_arn"       { value = aws_lb_listener.https.arn }

# ARN suffix used in CloudWatch metric dimensions (e.g. "app/nova-launch-prod-alb/abc123")
output "alb_arn_suffix" {
  description = "ALB ARN suffix for use in CloudWatch metric dimensions"
  value       = aws_lb.main.arn_suffix
}
