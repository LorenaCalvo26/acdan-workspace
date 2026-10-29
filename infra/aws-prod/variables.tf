variable "aws_region" {
  type        = string
  default     = "us-east-2"
  description = "Región AWS de la cuenta nueva."
}

variable "aws_profile" {
  type        = string
  default     = ""
  description = "Perfil de AWS CLI. Vacío = cadena de credenciales por defecto."
}

variable "project_name" {
  type        = string
  default     = "acdan-sat"
  description = "Prefijo de recursos. No cambiar sin revisar jobs.sqs.json."
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Etiqueta de entorno."
}

variable "alert_email" {
  type        = string
  default     = ""
  description = "Correo para SNS y presupuesto. Vacío = no se crea suscripción."
}

variable "contact_admin_email" {
  type        = string
  default     = "contador@acdanconsultores.mx"
  description = "Buzón de respaldo para avisos internos."
}

variable "email_from_name" {
  type    = string
  default = "ACDAN Consultores"
}

# -----------------------------------------------------------------------------
# Correo transaccional
# -----------------------------------------------------------------------------
variable "mail_driver" {
  type    = string
  default = "smtp"
}

variable "mail_host" {
  type    = string
  default = "smtp.gmail.com"
}

variable "mail_port" {
  type    = string
  default = "587"
}

variable "mail_username" {
  type    = string
  default = ""
}

variable "mail_password" {
  type      = string
  default   = ""
  sensitive = true
}

variable "mail_encryption" {
  type    = string
  default = "tls"
}

variable "notificar_emails" {
  type    = string
  default = "true"
}

# -----------------------------------------------------------------------------
# IA para captcha
# -----------------------------------------------------------------------------
variable "llm_api_url" {
  type    = string
  default = "https://api.openai.com"
}

variable "llm_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "llm_model" {
  type    = string
  default = "gpt-4o-mini"
}

# -----------------------------------------------------------------------------
# URLs públicas. El script deploy.ps1 las rellena después del primer apply.
# -----------------------------------------------------------------------------
variable "portal_base_url" {
  type        = string
  default     = ""
  description = "URL pública del portal (sin slash final)."
}

variable "app_base_url" {
  type        = string
  default     = ""
  description = "URL del dashboard interno (sin slash final)."
}

variable "web_base_url" {
  type        = string
  default     = ""
  description = "URL pública del sitio web ACDAN (sin slash final), para CORS."
}

variable "brand_logo_url" {
  type        = string
  default     = ""
  description = "URL pública del logo Pilli para correos."
}

variable "acdan_logo_url" {
  type        = string
  default     = ""
  description = "URL pública del logo ACDAN para correos."
}

# -----------------------------------------------------------------------------
# Dominio propio (opcional)
# -----------------------------------------------------------------------------
variable "portal_domain" {
  type        = string
  default     = ""
  description = "Ej. app.acdan.mx. Vacío = usar dominio de CloudFront."
}

variable "web_domain" {
  type        = string
  default     = ""
  description = "Ej. acdan.mx. Vacío = usar dominio de CloudFront."
}

variable "acm_certificate_arn" {
  type        = string
  default     = ""
  description = "Certificado ACM en us-east-1 para los dominios personalizados."
}

# -----------------------------------------------------------------------------
# Imágenes
# -----------------------------------------------------------------------------
variable "api_image_uri" {
  type        = string
  default     = ""
  description = "URI de la imagen real de la API. deploy.ps1 la construye y la pasa."
}

variable "worker_image_uri" {
  type        = string
  default     = ""
  description = "URI de la imagen real del worker. deploy.ps1 la construye y la pasa."
}

variable "worker_cpu" {
  type    = number
  default = 2048
}

variable "worker_memory" {
  type    = number
  default = 4096
}

# -----------------------------------------------------------------------------
# Nombres de datos y colas
# -----------------------------------------------------------------------------
variable "table_clientes" {
  type    = string
  default = "ACDAN_CLIENTES"
}

variable "table_jobs" {
  type    = string
  default = "ACDAN_JOBS"
}

variable "table_docs" {
  type    = string
  default = "ACDAN_DOCS"
}

variable "table_users" {
  type    = string
  default = "ACDAN_USERS"
}

variable "jobs_queue_name" {
  type        = string
  default     = "acdan-sat-jobs"
  description = "Debe coincidir con la cola lógica de backend/jobs.sqs.json."
}

variable "docs_prefix" {
  type        = string
  default     = "prod"
  description = "Prefijo S3. DocStore agrega storage/ y cfdi-storage/ debajo."
}

# -----------------------------------------------------------------------------
# Operación
# -----------------------------------------------------------------------------
variable "scheduler_enabled" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "budget_limit_usd" {
  type    = string
  default = "15"
}

variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_200"
}

variable "enable_pitr" {
  type    = bool
  default = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
