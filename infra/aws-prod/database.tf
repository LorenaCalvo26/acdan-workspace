locals {
  tables = {
    clientes = var.table_clientes
    jobs     = var.table_jobs
    docs     = var.table_docs
    users    = var.table_users
  }
}

resource "aws_dynamodb_table" "tables" {
  for_each = local.tables

  name         = each.value
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = false

  tags = {
    Name = each.value
  }
}

resource "aws_sqs_queue" "dlq" {
  name                       = "${var.jobs_queue_name}-dlq"
  visibility_timeout_seconds = 7200
  message_retention_seconds  = 1209600
  sqs_managed_sse_enabled    = true
}

resource "aws_sqs_queue" "jobs" {
  name                       = var.jobs_queue_name
  visibility_timeout_seconds = 7200
  message_retention_seconds  = 86400
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}
