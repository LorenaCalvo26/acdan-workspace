output "account_id" {
  value = local.account_id
}

output "region" {
  value = local.region
}

output "portal_url" {
  value = local.portal_has_custom ? "https://${var.portal_domain}" : "https://${aws_cloudfront_distribution.portal.domain_name}"
}

output "web_url" {
  value = local.web_has_custom ? "https://${var.web_domain}" : "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "api_url" {
  value = "https://${aws_apigatewayv2_api.http.id}.execute-api.${local.region}.amazonaws.com"
}

output "api_cloudfront_url" {
  value = "${local.portal_has_custom ? "https://${var.portal_domain}" : "https://${aws_cloudfront_distribution.portal.domain_name}"}/api/v1"
}

output "portal_bucket" {
  value = aws_s3_bucket.portal.bucket
}

output "web_bucket" {
  value = aws_s3_bucket.web.bucket
}

output "docs_bucket" {
  value = aws_s3_bucket.docs.bucket
}

output "ecr_api_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecr_worker_repository_url" {
  value = aws_ecr_repository.worker.repository_url
}

output "api_lambda_name" {
  value = aws_lambda_function.api.function_name
}

output "api_gateway_id" {
  value = aws_apigatewayv2_api.http.id
}

output "cloudfront_portal_id" {
  value = aws_cloudfront_distribution.portal.id
}

output "cloudfront_web_id" {
  value = aws_cloudfront_distribution.web.id
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "worker_task_definition_family" {
  value = aws_ecs_task_definition.worker.family
}

output "worker_subnets" {
  value = join(",", aws_subnet.public[*].id)
}

output "worker_security_group" {
  value = aws_security_group.worker.id
}

output "jobs_queue_url" {
  value = aws_sqs_queue.jobs.url
}

output "scheduler_name" {
  value = try(aws_scheduler_schedule.tick[0].name, "")
}

output "sns_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "secret_sat_backend_name" {
  value = aws_secretsmanager_secret.sat_backend.name
}

output "secret_task_keys_name" {
  value = aws_secretsmanager_secret.task_keys.name
}

output "tables" {
  value = {
    clientes = aws_dynamodb_table.tables["clientes"].name
    jobs     = aws_dynamodb_table.tables["jobs"].name
    docs     = aws_dynamodb_table.tables["docs"].name
    users    = aws_dynamodb_table.tables["users"].name
  }
}
