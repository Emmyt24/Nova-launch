##############################################################################
# Module: elasticache
#
# Creates an Amazon ElastiCache Redis 7 cluster for rate limiting and
# session caching. Deployed in private subnets with encryption in transit
# and at rest.
##############################################################################

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.project}-${var.environment}-redis-subnet-group"
  description = "Subnet group for Nova Launch Redis"
  subnet_ids  = var.private_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.project}-${var.environment}-redis-subnet-group"
  })
}

resource "aws_security_group" "redis" {
  name        = "${var.project}-${var.environment}-redis-sg"
  description = "Security group for Nova Launch ElastiCache Redis"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.allowed_security_group_ids
    content {
      description     = "Redis from ECS tasks"
      from_port       = 6379
      to_port         = 6379
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project}-${var.environment}-redis-sg"
  })
}

resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project}-${var.environment}-redis7"
  family = "redis7"

  # Disable dangerous commands
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = var.tags
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project}-${var.environment}-redis"
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_nodes      = var.num_cache_nodes
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  port                 = 6379

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = var.auth_token != "" ? true : false
  auth_token                 = var.auth_token != "" ? var.auth_token : null

  # Maintenance
  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_retention_limit = 1
  snapshot_window          = "04:00-05:00"

  apply_immediately = false

  tags = merge(var.tags, {
    Name = "${var.project}-${var.environment}-redis"
  })
}

# CloudWatch alarm for high memory usage
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.project}-${var.environment}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Redis memory usage exceeds 80%"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.main.id
  }

  tags = var.tags
}
