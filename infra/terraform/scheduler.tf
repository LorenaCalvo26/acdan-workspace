# 7. PROGRAMADOR (EventBridge Scheduler -> Lambda API)
# Cada hora invoca la Lambda del API sin evento HTTP: el entrypoint detecta
# la invocación scheduler (sin path/method) y corre schedulerTick, que encola
# los clientes con proximoRun vencido. Sin timer dentro de la JVM.
# Se crea solo si se proporciona el ARN de la Lambda del API.

resource "aws_iam_role" "scheduler_exec" {
  count = var.scheduler_enabled && trimspace(var.scheduler_lambda_arn) != "" ? 1 : 0
  name  = "${var.project_name}-scheduler-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  count = var.scheduler_enabled && trimspace(var.scheduler_lambda_arn) != "" ? 1 : 0
  name  = "${var.project_name}-scheduler-invoke"
  role  = aws_iam_role.scheduler_exec[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = trimspace(var.scheduler_lambda_arn)
    }]
  })
}

resource "aws_scheduler_schedule" "tick" {
  count = var.scheduler_enabled && trimspace(var.scheduler_lambda_arn) != "" ? 1 : 0
  name  = "${var.project_name}-tick"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = "rate(1 hour)"
  schedule_expression_timezone = "America/Mexico_City"

  target {
    arn      = trimspace(var.scheduler_lambda_arn)
    role_arn = aws_iam_role.scheduler_exec[0].arn

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 0
    }
  }
}
