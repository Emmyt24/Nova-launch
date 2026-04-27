##############################################################################
# Module: ecs-blue-green
#
# Provisions the ECS infrastructure required for blue-green deployments:
#   - One ECS cluster
#   - Two ECS services per application (blue + green) for backend and frontend
#   - Shared task definitions (updated by CI/CD, not Terraform)
#   - IAM roles, security groups, CloudWatch log groups
#
# Blue-green topology:
#   backend-blue  → backend-blue-tg  (ALB forwards here when blue is active)
#   backend-green → backend-green-tg (ALB forwards here when green is active)
#   frontend-blue  → frontend-blue-tg
#   frontend-green → frontend-green-tg
#
# Traffic shifting is handled by the deploy-blue-green.sh script, NOT Terraform.
# Terraform only provisions the static infrastructure.
##############################################################################

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  name_prefix = "${var.project}-${var.environment}"
}

# ---------------------------------------------------------------------------
# ECS Cluster
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-cluster"
  })
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project}/${var.environment}/backend"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${var.project}/${var.environment}/frontend"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# ---------------------------------------------------------------------------
# IAM Roles
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_secrets" {
  name = "${local.name_prefix}-ecs-secrets-policy"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
      Resource = [var.jwt_secret_arn, var.admin_jwt_secret_arn, var.factory_contract_id_arn]
    }]
  })
}

resource "aws_iam_role" "backend_task" {
  name = "${local.name_prefix}-backend-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "backend_task" {
  name = "${local.name_prefix}-backend-task-policy"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["cloudwatch:PutMetricData", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "*"
    }]
  })
}

# ---------------------------------------------------------------------------
# Security Groups
# ---------------------------------------------------------------------------

resource "aws_security_group" "backend" {
  name        = "${local.name_prefix}-backend-sg"
  description = "Security group for Nova Launch backend ECS tasks (blue-green)"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Backend API from ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-backend-sg" })
}

resource "aws_security_group" "frontend" {
  name        = "${local.name_prefix}-frontend-sg"
  description = "Security group for Nova Launch frontend ECS tasks (blue-green)"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-frontend-sg" })
}

# ---------------------------------------------------------------------------
# Task Definitions (initial — updated by CI/CD)
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = var.backend_ecr_image
    essential = true
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV",            value = var.node_env },
      { name = "PORT",                value = var.port },
      { name = "STELLAR_NETWORK",     value = var.stellar_network },
      { name = "STELLAR_HORIZON_URL", value = var.stellar_horizon_url },
      { name = "FRONTEND_URL",        value = var.frontend_url },
      { name = "DATABASE_URL",        value = var.database_url },
      { name = "REDIS_URL",           value = var.redis_url },
      { name = "METRICS_ENABLED",     value = "true" },
    ]
    secrets = [
      { name = "JWT_SECRET",          valueFrom = var.jwt_secret_arn },
      { name = "ADMIN_JWT_SECRET",    valueFrom = var.admin_jwt_secret_arn },
      { name = "FACTORY_CONTRACT_ID", valueFrom = var.factory_contract_id_arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3001/health',(r)=>{process.exit(r.statusCode===200?0:1)})\""]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
    user = "1001"
  }])

  lifecycle {
    # Task definition is updated by CI/CD — Terraform only creates the initial version
    ignore_changes = [container_definitions]
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-backend-task" })
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name_prefix}-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = var.frontend_ecr_image
    essential = true
    portMappings = [{ containerPort = 80, protocol = "tcp" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "frontend"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost:80/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])

  lifecycle {
    ignore_changes = [container_definitions]
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-frontend-task" })
}

# ---------------------------------------------------------------------------
# ECS Services — Blue slot (initially active, desired_count=2)
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "backend_blue" {
  name            = "${local.name_prefix}-backend-blue"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.backend_blue_target_group_arn
    container_name   = "backend"
    container_port   = 3001
  }

  deployment_circuit_breaker { enable = true; rollback = true }
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-backend-blue"
    Slot = "blue"
  })
}

# ---------------------------------------------------------------------------
# ECS Services — Green slot (initially inactive, desired_count=0)
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "backend_green" {
  name            = "${local.name_prefix}-backend-green"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 0   # Inactive at creation; activated by deploy script
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.backend_green_target_group_arn
    container_name   = "backend"
    container_port   = 3001
  }

  deployment_circuit_breaker { enable = true; rollback = true }
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, {
    Name = "${local.name_prefix}-backend-green"
    Slot = "green"
  })
}

resource "aws_ecs_service" "frontend_blue" {
  name            = "${local.name_prefix}-frontend-blue"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.frontend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.frontend_blue_target_group_arn
    container_name   = "frontend"
    container_port   = 80
  }

  deployment_circuit_breaker { enable = true; rollback = true }
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-frontend-blue", Slot = "blue" })
}

resource "aws_ecs_service" "frontend_green" {
  name            = "${local.name_prefix}-frontend-green"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.frontend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.frontend_green_target_group_arn
    container_name   = "frontend"
    container_port   = 80
  }

  deployment_circuit_breaker { enable = true; rollback = true }
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-frontend-green", Slot = "green" })
}
