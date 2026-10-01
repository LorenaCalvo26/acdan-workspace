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
