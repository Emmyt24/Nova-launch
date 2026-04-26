output "jwt_secret_arn"          { value = aws_secretsmanager_secret.jwt_secret.arn }
output "admin_jwt_secret_arn"    { value = aws_secretsmanager_secret.admin_jwt_secret.arn }
output "db_password_arn"         { value = aws_secretsmanager_secret.db_password.arn }
output "factory_contract_id_arn" { value = aws_secretsmanager_secret.factory_contract_id.arn }
output "ipfs_credentials_arn"    { value = aws_secretsmanager_secret.ipfs_credentials.arn }
output "redis_auth_token_arn" {
  value = var.redis_auth_token != "" ? aws_secretsmanager_secret.redis_auth_token[0].arn : null
}
