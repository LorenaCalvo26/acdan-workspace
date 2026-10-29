locals {
  account_id     = data.aws_caller_identity.current.account_id
  partition      = data.aws_partition.current.partition
  region         = data.aws_region.current.name
  cluster_name   = "${var.project_name}-cluster"
  worker_family  = "${var.project_name}-worker"
  api_name       = "${var.project_name}-api-prod"
  scheduler_name = "${var.project_name}-tick"

  portal_has_custom = var.portal_domain != "" && var.acm_certificate_arn != ""
  web_has_custom    = var.web_domain != "" && var.acm_certificate_arn != ""

  cors_configured_origins = compact([
    trimsuffix(trimspace(var.portal_base_url), "/"),
    trimsuffix(trimspace(var.app_base_url), "/"),
    trimsuffix(trimspace(var.web_base_url), "/")
  ])
  # En producción solo portal/web. Si aún no hay URLs configuradas, deja
  # localhost para el primer apply local.
  cors_allowed_origins = length(local.cors_configured_origins) > 0 ? distinct(local.cors_configured_origins) : [
    "http://localhost:5173",
    "http://localhost:5174"
  ]

  tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )

  table_arns = [for table in aws_dynamodb_table.tables : table.arn]
  table_index_arns = [
    for table in aws_dynamodb_table.tables : "${table.arn}/index/*"
  ]

  # JSON que consume el worker desde Secrets Manager.
  backend_secret = {
    AUTH_JWT_DIAS       = "7"
    AUTH_JWT_SECRET     = random_password.jwt.result
    CONTACT_ADMIN_EMAIL = var.contact_admin_email
    EMAIL_FROM_NAME     = var.email_from_name
    LLM_API_KEY         = var.llm_api_key
    LLM_API_URL         = var.llm_api_url
    LLM_MODEL           = var.llm_model
    MAIL_DRIVER         = var.mail_driver
    MAIL_ENCRYPTION     = var.mail_encryption
    MAIL_HOST           = var.mail_host
    MAIL_PASSWORD       = var.mail_password
    MAIL_PORT           = var.mail_port
    MAIL_USERNAME       = var.mail_username
    NOTIFICAR_EMAILS    = var.notificar_emails
    BRAND_LOGO_URL      = var.brand_logo_url
    APP_BASE_URL        = var.app_base_url
    ACDAN_LOGO_URL      = var.acdan_logo_url
    PORTAL_BASE_URL     = var.portal_base_url
  }

  common_env = {
    DYNAMO_REGION           = var.aws_region
    ACDAN_CLIENTES          = var.table_clientes
    ACDAN_JOBS              = var.table_jobs
    ACDAN_DOCS              = var.table_docs
    ACDAN_USERS             = var.table_users
    KQ_SQS_REGION           = var.aws_region
    KQ_SQS_QUEUE_URL        = aws_sqs_queue.jobs.url
    KQ_SQS_DLQ_URL          = aws_sqs_queue.dlq.url
    DOCS_DRIVER             = "s3"
    S3_BUCKET               = aws_s3_bucket.docs.bucket
    S3_PREFIX               = var.docs_prefix
    CORS_ORIGINS            = join(",", local.cors_allowed_origins)
    TZ                      = "America/Mexico_City"
    ACDAN_SCHEDULER_ENABLED = "false"
  }

  lambda_env = merge(local.backend_secret, local.common_env, {
    ROLE                = "api"
    ECS_CLUSTER         = local.cluster_name
    ECS_TASK_DEFINITION = local.worker_family
    ECS_SUBNETS         = join(",", aws_subnet.public[*].id)
    ECS_SECURITY_GROUPS = aws_security_group.worker.id
    SQS_VISIBILITY      = "7200"
    SQS_MAX_MESSAGES    = "1"
  })

  worker_env = merge(local.common_env, {
    AWS_REGION               = var.aws_region
    ROLE                     = "worker"
    PORT                     = "8090"
    SAT_HEADLESS             = "true"
    SAT_POOL_SIZE            = "2"
    SQS_VISIBILITY           = "7200"
    SQS_MAX_MESSAGES         = "1"
    WORKER_IDLE_EXIT_SECONDS = "300"
    ECS_CLUSTER              = local.cluster_name
    ECS_TASK_DEFINITION      = local.worker_family
    ECS_SUBNETS              = join(",", aws_subnet.public[*].id)
    ECS_SECURITY_GROUPS      = aws_security_group.worker.id
  })
}
