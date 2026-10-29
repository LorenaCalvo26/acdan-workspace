resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "portal" {
  bucket        = "${var.project_name}-pilli-${random_id.suffix.hex}"
  force_destroy = true

  tags = {
    Name = "${var.project_name}-portal"
  }
}

resource "aws_s3_bucket" "web" {
  bucket        = "${var.project_name}-web-${random_id.suffix.hex}"
  force_destroy = true

  tags = {
    Name = "${var.project_name}-web"
  }
}

resource "aws_s3_bucket" "docs" {
  bucket        = "${var.project_name}-docs-${random_id.suffix.hex}"
  force_destroy = false

  tags = {
    Name = "${var.project_name}-docs"
  }
}

resource "aws_s3_bucket_versioning" "all" {
  for_each = {
    portal = aws_s3_bucket.portal.id
    web    = aws_s3_bucket.web.id
    docs   = aws_s3_bucket.docs.id
  }

  bucket = each.value

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "all" {
  for_each = {
    portal = aws_s3_bucket.portal.id
    web    = aws_s3_bucket.web.id
    docs   = aws_s3_bucket.docs.id
  }

  bucket = each.value

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = {
    portal = aws_s3_bucket.portal.id
    web    = aws_s3_bucket.web.id
    docs   = aws_s3_bucket.docs.id
  }

  bucket = each.value

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "portal" {
  statement {
    sid       = "AllowCloudFrontPortal"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.portal.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.portal.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "portal" {
  bucket = aws_s3_bucket.portal.id
  policy = data.aws_iam_policy_document.portal.json

  depends_on = [aws_s3_bucket_public_access_block.all["portal"]]
}

data "aws_iam_policy_document" "web" {
  statement {
    sid       = "AllowCloudFrontWeb"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web.json

  depends_on = [aws_s3_bucket_public_access_block.all["web"]]
}

data "aws_iam_policy_document" "docs" {
  statement {
    sid       = "AllowCloudFrontDocs"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.docs.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.portal.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "docs" {
  bucket = aws_s3_bucket.docs.id
  policy = data.aws_iam_policy_document.docs.json

  depends_on = [aws_s3_bucket_public_access_block.all["docs"]]
}
