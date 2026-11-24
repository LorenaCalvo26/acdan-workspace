# Despliegue del portal de Pilli a S3 + invalidacion de CloudFront.
#
# IMPORTANTE: el bucket guarda dos cosas distintas:
#   1. El sitio (este build)
#   2. branding/  -> logos de despachos y fotos de perfil que suben los usuarios
#
# Por eso el sync NUNCA debe borrar branding/: sin el --exclude, cada despliegue
# se lleva por delante los logos y avatares subidos desde el portal.

param(
    [string]$Perfil = "acdan-prod",
    [string]$Region = "us-east-2",
    [string]$Bucket = "acdan-sat-pilli-00eefd36",
    [string]$Distribucion = "E37W54D3XCONNF"
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $raiz "frontend")

Write-Host "Compilando el portal..."
$env:VITE_API_URL = "/api/v1"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Fallo el build del portal" }
Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue

Write-Host "Subiendo a S3 (sin tocar branding/)..."
aws s3 sync dist "s3://$Bucket" --delete --exclude "branding/*" --profile $Perfil --region $Region --only-show-errors
if ($LASTEXITCODE -ne 0) { throw "Fallo el sync a S3" }

# El index.html no debe cachearse: si el navegador lo guarda, sigue apuntando
# al bundle viejo y la app parece no actualizarse.
Write-Host "Marcando index.html sin cache..."
aws s3 cp (Join-Path (Get-Location) "dist\index.html") "s3://$Bucket/index.html" --cache-control "no-cache, no-store, must-revalidate" --content-type "text/html; charset=utf-8" --profile $Perfil --region $Region --only-show-errors

Write-Host "Invalidando CloudFront..."
$inv = aws cloudfront create-invalidation --distribution-id $Distribucion --paths "/*" --profile $Perfil --query "Invalidation.Id" --output text
aws cloudfront wait invalidation-completed --distribution-id $Distribucion --id $inv --profile $Perfil

Write-Host "Listo: portal publicado ($inv)"
