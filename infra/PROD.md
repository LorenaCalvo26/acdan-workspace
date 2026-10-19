# Pilli en producción (AWS) — inventario y runbook

Región: `us-east-2` · Cuenta: `228828956264` · Todo creado por CLI (el `terraform/` cercano **no** está aplicado).

## URLs públicas (sin dominio)

| Servicio | URL | Qué probar |
|---|---|---|
| API + worker | http://acdan-sat-alb-4050027.us-east-2.elb.amazonaws.com | `/health` → ok · `/api/v1/stats` |
| Web despacho | https://d29jgqj00wmf1m.cloudfront.net | 200 (HTTPS; la liga http://…s3-website… no abre en celulares, Chrome fuerza HTTPS) |
| Web despacho (origen) | http://acdan-consultores-web-228828956264.s3-website.us-east-2.amazonaws.com | solo http, referencia |
| Pilli | https://d14l3lpcfl64u9.cloudfront.net | login `admin@acdan.mx` (contraseña en secreto `acdan/admin-initial`) |

## Recursos

| Recurso | Identificador |
|---|---|
| Cluster ECS / servicio | `acdan-sat` / `acdan-sat-svc` (Fargate 2vCPU/4GB, taskdef `acdan-sat-worker`) |
| Imagen worker | `228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:latest` (ECR `acdan-sat-worker`) |
| ALB + target | `acdan-sat-alb-4050027.us-east-2.elb.amazonaws.com` · TG `acdan-sat-tg` (`/health`) |
| Tablas DynamoDB | `ACDAN_CLIENTES`, `ACDAN_JOBS`, `ACDAN_DOCS`, `ACDAN_USERS` (on-demand) |
| Colas SQS | `acdan-sat-jobs` (+DLQ `acdan-sat-jobs-dlq`, 3 intentos) |
| Buckets | `acdan-consultores-web-228828956264` (web pública) · `acdan-pilli-228828956264` (privado, OAC `E1CIN0AKEOHNYN`) · `acdan-sat-docs-228828956264` (custodia, privado+versionado) |
| Secretos | `acdan/sat-backend` (JWT, LLM, región) · `acdan/aws-task-keys` (llaves IAM tarea) · `acdan/admin-initial` (password admin, **borrar tras primer login**) |
| IAM | roles `acdan-sat-execution`, `acdan-sat-task`; usuario `acdan-sat-task` (Koupper exige llaves estáticas, no toma el rol) |
| Logs | CloudWatch `/ecs/acdan-sat-worker` |
| CloudFront | `EKQ0I75DRG1L8` (Pilli: S3 + `/api/*` y `/pdfs/*` al ALB, SPA con `index.html`) · `E2434Y6AP0O18V` (web ACDAN, solo S3, redirect→HTTPS) |

## Operación

```bash
# Backend: compilar → imagen → push → deploy (us-east-2)
./gradlew buildLambda -x test
docker build -f Dockerfile.worker -t 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:latest .
docker push 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:latest
aws ecs update-service --cluster acdan-sat --service acdan-sat-svc --force-new-deployment --region us-east-2

# Frontends: build → sync (Pilli exige invalidar CloudFront o se ve lo viejo).
# OJO: propuesta.html vive en el bucket fuera de dist/ -> excluirla del --delete.
# aws s3 sync frontend/dist s3://acdan-pilli-228828956264 --delete --exclude "propuesta.html" --region us-east-2
aws s3 sync dist s3://acdan-pilli-228828956264 --delete --region us-east-2
aws cloudfront create-invalidation --distribution-id EKQ0I75DRG1L8 --paths "/*" --region us-east-2

# Web ACDAN (desde acdan-consultores-web): build → sync → invalidar su CloudFront (HTTPS)
# aws s3 sync dist s3://acdan-consultores-web-228828956264 --delete --region us-east-2
# aws cloudfront create-invalidation --distribution-id E2434Y6AP0O18V --paths "/*" --region us-east-1

# Logs y escala
aws logs tail /ecs/acdan-sat-worker --region us-east-2 --since 15m
aws ecs update-service --cluster acdan-sat --service acdan-sat-svc --desired-count N --region us-east-2
```

## Pendientes antes de prod real

1. Dominio + HTTPS (CloudFront y ALB hoy son HTTP/URL de AWS).
2. PITR (respaldos) en las 4 tablas DynamoDB.
3. Alarmas (caídas, DLQ con mensajes, errores).
4. Migrar clientes demo a prod (base casi vacía: solo admin).
5. Borrar secreto `acdan/admin-initial` tras cambiar la contraseña.
6. Rotar llaves `acdan-sat-task` periódicamente.
