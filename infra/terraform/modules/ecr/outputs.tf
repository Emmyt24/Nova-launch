output "backend_repository_url"  { value = aws_ecr_repository.backend.repository_url }
output "frontend_repository_url" { value = aws_ecr_repository.frontend.repository_url }
output "backend_repository_arn"  { value = aws_ecr_repository.backend.arn }
output "frontend_repository_arn" { value = aws_ecr_repository.frontend.arn }
