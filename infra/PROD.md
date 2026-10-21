# Pilli en producción (AWS) — inventario y runbook

Región: `us-east-2` · Cuenta: `228828956264` · Todo creado por CLI (el `terraform/` cercano **no** está aplicado).

> **Arquitectura vigente (2026-10-20):** producción corre en la ruta serverless
> documentada en `infra/aws-ondemand/README.md` (CloudFront → API Gateway HTTP API
> → Lambda; `/pdfs/*` → S3 con OAC; worker ECS Fargate Spot solo por `RunTask`).
> El ALB + servicio Fargate 24/7 queda **solo como rollback** y debe apagarse.
> Este archivo conserva el inventario histórico para no perder el contexto.

## URLs públicas (sin dominio)

| Servicio | URL | Qué probar |
|---|---|---|
| API nueva (Lambda) | https://6rxq1647il.execute-api.us-east-2.amazonaws.com | `/health` → ok · `/api/v1/stats` |
| API legacy/rollback | http://acdan-sat-alb-4050027.us-east-2.elb.amazonaws.com | solo si se revierte CloudFront |
| Web despacho | https://d29jgqj00wmf1m.cloudfront.net | 200 (HTTPS; la liga http://…s3-website… no abre en celulares, Chrome fuerza HTTPS) |
| Web despacho (origen) | http://acdan-consultores-web-228828956264.s3-website.us-east-2.amazonaws.com | solo http, referencia |
| Pilli | https://d14l3lpcfl64u9.cloudfront.net | login `admin@acdan.mx` (contraseña actual; `acdan/admin-initial` puede estar desactualizado) |

## Recursos

| Recurso | Identificador |
|---|---|
| Lambda API | `acdan-sat-api-prod` (imagen `acdan-sat-api:20261020f`, 1536 MB, timeout 29 s) |
| API Gateway | `6rxq1647il` (HTTP API, `$default`, `ANY /{proxy+}`) |
| Scheduler | `acdan-sat-tick` (`rate(1 hour)`, EventBridge Scheduler) |
| Task definition on-demand | `acdan-sat-worker-ondemand:3` (Fargate Spot 2 vCPU/4 GB, `ROLE=worker`, sale a los 5 min sin trabajo) |
| Cluster ECS / servicio (rollback) | `acdan-sat` / `acdan-sat-svc` (Fargate 2vCPU/4GB, taskdef `acdan-sat-worker`) |
| Imagen worker (rollback) | `228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:latest` (ECR `acdan-sat-worker`) |
| ALB + target (rollback) | `acdan-sat-alb-4050027.us-east-2.elb.amazonaws.com` · TG `acdan-sat-tg` (`/health`) |
| Tablas DynamoDB | `ACDAN_CLIENTES`, `ACDAN_JOBS`, `ACDAN_DOCS`, `ACDAN_USERS` (on-demand) |
| Colas SQS | `acdan-sat-jobs` (+DLQ `acdan-sat-jobs-dlq`, 3 intentos) |
| Buckets | `acdan-consultores-web-228828956264` (web pública) · `acdan-pilli-228828956264` (privado, OAC `E1CIN0AKEOHNYN`) · `acdan-sat-docs-228828956264` (custodia, privado+versionado) |
| Secretos | `acdan/sat-backend` (JWT, LLM, región) · `acdan/aws-task-keys` (llaves IAM tarea) · `acdan/admin-initial` (password admin, **borrar tras primer login**) |
| Credenciales CIEC | SSM Parameter Store `SecureString` `/pilli/sat/{RFC}` (cifrado con `alias/aws/ssm`; no están en DynamoDB ni en `.koupper-secrets.json`) |
| IAM | roles `acdan-sat-execution`, `acdan-sat-task`; usuario `acdan-sat-task` (Koupper exige llaves estáticas, no toma el rol) |
| Logs | CloudWatch `/aws/lambda/acdan-sat-api-prod` y `/ecs/acdan-sat-worker`, retención 30 días |
| Presupuesto | `pilli-mensual` ($15 USD/mes; alertas 80%, 100% y pronóstico 100% a `jacob.gacosta@gmail.com`) |
| Alertas | SNS `pilli-alertas` + alarmas `pilli-dlq-mensajes`, `pilli-lambda-errores`, `pilli-api-5xx` (confirmar suscripción de correo) |
| CloudFront | `EKQ0I75DRG1L8` (Pilli: S3 + `/api/*` a API Gateway + `/pdfs/*` a S3 docs con OAC y función `acdan-sat-pdfs-rewrite`; SPA con `index.html`) · `E2434Y6AP0O18V` (web ACDAN, solo S3, redirect→HTTPS) |

## Estado verificado 2026-10-21

- Lambda API `20261020f`; task definition worker `:3` con imagen `ondemand-20261020c`.
- Credencial CIEC persistida en SSM `/pilli/sat/{RFC}`; `conCredencial=1`.
- Job `0c4cae35-38d0-4985-8907-ede2e1a02da7` terminó `listo`: `EcsScaler` arrancó el worker sin `RunTask` manual, descargó la constancia, subió el PDF a S3 y `/pdfs/...` respondió `200 application/pdf`.
- Worker sin trabajo salió solo a los 300 s con exit code 0.
- CFDI 2026-09 consultado con login exitoso y 0 comprobantes; 1 login, 4 lecturas de captcha, ~96 s. El worker salió con exit 0, pero no hubo archivos que descargar.
- Presupuesto `pilli-mensual`, retención de logs a 30 días y alarmas de DLQ/Lambda/API creadas. La suscripción de SNS a `jacob.gacosta@gmail.com` quedó pendiente de confirmar en el correo.

## Operación

```bash
# API Lambda: compilar → imagen → push → actualizar función
./gradlew buildLambda -x test
docker build -f Dockerfile -t 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-api:20261020f .
docker push 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-api:20261020f
aws lambda update-function-code --function-name acdan-sat-api-prod \
  --image-uri 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-api:20261020f --region us-east-2

# Worker on-demand: imagen → task definition → RunTask lo lanza la API/scheduler
docker build -f Dockerfile.worker -t 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:ondemand-20261020c .
docker push 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:ondemand-20261020c
aws ecs register-task-definition --cli-input-json file://../infra/aws-ondemand/taskdef-ondemand.json --region us-east-2

# Rollback: solo si falla la ruta nueva
# aws ecs update-service --cluster acdan-sat --service acdan-sat-svc --desired-count 1 --region us-east-2
# aws scheduler update-schedule --name acdan-sat-tick --state DISABLED --region us-east-2
# restaurar cloudfront-original.json con update-distribution

# Frontends: build → sync (Pilli exige invalidar CloudFront o se ve lo viejo).
# OJO: propuesta.html vive en el bucket fuera de dist/ -> excluirla del --delete.
# aws s3 sync frontend/dist s3://acdan-pilli-228828956264 --delete --exclude "propuesta.html" --region us-east-2
aws s3 sync dist s3://acdan-pilli-228828956264 --delete --region us-east-2
aws cloudfront create-invalidation --distribution-id EKQ0I75DRG1L8 --paths "/*" --region us-east-2

# Web ACDAN (desde acdan-consultores-web): build → sync → invalidar su CloudFront (HTTPS)
# aws s3 sync dist s3://acdan-consultores-web-228828956264 --delete --region us-east-2
# aws cloudfront create-invalidation --distribution-id E2434Y6AP0O18V --paths "/*" --region us-east-1

# Logs
aws logs tail /aws/lambda/acdan-sat-api-prod --since 15m --region us-east-2
aws logs tail /ecs/acdan-sat-worker --since 15m --region us-east-2
```

## Pendientes antes de prod real

1. Servicio viejo ya en `desired-count 0`; tras 24–48 h estable, borrar ALB/TG/servicio (el ALB es el único costo 24/7 que queda).
2. Constancia medida el 2026-10-20 (2 captchas, PDF en S3, worker auto-arrancado y salida 0). CFDI 2026-09 validado con 0 comprobantes; falta una corrida con CFDI real.
3. Dominio + HTTPS (CloudFront y API Gateway hoy usan URL de AWS).
4. PITR (respaldos) en las 4 tablas DynamoDB.
5. Confirmar la suscripción de correo a SNS `pilli-alertas`. AWS Budget `pilli-mensual`, retención de logs a 30 días y alarmas de DLQ/Lambda/API ya configurados.
6. Migrar clientes demo a prod (base casi vacía: solo admin).
7. Borrar secreto `acdan/admin-initial` tras cambiar la contraseña.
8. Rotar llaves `acdan-sat-task` periódicamente (o migrar a task role).
9. Decidir si se agrega authorizer/JWT al API de staff; hoy las rutas no exigen token, igual que el ALB.
10. Borrar bucket `acdan-sat-lambda-artifacts-228828956264` y las imágenes ECR viejas (`20261020`, `20261020b`, `20261020c`, `20261020d`, `20261020e`, `ondemand-20261020`, `ondemand-20261020b`).
