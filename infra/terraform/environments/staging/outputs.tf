output "alb_dns_name"              { value = module.alb.alb_dns_name }
output "backend_ecr_repository_url"  { value = module.ecr.backend_repository_url }
output "frontend_ecr_repository_url" { value = module.ecr.frontend_repository_url }
output "rds_endpoint"              { value = module.rds.endpoint }
output "redis_endpoint"            { value = module.elasticache.endpoint }
output "ecs_cluster_id"            { value = module.ecs.cluster_id }
output "nat_public_ips"            { value = module.networking.nat_public_ips }
