resource "aws_scheduler_schedule" "tick" {
  count = var.scheduler_enabled ? 1 : 0

  name                = local.scheduler_name
  schedule_expression = "rate(1 hour)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 0
    }
  }
}
