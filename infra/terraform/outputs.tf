output "web_url" {
  value       = "http://${aws_s3_bucket_website_configuration.web.website_endpoint}"
  description = "URL pública del Sitio Web Institucional (Demo)"
}

output "portal_url" {
  value       = "http://${aws_s3_bucket_website_configuration.portal.website_endpoint}"
  description = "URL pública del Portal de Clientes Pilli (Demo)"
}

output "api_gateway_url" {
  value       = aws_apigatewayv2_stage.default.invoke_url
  description = "URL pública del API Gateway Backend (Demo)"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.backend.repository_url
  description = "URL del repositorio AWS ECR para la imagen Docker"
}

output "s3_storage_bucket" {
  value       = aws_s3_bucket.storage.bucket
  description = "Nombre del Bucket S3 para custodia de PDFs"
}

output "sqs_queue_url" {
  value       = aws_sqs_queue.sat_jobs.url
  description = "URL de la cola SQS para trabajos de Koupper"
}
