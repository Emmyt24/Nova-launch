output "endpoint"          { value = aws_elasticache_cluster.main.cache_nodes[0].address }
output "port"              { value = aws_elasticache_cluster.main.port }
output "redis_url"         { value = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.port}" }
output "security_group_id" { value = aws_security_group.redis.id }
output "cluster_id"        { value = aws_elasticache_cluster.main.id }
