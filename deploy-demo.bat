@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo ACDAN SAT PLATFORM - DESPLIEGUE AUTOMÁTICO DE DEMO EN AWS
echo ==============================================================================

set AWS_PROFILE=igly_arch
set AWS_PAGER=

echo.
echo [1/5] Verificando credenciales de AWS...
aws sts get-caller-identity
if %errorlevel% neq 0 (
    echo Error: Credenciales AWS no validas o expiro la sesion.
    exit /b 1
)

echo.
echo [2/5] Provisionando Infraestructura con Terraform...
cd infra\terraform
terraform init
terraform apply -auto-approve
if %errorlevel% neq 0 (
    echo Error aplicando Terraform.
    exit /b 1
)

for /f "tokens=*" %%a in ('terraform output -raw web_url') do set WEB_URL=%%a
for /f "tokens=*" %%a in ('terraform output -raw portal_url') do set PORTAL_URL=%%a
for /f "tokens=*" %%a in ('terraform output -raw api_gateway_url') do set API_URL=%%a
for /f "tokens=*" %%a in ('terraform output -raw ecr_repository_url') do set ECR_URL=%%a
for /f "tokens=*" %%a in ('terraform output -raw s3_storage_bucket') do set S3_STORAGE=%%a
cd ..\..

echo.
echo [3/5] Compilando Backend y generando artefacto Lambda...
cd backend
call gradlew.bat buildLambda --no-daemon
if %errorlevel% neq 0 (
    echo Error compilando backend.
    exit /b 1
)
cd ..

echo.
echo [4/5] Compilando Frontend Sitio Web y subiendo a S3...
cd acdan-consultores-web
set VITE_API_URL=%API_URL%
call npm run build
for /f "tokens=*" %%b in ('cd ..\infra\terraform ^& terraform output -raw web_url') do set WEB_BUCKET=%%b
aws s3 sync dist/ s3://acdan-sat-demo-web-demo/ --delete
cd ..

echo.
echo [5/5] Compilando Frontend Portal Pilli y subiendo a S3...
cd frontend
set VITE_API_URL=%API_URL%
call npm run build
aws s3 sync dist/ s3://acdan-sat-demo-portal-demo/ --delete
cd ..

echo.
echo ==============================================================================
echo ¡DEMO DESPLEGADA EXITOSAMENTE!
echo ==============================================================================
echo.
echo Sitio Web Institucional : %WEB_URL%
echo Portal Clientes Pilli   : %PORTAL_URL%
echo Backend API Gateway     : %API_URL%
echo Storage PDFs Bucket     : %S3_STORAGE%
echo.
echo Para destruir la demo y borrar TODO rastro de AWS, ejecuta: destroy-demo.bat
echo ==============================================================================
