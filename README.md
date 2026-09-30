<p align="center">
  <img src="frontend/public/pilli-logo.svg" alt="Pilli" width="96" />
  &nbsp;&nbsp;&nbsp;
  <img src="acdan-consultores-web/public/logo.jpeg" alt="ACDAN Consultores" width="96" />
</p>

<h1 align="center">ACDAN Workspace</h1>

<p align="center">
  Plataforma de monitoreo fiscal automático y sitio institucional de <strong>ACDAN Consultores</strong>.<br />
  Descarga, custodia y vigila la vigencia de los documentos fiscales de cada cliente — sin intervención manual.
</p>

## Proyectos

| Proyecto | Descripción | Stack |
|---|---|---|
| `frontend/` + `backend/` · **Portal de clientes (Pilli)** | Landing pública, autenticación con roles, dashboard de vigencias, alta masiva de clientes, visor de documentos y ejecución bajo demanda. | React + Vite + TS + Tailwind · Kotlin + Koupper Octopus |
| `acdan-consultores-web/` | Sitio institucional: servicios, proceso, testimonios, contacto y vitrina del portal de clientes. | React + Vite + TS + Tailwind + Framer Motion |

## Arquitectura

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────┐
│ Portal web   │─────▶│ API (Kotlin)     │─────▶│ DynamoDB    │
│ React + JWT  │◀─────│ Controllers →    │      │ jobs · docs │
└──────────────┘      │ scripts @Export  │      │ users       │
                      └────────┬─────────┘      └─────────────┘
                               │ cola de trabajos
                               ▼
                      ┌──────────────────┐      ┌─────────────┐
                      │ Worker de        │─────▶│ PDF → S3 /  │
                      │ automatización   │      │ disco local │
                      │ (navegador + IA) │      └─────────────┘
                      └──────────────────┘
```

- **Controllers delgados, scripts aislados.** Cada capacidad (`loginUser`, `createUser`, resolución de retos visuales, extracción de PDF) es un script `@Export` con solo DI de Koupper + JDK: corre con `koupper run` o integrado al backend web sin cambios.
- **Autenticación propia.** JWT HS256 con roles `ADMIN` / `OPERADOR`; el alta de usuarios vive en el servidor y es exclusiva del administrador.
- **Trabajos asíncronos.** El API encola y responde `queued`; el worker ejecuta, persiste documentos y el dashboard sigue el avance por polling.
- **Custodia documental.** PDFs validados por firma binaria, metadatos extraídos y servidos para vista previa en el navegador.

## Funcionalidad

- Monitoreo de vigencia documental por cliente, con alertas previas al vencimiento.
- Descarga y custodia automática de documentos fiscales (Opinión de cumplimiento y Constancia).
- Dashboard con estados, documentos y datos extraídos por documento.
- Alta individual y masiva de clientes (Excel), frecuencia de revisión configurable.
- Portal de clientes con login, roles y sesión persistente.
- Sitio institucional con captación de leads (acceso y demos) hacia el equipo.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend portal | React 18, Vite, TypeScript, Tailwind, React Router |
| Backend | Kotlin, Koupper Octopus (router, DI, DynamoDB, Secrets, JWT) |
| Automatización | Navegador headless, visión por IA con votación por consenso |
| Datos | DynamoDB (local o AWS), PDFs en S3 o disco local |
| Sitio web | React, Tailwind v4, Framer Motion, Lucide |

## Puesta en marcha

```bash
# Backend (http://localhost:8090)
cd backend
cp .env.example .env   # nunca commitear el .env real
./gradlew run          # requiere DynamoDB Local en :8000

# Portal (http://localhost:5174)
cd frontend
npm install
npm run dev

# Sitio web
cd acdan-consultores-web
npm install
npm run dev
```

Crear el administrador inicial (una sola vez, se rehúsa si ya hay usuarios):

```bash
cd backend
koupper run scripts/seed-admin.kts '{"email":"admin@acdan.mx","password":"...","nombre":"Admin"}'
```

## Ruta a producción

API en Lambda + API Gateway, cola SQS para los trabajos, worker de automatización en contenedor con escalado a cero y PDFs en S3. El código ya está separado en esa dirección: el API solo encola y el worker es independiente del servidor web.

## Seguridad

- Las credenciales de clientes se guardan cifradas fuera de la base de datos.
- `.env`, secretos, PDFs descargados y bases locales están ignorados por git.
