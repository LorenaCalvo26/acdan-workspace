resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = local.api_name
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = var.api_image_uri
  memory_size   = 1536
  timeout       = 29
  publish       = false

  architectures = ["x86_64"]

  ephemeral_storage {
    size = 512
  }

  environment {
    variables = local.lambda_env
  }

  depends_on = [
    aws_cloudwatch_log_group.api,
    aws_iam_role_policy.lambda,
    aws_iam_role_policy_attachment.lambda_basic,
    aws_ecs_cluster_capacity_providers.main,
  ]
}
