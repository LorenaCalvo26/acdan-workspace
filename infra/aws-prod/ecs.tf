resource "aws_ecs_cluster" "main" {
  name = local.cluster_name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.project_name}-worker"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "worker" {
  family                   = local.worker_family
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = tostring(var.worker_cpu)
  memory                   = tostring(var.worker_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = var.worker_image_uri
      essential = true

      portMappings = [
        {
          containerPort = 8090
          hostPort      = 8090
          protocol      = "tcp"
        }
      ]

      environment = [
        for key, value in local.worker_env : {
          name  = key
          value = tostring(value)
        }
      ]

      secrets = concat(
        [
          for key, value in local.backend_secret : {
            name      = key
            valueFrom = "${aws_secretsmanager_secret.sat_backend.arn}:${key}::"
          }
        ],
        [
          {
            name      = "AWS_ACCESS_KEY_ID"
            valueFrom = "${aws_secretsmanager_secret.task_keys.arn}:AWS_ACCESS_KEY_ID::"
          },
          {
            name      = "AWS_SECRET_ACCESS_KEY"
            valueFrom = "${aws_secretsmanager_secret.task_keys.arn}:AWS_SECRET_ACCESS_KEY::"
          }
        ]
      )

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "backend"
        }
      }
    }
  ])

  depends_on = [
    aws_cloudwatch_log_group.worker,
    aws_secretsmanager_secret_version.sat_backend,
    aws_secretsmanager_secret_version.task_keys,
    aws_iam_role_policy.execution_secrets,
    aws_iam_role_policy.worker,
  ]
}
