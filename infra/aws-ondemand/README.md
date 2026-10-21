# Pilli on-demand (hasta 500 RFCs) — recursos y runbook

Región `us-east-2`, cuenta `228828956264`. Este documento describe la ruta
serverless que reemplaza el ALB + Fargate 24/7.

## Arquitectura

```
Navegador
  └─ CloudFront (d14l3lpcfl64u9.cloudfront.net)
       ├─ /*      → S3 acdan-pilli-228828956264 (frontend)
       ├─ /api/*  → API Gateway HTTP API → Lambda acdan-sat-api-prod
       └─ /pdfs/* → CloudFront Function → S3 acdan-sat-docs-228828956264/prod/storage (OAC)

Lambda API ── DynamoDB / S3 / SSM Parameter Store / SQS
           └─ ECS RunTask (Fargate Spot) cuando se encola un job

EventBridge Scheduler (1 h) → Lambda API (tick del programador)
Worker ECS ── SQS acdan-sat-jobs → SAT → S3/DynamoDB → sale solo
```

No hay ALB, NAT ni worker encendido 24/7 en la ruta nueva.

## Recursos

| Recurso | Identificador |
|---|---|
| Lambda API | `acdan-sat-api-prod` (imagen `acdan-sat-api:20261020f`) |
| API Gateway HTTP API | `6rxq1647il` · `https://6rxq1647il.execute-api.us-east-2.amazonaws.com` |
| Rol Lambda | `arn:aws:iam::228828956264:role/acdan-sat-api-lambda` |
| Rol Scheduler | `arn:aws:iam::228828956264:role/acdan-sat-scheduler` |
| Schedule | `acdan-sat-tick` (`rate(1 hour)`, **ENABLED**) |
| Task definition worker | `acdan-sat-worker-ondemand:3` (Fargate Spot, 2 vCPU/4 GB) |
| Imagen worker | `228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:ondemand-20261020c` |
| Cluster / servicio viejo | `acdan-sat` / `acdan-sat-svc` (rollback) |
| Cola | `https://sqs.us-east-2.amazonaws.com/228828956264/acdan-sat-jobs` |
| Bucket docs | `acdan-sat-docs-228828956264` (prefijo `prod/storage/`) |
| Credenciales CIEC | SSM Parameter Store `SecureString` en `/pilli/sat/{RFC}` |
| OAC docs | `E1U7674LPQ6093` |
| CloudFront Function | `acdan-sat-pdfs-rewrite` (reescribe `/pdfs/*` → `/prod/storage/*`) |
| CloudFront | `EKQ0I75DRG1L8` |
| Backup CloudFront | `cloudfront-original.json` (ETag `E23ZP02F085DFQ`) |
| Presupuesto | `pilli-mensual` ($15 USD/mes; alertas 80/100% y pronóstico 100%) |
| Retención logs | 30 días en `/aws/lambda/acdan-sat-api-prod` y `/ecs/acdan-sat-worker` |
| Alertas | SNS `pilli-alertas` + alarmas DLQ, errores Lambda y 5xx API Gateway (confirmar correo) |

## Build y despliegue

```powershell
cd backend
.\gradlew.bat buildLambda -x test

# Imagen Lambda (API)
docker build -f Dockerfile -t 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-api:20261020f .
docker push 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-api:20261020f
aws lambda update-function-code --function-name acdan-sat-api-prod `
  --image-uri 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-api:20261020f `
  --region us-east-2

# Imagen worker (solo si cambia el código del bot)
docker build -f Dockerfile.worker -t 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:ondemand-20261020c .
docker push 228828956264.dkr.ecr.us-east-2.amazonaws.com/acdan-sat-worker:ondemand-20261020c
aws ecs register-task-definition --cli-input-json file://../infra/aws-ondemand/taskdef-ondemand.json --region us-east-2

# Presupuesto y retención de logs
aws budgets create-budget --account-id 228828956264 `
  --budget file://../infra/aws-ondemand/budget.json `
  --notifications-with-subscribers file://../infra/aws-ondemand/budget-notifications.json
aws logs put-retention-policy --log-group-name /aws/lambda/acdan-sat-api-prod --retention-in-days 30 --region us-east-2
aws logs put-retention-policy --log-group-name /ecs/acdan-sat-worker --retention-in-days 30 --region us-east-2
```

El Lambda usa el rol y variables de entorno; no lleva llaves AWS estáticas.
El worker conserva las llaves del usuario `acdan-sat-task` porque Koupper no
toma el task role (pendiente de migrar a credenciales del rol).

### Credenciales CIEC

Las contraseñas del SAT se guardan en SSM Parameter Store como `SecureString`
bajo `/pilli/sat/{RFC}`. No se guardan en DynamoDB, en la imagen ni en
`.koupper-secrets.json`. Ese archivo local solo sirve como respaldo de
desarrollo y no se copia a los contenedores.

El usuario `acdan-sat-task` necesita `ssm:GetParameter` y `s3:PutObject` en
`prod/*`, además de `sqs:ReceiveMessage`, `sqs:DeleteMessage` y
`sqs:ChangeMessageVisibility`. La política vigente está en
`infra/aws-ondemand/worker-policy.json`.

## Pruebas

```powershell
$base = "https://6rxq1647il.execute-api.us-east-2.amazonaws.com"
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/v1/stats"
Invoke-RestMethod "$base/api/v1/clientes"
Invoke-RestMethod "$base/api/v1/docs/por-rfc" -Method Post `
  -ContentType "application/json" -Body '{"rfc":"GUAJ880224I62"}'

# CFDI de un mes cerrado (0 comprobantes también es una respuesta válida).
Invoke-RestMethod "$base/api/v1/sat/solicitar" -Method Post `
  -ContentType "application/json" -Body '{"rfc":"GUAJ880224I62","tipos":["cfdi"],"periodo":"2026-09"}'
```

Prueba por CloudFront (ruta real del navegador):

```powershell
$cf = "https://d14l3lpcfl64u9.cloudfront.net"
Invoke-RestMethod "$cf/api/v1/stats"
(Invoke-WebRequest "$cf/pdfs/GUAJ880224I62/GUAJ880224I62-constancia-1792176804.pdf" -Method Head).Headers["Content-Type"]
# debe ser application/pdf, no text/html
```

La función `acdan-sat-pdfs-rewrite` convierte `/pdfs/{RFC}/{archivo}` en
`/prod/storage/{RFC}/{archivo}` antes de ir al bucket.

Worker manual (se apaga solo a los 5 min sin trabajo):

```powershell
aws ecs run-task --cluster acdan-sat --task-definition acdan-sat-worker-ondemand `
  --count 1 --capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1 `
  --network-configuration "awsvpcConfiguration={subnets=[subnet-38418945,subnet-d35ac8b8,subnet-15437059],securityGroups=[sg-0053f6bbee8f0a17b],assignPublicIp=ENABLED}" `
  --region us-east-2
```

El log debe mostrar `[poller] long-poll 20s, max=1, visibility=7200s, idleExit=300s`
y luego `[worker] sin trabajo pendiente; saliendo`.

## Costo objetivo (hasta 500 RFC, 3 usuarios)

| Servicio | Estimado |
|---|---|
| API Gateway HTTP API | ~$1–5 USD/año |
| Lambda API + scheduler + SQS | ~$1–5 USD/año |
| ECS Fargate Spot (solo jobs) | ~$20–60 USD/año |
| S3 docs + requests | ~$5–20 USD/año |
| DynamoDB on-demand | ~$5–20 USD/año |
| SSM SecureString (500 params estándar) | ~$0–5 USD/año |
| CloudFront | ~$10–30 USD/año |
| GPT-4o mini (captcha) | ~$50–120 USD/año |
| Secrets Manager | ~$10 USD/año |
| **Total** | **~$100–270 USD/año ≈ 1,850–5,000 MXN + IVA** |

El precio de venta del servicio AWS + IA se mantiene en **~2,500–3,500 MXN + IVA/año**
con colchón; se revisa contra la factura. No incluye dominio (~570 MXN/año) ni
5,000 RFC (cotización aparte).

## Rollback

1. CloudFront: extraer `DistributionConfig` de `cloudfront-original.json` y
   aplicarlo con el ETag vigente:
   ```powershell
   $orig = Get-Content cloudfront-original.json -Raw | ConvertFrom-Json
   $orig.DistributionConfig | ConvertTo-Json -Depth 30 | Set-Content -Encoding utf8 cloudfront-rollback.json
   aws cloudfront update-distribution --id EKQ0I75DRG1L8 --if-match <ETagActual> --distribution-config file://cloudfront-rollback.json
   ```
2. ECS: subir `acdan-sat-svc` a `desired-count 1`; el ALB sigue existiendo.
3. Scheduler: deshabilitar `acdan-sat-tick` (`aws scheduler update-schedule --name acdan-sat-tick --state DISABLED`).

## Seguridad

Las rutas de staff (`/api/v1/stats`, `/clientes`, `/docs`, etc.) no exigen JWT
en el backend; es el mismo comportamiento que tenía el ALB. El portal valida su
propio token. Si se quiere cerrar el API, hay que agregar un authorizer/JWT y
cambiar el frontend; no se hizo para no alterar el flujo actual.

## Limpieza pendiente

Ahora (para que el costo sea el bajo):

- `aws ecs update-service --cluster acdan-sat --service acdan-sat-svc --desired-count 0`
- Habilitar `acdan-sat-tick` (`aws scheduler update-schedule --name acdan-sat-tick --state ENABLED`).

Después de 24–48 h estable:

- Eliminar ALB `acdan-sat-alb`, target group `acdan-sat-tg` y el servicio viejo.
- Eliminar el bucket `acdan-sat-lambda-artifacts-228828956264` (artefacto zip que
  ya no se usa; la API corre como imagen de contenedor).
- Revisar retención de logs (`/aws/lambda/acdan-sat-api-prod`, `/ecs/acdan-sat-worker`).
- Crear AWS Budget mensual de ~$15 USD con alertas.
