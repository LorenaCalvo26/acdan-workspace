terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

resource "random_id" "suffix" {
  byte_length = 4
}

# ==============================================================================
# 1. TABLAS DYNAMODB (Always Free)
# ==============================================================================
resource "aws_dynamodb_table" "clientes" {
  name         = "ACDAN_CLIENTES"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_dynamodb_table" "jobs" {
  name         = "ACDAN_JOBS"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_dynamodb_table" "docs" {
  name         = "ACDAN_DOCS"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "ACDAN_USERS"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# ==============================================================================
# 2. COLA DE TRABAJOS SQS (Always Free)
# ==============================================================================
resource "aws_sqs_queue" "sat_jobs" {
  name                       = "${var.project_name}-jobs"
  visibility_timeout_seconds = 900 # 15 minutos (máximo timeout Lambda)
  message_retention_seconds  = 86400

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# ==============================================================================
# 3. BUCKETS DE AMAZON S3
# ==============================================================================
# A) Hosting Sitio Web Institucional
resource "aws_s3_bucket" "web" {
  bucket        = "${var.project_name}-web-${random_id.suffix.hex}"
  force_destroy = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_s3_bucket_website_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "web_policy" {
  bucket     = aws_s3_bucket.web.id
  depends_on = [aws_s3_bucket_public_access_block.web]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web.arn}/*"
      }
    ]
  })
}

# B) Hosting Portal Pilli (Clientes)
resource "aws_s3_bucket" "portal" {
  bucket        = "${var.project_name}-portal-${random_id.suffix.hex}"
  force_destroy = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_s3_bucket_website_configuration" "portal" {
  bucket = aws_s3_bucket.portal.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "portal" {
  bucket = aws_s3_bucket.portal.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "portal_policy" {
  bucket     = aws_s3_bucket.portal.id
  depends_on = [aws_s3_bucket_public_access_block.portal]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.portal.arn}/*"
      }
    ]
  })
}

# C) Custodia Privada de PDFs SAT
resource "aws_s3_bucket" "storage" {
  bucket        = "${var.project_name}-storage-${random_id.suffix.hex}"
  force_destroy = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# ==============================================================================
# 4. AWS ECR REPOSITORY (Imágenes Docker de Lambda)
# ==============================================================================
resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# ==============================================================================
# 5. IAM ROLE PARA LAMBDA
# ==============================================================================
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:*"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:*"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:*"
        ]
        Resource = "*"
      }
    ]
  })
}

# ==============================================================================
# 6. API GATEWAY HTTP (v2)
# ==============================================================================
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}
