[CmdletBinding()]
param(
    [string]$Profile = "",
    [string]$Region = "",
    [switch]$SkipImages,
    [switch]$SkipFrontends,
    [switch]$OnlyFrontends
)

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$tfDir = $scriptDir
$repoRoot = (Resolve-Path (Join-Path $scriptDir "../..")).Path
$tfvarsPath = Join-Path $tfDir "terraform.tfvars"

function Get-TfVarValue {
    param([string]$Name)

    if (-not (Test-Path $tfvarsPath)) { return "" }

    $pattern = '^\s*' + [regex]::Escape($Name) + '\s*=\s*"([^"]*)"'
    $match = Select-String -Path $tfvarsPath -Pattern $pattern | Select-Object -First 1
    if ($null -eq $match) { return "" }
    return $match.Matches[0].Groups[1].Value
}

function Invoke-Tf {
    param([string[]]$Arguments)

    Push-Location $tfDir
    try {
        & terraform @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "terraform falló: $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Get-TfOutput {
    param([string]$Name)

    Push-Location $tfDir
    try {
        $value = & terraform output -raw $Name
        if ($LASTEXITCODE -ne 0) {
            throw "No se pudo leer terraform output '$Name'. ¿Ya aplicaste la infraestructura?"
        }
        return (($value | Out-String).Trim())
    }
    finally {
        Pop-Location
    }
}

if ($OnlyFrontends -and $SkipFrontends) {
    throw "No combines -OnlyFrontends con -SkipFrontends."
}

$requiredCommands = @("terraform", "aws", "npm")
if (-not $OnlyFrontends -and -not $SkipImages) {
    $requiredCommands += @("docker", "java")
}
foreach ($command in $requiredCommands) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Falta el comando '$command' en PATH."
    }
}

if (-not (Test-Path $tfvarsPath)) {
    throw "Falta $tfvarsPath. Copia terraform.tfvars.example y llena los valores."
}

if (-not $Profile) {
    $Profile = Get-TfVarValue "aws_profile"
}
if ($Profile) {
    $env:AWS_PROFILE = $Profile
}

if (-not $Region) {
    $Region = Get-TfVarValue "aws_region"
}
if (-not $Region) {
    $Region = "us-east-2"
}
$env:AWS_REGION = $Region

$projectName = Get-TfVarValue "project_name"
if (-not $projectName) {
    $projectName = "acdan-sat"
}

$tfVars = @("-var", "aws_region=$Region")
if ($Profile) {
    $tfVars += @("-var", "aws_profile=$Profile")
}

Write-Host "== Pilli: despliegue a cuenta nueva ==" -ForegroundColor Cyan
Write-Host "Terraform: $tfDir"
Write-Host "Región:    $Region"
if ($Profile) { Write-Host "Perfil:    $Profile" }

Invoke-Tf -Arguments @("init", "-input=false")

$imageVars = @()

if (-not $OnlyFrontends) {
    if (-not $SkipImages) {
        $accountId = & aws sts get-caller-identity --query Account --output text
        if ($LASTEXITCODE -ne 0) { throw "No se pudo obtener la cuenta AWS." }
        $accountId = (($accountId | Out-String).Trim())
        Write-Host "Cuenta: $accountId"

        # La Lambda no puede usar imágenes de ECR Public. Primero creamos los
        # repositorios privados, luego construimos/pusheamos y al final creamos
        # la Lambda con la imagen real.
        Write-Host "`n[1/5] Creando repositorios ECR..." -ForegroundColor Yellow
        Invoke-Tf -Arguments (@(
            "apply", "-auto-approve", "-input=false",
            "-target", "aws_ecr_repository.api",
            "-target", "aws_ecr_repository.worker"
        ) + $tfVars)

        $apiRepo = ""
        $workerRepo = ""
        try { $apiRepo = Get-TfOutput "ecr_api_repository_url" } catch { }
        try { $workerRepo = Get-TfOutput "ecr_worker_repository_url" } catch { }

        if ($apiRepo -notmatch '^\d{12}\.dkr\.ecr\.') {
            $apiRepo = "${accountId}.dkr.ecr.${Region}.amazonaws.com/${projectName}-api"
        }
        if ($workerRepo -notmatch '^\d{12}\.dkr\.ecr\.') {
            $workerRepo = "${accountId}.dkr.ecr.${Region}.amazonaws.com/${projectName}-worker"
        }

        Write-Host "`n[2/5] Compilando backend y publicando imágenes..." -ForegroundColor Yellow

        $tag = Get-Date -Format "yyyyMMddHHmmss"
        $apiImage = "${apiRepo}:$tag"
        $workerImage = "${workerRepo}:$tag"
        $registry = "${accountId}.dkr.ecr.${Region}.amazonaws.com"

        $ecrPassword = & aws ecr get-login-password --region $Region
        if ($LASTEXITCODE -ne 0) { throw "No se pudo obtener el password de ECR." }

        $ecrPassword | & docker login --username AWS --password-stdin $registry
        if ($LASTEXITCODE -ne 0) { throw "docker login contra ECR falló." }

        Push-Location (Join-Path $repoRoot "backend")
        try {
            & .\gradlew.bat buildLambda -x test --no-daemon
            if ($LASTEXITCODE -ne 0) { throw "Falló gradlew buildLambda." }

            & docker build --platform linux/amd64 -f Dockerfile -t $apiImage .
            if ($LASTEXITCODE -ne 0) { throw "Falló docker build de la API." }

            & docker build --platform linux/amd64 -f Dockerfile.worker -t $workerImage .
            if ($LASTEXITCODE -ne 0) { throw "Falló docker build del worker." }

            & docker push $apiImage
            if ($LASTEXITCODE -ne 0) { throw "Falló docker push de la API." }

            & docker push $workerImage
            if ($LASTEXITCODE -ne 0) { throw "Falló docker push del worker." }
        }
        finally {
            Pop-Location
        }

        $imageVars = @(
            "-var", "api_image_uri=$apiImage",
            "-var", "worker_image_uri=$workerImage"
        )
    }
    else {
        Write-Host "`n[1/5] -SkipImages: leyendo imágenes actuales..." -ForegroundColor Yellow

        $apiLambdaName = ""
        try { $apiLambdaName = Get-TfOutput "api_lambda_name" } catch { }
        if (-not $apiLambdaName) {
            throw "No hay Lambda existente. No uses -SkipImages en el primer despliegue."
        }

        $currentApiImage = & aws lambda get-function --function-name $apiLambdaName --query "Code.ImageUri" --output text --region $Region
        if ($LASTEXITCODE -ne 0 -or -not $currentApiImage) {
            throw "No se pudo leer la imagen actual de la Lambda."
        }
        $currentApiImage = (($currentApiImage | Out-String).Trim())

        $workerFamily = Get-TfOutput "worker_task_definition_family"
        $currentWorkerImage = & aws ecs describe-task-definition --task-definition $workerFamily --query "taskDefinition.containerDefinitions[0].image" --output text --region $Region
        if ($LASTEXITCODE -ne 0 -or -not $currentWorkerImage) {
            throw "No se pudo leer la imagen actual del worker."
        }
        $currentWorkerImage = (($currentWorkerImage | Out-String).Trim())

        $imageVars = @(
            "-var", "api_image_uri=$currentApiImage",
            "-var", "worker_image_uri=$currentWorkerImage"
        )
    }

    Write-Host "`n[3/5] Aplicando infraestructura completa..." -ForegroundColor Yellow
    Invoke-Tf -Arguments (@("apply", "-auto-approve", "-input=false") + $tfVars + $imageVars)
}

$region       = Get-TfOutput "region"
$portalUrl    = Get-TfOutput "portal_url"
$webUrl       = Get-TfOutput "web_url"
$apiUrl       = Get-TfOutput "api_url"
$portalBucket = Get-TfOutput "portal_bucket"
$webBucket    = Get-TfOutput "web_bucket"
$portalDist   = Get-TfOutput "cloudfront_portal_id"
$webDist      = Get-TfOutput "cloudfront_web_id"

$env:AWS_REGION = $region

if (-not $OnlyFrontends) {
    Write-Host "`n[4/5] Fijando URLs públicas de CloudFront..." -ForegroundColor Yellow

    $urlVars = @(
        "-var", "portal_base_url=$portalUrl",
        "-var", "app_base_url=$portalUrl",
        "-var", "web_base_url=$webUrl",
        "-var", "brand_logo_url=$portalUrl/pilli-logo.svg",
        "-var", "acdan_logo_url=$webUrl/logo.jpeg"
    )

    Invoke-Tf -Arguments (@("apply", "-auto-approve", "-input=false") + $tfVars + $imageVars + $urlVars)
}

if (-not $SkipFrontends) {
    Write-Host "`n[5/5] Compilando y publicando frontends..." -ForegroundColor Yellow

    Push-Location (Join-Path $repoRoot "frontend")
    try {
        # El .env local apunta a localhost:8090. En CloudFront la API es
        # mismo-origen, así que forzamos /api/v1 para este build.
        $env:VITE_API_URL = "/api/v1"
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci falló en frontend." }

        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build falló en frontend." }

        & aws s3 sync dist "s3://$portalBucket" --delete --region $region
        if ($LASTEXITCODE -ne 0) { throw "S3 sync del portal falló." }
    }
    finally {
        Pop-Location
        Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
    }

    Push-Location (Join-Path $repoRoot "acdan-consultores-web")
    try {
        $env:VITE_CONTACT_API_URL = "$portalUrl/api/v1/contact"
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci falló en la web ACDAN." }

        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build falló en la web ACDAN." }

        & aws s3 sync dist "s3://$webBucket" --delete --region $region
        if ($LASTEXITCODE -ne 0) { throw "S3 sync de la web falló." }
    }
    finally {
        Pop-Location
        Remove-Item Env:VITE_CONTACT_API_URL -ErrorAction SilentlyContinue
    }

    & aws cloudfront create-invalidation --distribution-id $portalDist --paths "/*" --region $region | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Invalidación de CloudFront del portal falló." }

    & aws cloudfront create-invalidation --distribution-id $webDist --paths "/*" --region $region | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Invalidación de CloudFront de la web falló." }
}

Write-Host "`nDespliegue terminado." -ForegroundColor Green
Write-Host "Portal: $portalUrl"
Write-Host "Web:    $webUrl"
Write-Host "API:    $apiUrl"
Write-Host ""
$seedScript = Join-Path $scriptDir "seed-admin.ps1"
$seedProfile = if ($Profile) { " -Profile `"$Profile`"" } else { "" }
Write-Host "Siguiente: `"$seedScript`"$seedProfile -Email admin@acdan.mx"
