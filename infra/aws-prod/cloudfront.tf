resource "aws_cloudfront_function" "spa" {
  name    = "${var.project_name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Reescribe rutas de React al index.html"
  publish = true
  code    = file("${path.module}/cloudfront/spa-rewrite.js")
}

resource "aws_cloudfront_function" "pdfs" {
  name    = "${var.project_name}-pdfs-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Reescribe /pdfs/* a prod/storage/* en S3"
  publish = true
  code    = replace(file("${path.module}/cloudfront/pdfs-rewrite.js"), "__DOCS_PREFIX__", var.docs_prefix)
}

resource "aws_cloudfront_cache_policy" "optimized" {
  name        = "${var.project_name}-optimized"
  comment     = "Assets y PDFs con cache largo"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

resource "aws_cloudfront_cache_policy" "disabled" {
  name        = "${var.project_name}-disabled"
  comment     = "Sin cache para API"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_gzip   = false
    enable_accept_encoding_brotli = false
  }
}

# Política administrada AllViewerExceptHostHeader. No se reenvía Host a
# API Gateway, que rechaza el Host del dominio CloudFront con 403.
locals {
  all_viewer_except_host_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.project_name}-s3-oac"
  description                       = "OAC para buckets privados de Pilli"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "portal" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "Pilli portal y API"
  price_class         = var.cloudfront_price_class
  http_version        = "http2"
  aliases             = local.portal_has_custom ? [var.portal_domain] : []

  origin {
    domain_name              = aws_s3_bucket.portal.bucket_regional_domain_name
    origin_id                = "portal"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    domain_name = "${aws_apigatewayv2_api.http.id}.execute-api.${local.region}.amazonaws.com"
    origin_id   = "api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name              = aws_s3_bucket.docs.bucket_regional_domain_name
    origin_id                = "docs"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  default_cache_behavior {
    target_origin_id       = "portal"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = false

    cache_policy_id          = aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = local.all_viewer_except_host_policy_id
  }

  ordered_cache_behavior {
    path_pattern           = "/pdfs/*"
    target_origin_id       = "docs"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.pdfs.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.portal_has_custom ? false : true
    acm_certificate_arn            = local.portal_has_custom ? var.acm_certificate_arn : null
    ssl_support_method             = local.portal_has_custom ? "sni-only" : null
    minimum_protocol_version       = local.portal_has_custom ? "TLSv1.2_2021" : null
  }
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "Sitio ACDAN"
  price_class         = var.cloudfront_price_class
  http_version        = "http2"
  aliases             = local.web_has_custom ? [var.web_domain] : []

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  default_cache_behavior {
    target_origin_id       = "web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = aws_cloudfront_cache_policy.optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.web_has_custom ? false : true
    acm_certificate_arn            = local.web_has_custom ? var.acm_certificate_arn : null
    ssl_support_method             = local.web_has_custom ? "sni-only" : null
    minimum_protocol_version       = local.web_has_custom ? "TLSv1.2_2021" : null
  }
}
