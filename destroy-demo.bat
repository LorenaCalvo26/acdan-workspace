@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo ACDAN SAT PLATFORM - DESTRUCCIÓN Y LIMPIEZA COMPLETA DE DEMO
echo ==============================================================================
echo.
echo ADVERTENCIA: Se borrara TODO rastro de la demo en AWS (S3, DynamoDB, Lambda, SQS, API Gateway).
echo.
set /p CONFIRM="Deseas continuar? (S/N): "
if /i "%CONFIRM%" neq "S" (
    echo Operacion cancelada.
    exit /b 0
)

set AWS_PROFILE=igly_arch
set AWS_PAGER=

echo.
echo [1/2] Vaciando Buckets de S3 e imagenes ECR...
cd infra\terraform

echo Destruyendo infraestructura con Terraform...
terraform destroy -auto-approve
if %errorlevel% neq 0 (
    echo Error ejecutando terraform destroy.
    exit /b 1
)

cd ..\..

echo.
echo ==============================================================================
echo ¡LIMPIEZA COMPLETADA! Todos los recursos han sido eliminados de AWS sin dejar rastro.
echo ==============================================================================
