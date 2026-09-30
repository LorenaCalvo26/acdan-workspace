# ACDAN Consultores — SAT Bot 100% Automático + Dash

Plataforma para despacho contable: bot Koupper descarga en automático
Constancia de Situación Fiscal + Opinión 32-D por cada cliente (RFC + CIEC),
resuelve captcha con IA Vision, extrae PDF y lo muestra en dash React.

## Estructura

```
acdan-sat-platform/
  backend/   # Kotlin + Koupper (RuntimeRouter, jobs SQS/file, Playwright, Vision, PDFBox, Dynamo, S3)
  frontend/  # React + Vite + TS + Tailwind (dash contador minimalista)
```

## Backend — patrón igly-comms

Flujo:
```
Dash -> POST /api/v1/clientes/bulk | /clientes -> Dynamo ACDAN_CLIENTES + Secrets sat:{RFC}
Dash -> PUT /api/v1/clientes/{rfc}/frecuencia {dias, tipos:[constancia,32d]}
Scheduler (@Scheduled cada 1h) -> busca vencidos -> ::satBotJob.asJob(req).dispatchToQueue()
Worker satBotJob: Secrets.get -> Playwright login SAT -> Vision captcha solver (3 reintentos)
  -> navega ptsc32d + constancia -> descarga PDF -> S3 -> PDFBoxReader -> AI campos
  -> Dynamo ACDAN_DOCS + ACDAN_JOBS -> dash polling
```

Captcha 100% auto con `VisionProvider.analyzeAsText(imageBytes, prompt)`:
prompt = "Devuelve SOLO el texto del captcha, mayúsculas y números, sin espacios ni explicación."
Ver `backend/src/main/kotlin/com/acdan/sat/scripts/CaptchaSolver.kt`.

Env: copiar `backend/.env.example` a `backend/.env`.
Run: `cd backend && ./gradlew run` -> `http://localhost:8090/api/v1`

## Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:5174
```

Páginas: Dashboard (vencimientos 32-D 30d), Clientes (tabla CIECs + upload Excel + alta manual),
ClienteDetalle (frecuencia + historial + preview PDF + datos), Config (APIs, reintentos, horarios).

Excel template: `frontend/public/excel-template.csv` con columnas
RFC,Nombre,Email,CIEC,TipoDocs,FrecuenciaDias
