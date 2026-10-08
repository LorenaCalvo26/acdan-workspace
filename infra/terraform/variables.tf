variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "Región de AWS para desplegar la demo"
}

variable "aws_profile" {
  type        = string
  default     = "igly_arch"
  description = "Perfil de credenciales AWS CLI local"
}

variable "project_name" {
  type        = string
  default     = "acdan-sat-demo"
  description = "Nombre identificador del proyecto demo"
}

variable "environment" {
  type        = string
  default     = "demo"
  description = "Entorno de ejecución (demo, dev, prod)"
}

variable "scheduler_enabled" {
  type        = bool
  default     = true
  description = "Crea la regla de EventBridge Scheduler para el tick horario"
}

variable "scheduler_lambda_arn" {
  type        = string
  default     = ""
  description = "ARN de la Lambda del API a invocar cada hora. Vacío = no crea el schedule"
}
