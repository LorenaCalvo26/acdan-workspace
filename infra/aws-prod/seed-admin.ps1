[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Email,

    [string]$Password = "",
    [string]$Name = "Admin",
    [string]$Profile = "",
    [string]$Region = "",
    [string]$Table = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$tfDir = $scriptDir
$tfvarsPath = Join-Path $tfDir "terraform.tfvars"

function Get-TfVarValue {
    param([string]$VarName)

    if (-not (Test-Path $tfvarsPath)) { return "" }

    $pattern = '^\s*' + [regex]::Escape($VarName) + '\s*=\s*"([^"]*)"'
    $match = Select-String -Path $tfvarsPath -Pattern $pattern | Select-Object -First 1
    if ($null -eq $match) { return "" }
    return $match.Matches[0].Groups[1].Value
}

function Get-TfOutput {
    param([string]$OutputName)

    Push-Location $tfDir
    try {
        $value = & terraform output -raw $OutputName
        if ($LASTEXITCODE -ne 0) { throw "No se pudo leer terraform output '$OutputName'." }
        return (($value | Out-String).Trim())
    }
    finally {
        Pop-Location
    }
}

foreach ($command in @("aws", "terraform")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Falta el comando '$command' en PATH."
    }
}

$Email = $Email.Trim().ToLowerInvariant()
if ($Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    throw "EMAIL_INVALIDO"
}

if (-not $Password) {
    $secure = Read-Host "Contraseña para $Email" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

if ($Password.Length -lt 8) {
    throw "PASSWORD_MIN_8"
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
    try { $Region = Get-TfOutput "region" } catch { $Region = "us-east-2" }
}
$env:AWS_REGION = $Region

if (-not $Table) {
    try {
        Push-Location $tfDir
        try {
            $raw = & terraform output -json tables
            if ($LASTEXITCODE -ne 0) { throw "No se pudo leer la tabla de usuarios." }
            $Table = (($raw | Out-String) | ConvertFrom-Json).users
        }
        finally {
            Pop-Location
        }
    }
    catch {
        $Table = "ACDAN_USERS"
    }
}

if (-not $Table) {
    $Table = "ACDAN_USERS"
}

Write-Host "Tabla:  $Table"
Write-Host "Región: $Region"
if ($Profile) { Write-Host "Perfil: $Profile" }

$countText = & aws dynamodb scan --table-name $Table --select COUNT --query Count --output text --region $Region
if ($LASTEXITCODE -ne 0) { throw "No se pudo leer $Table." }
$countText = (($countText | Out-String).Trim())

if ([int]$countText -gt 0) {
    throw "Ya existe al menos un usuario en $Table. No se crea otro admin."
}

$salt = [guid]::NewGuid().ToString()
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Password + $salt)
    $hashBytes = $sha.ComputeHash($bytes)
    $hash = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
}
finally {
    $sha.Dispose()
}

$nombre = if ($Name.Trim()) { $Name.Trim() } else { "Admin" }
$now = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$item = @{
    pk           = @{ S = $Email }
    userId       = @{ S = [guid]::NewGuid().ToString() }
    email        = @{ S = $Email }
    nombre       = @{ S = $nombre }
    passwordHash = @{ S = "${hash}:$salt" }
    rol          = @{ S = "ADMIN" }
    status       = @{ S = "active" }
    createdAt    = @{ S = $now }
    updatedAt    = @{ S = $now }
}

# AWS CLI en Windows pierde las comillas si el JSON se pasa como argumento.
# Se envía por archivo para conservar el formato exacto.
$payload = @{
    TableName           = $Table
    Item                = $item
    ConditionExpression = "attribute_not_exists(pk)"
} | ConvertTo-Json -Depth 10 -Compress

$tempFile = Join-Path ([IO.Path]::GetTempPath()) ("pilli-admin-" + [guid]::NewGuid().ToString("N") + ".json")
try {
    [IO.File]::WriteAllText($tempFile, $payload, [Text.UTF8Encoding]::new($false))
    & aws dynamodb put-item --cli-input-json "file://$tempFile" --region $Region
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el admin." }
}
finally {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Admin creado: $Email" -ForegroundColor Green
