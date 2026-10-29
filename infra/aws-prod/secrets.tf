resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "sat_backend" {
  name                    = "${var.project_name}/sat-backend"
  description             = "JWT, correo, IA y URLs de Pilli"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "sat_backend" {
  secret_id     = aws_secretsmanager_secret.sat_backend.id
  secret_string = jsonencode(local.backend_secret)
}

resource "aws_secretsmanager_secret" "task_keys" {
  name                    = "${var.project_name}/aws-task-keys"
  description             = "Llaves del usuario IAM acdan-sat-task para Koupper"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "task_keys" {
  secret_id = aws_secretsmanager_secret.task_keys.id
  secret_string = jsonencode({
    AWS_ACCESS_KEY_ID     = aws_iam_access_key.worker.id
    AWS_SECRET_ACCESS_KEY = aws_iam_access_key.worker.secret
  })
}
