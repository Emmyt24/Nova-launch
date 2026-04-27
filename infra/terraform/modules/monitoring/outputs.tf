##############################################################################
# Module: monitoring — Outputs
##############################################################################

output "sns_topic_arn" {
  description = "ARN of the SNS topic for alarm notifications"
  value       = aws_sns_topic.alarms.arn
}

output "sns_topic_name" {
  description = "Name of the SNS topic for alarm notifications"
  value       = aws_sns_topic.alarms.name
}

output "api_dashboard_name" {
  description = "Name of the API CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.api.dashboard_name
}

output "infrastructure_dashboard_name" {
  description = "Name of the infrastructure CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.infrastructure.dashboard_name
}

output "composite_alarm_arn" {
  description = "ARN of the composite 'platform degraded' alarm"
  value       = aws_cloudwatch_composite_alarm.platform_degraded.arn
}

output "composite_alarm_name" {
  description = "Name of the composite 'platform degraded' alarm"
  value       = aws_cloudwatch_composite_alarm.platform_degraded.alarm_name
}
