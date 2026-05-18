# AI Workspace Manager - Windows one-click installer
#
# This script installs AI Workspace Manager from the GitHub main branch.
# It validates Node.js and npm, downloads the repository ZIP, prepares the
# local SQLite/Prisma environment, installs dependencies, and starts the app.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[*] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[+] $Message" -ForegroundColor Green
}

function Write-WarningMessage {
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Write-Failure {
    param([string]$Message)
    Write-Host "[-] $Message" -ForegroundColor Red
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage Codigo de salida: $LASTEXITCODE"
    }
}

function Update-SessionPath {
    Write-Step "Refrescando PATH para esta sesion..."

    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"

    $nodePaths = @(
        "$env:ProgramFiles\nodejs",
        "$env:ProgramFiles(x86)\nodejs"
    )

    foreach ($nodePath in $nodePaths) {
        if ((Test-Path (Join-Path $nodePath "node.exe")) -and ($env:Path -notlike "*$nodePath*")) {
            $env:Path += ";$nodePath"
        }
    }
}

function Test-NodeVersion {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        return $false
    }

    $versionRaw = & node -v
    if ($versionRaw -match "^v(\d+)") {
        return ([int]$Matches[1] -ge 20)
    }

    return $false
}

function Test-NpmVersion {
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        return $false
    }

    $versionRaw = & npm -v
    if ($versionRaw -match "^(\d+)") {
        return ([int]$Matches[1] -ge 10)
    }

    return $false
}

function Install-NodeWithWinget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget no esta disponible. Instala Node.js >= 20 manualmente desde https://nodejs.org y vuelve a ejecutar este instalador."
    }

    Write-WarningMessage "Node.js >= 20 no esta instalado o no esta en PATH. Instalando LTS con winget..."
    Invoke-CheckedCommand `
        -FilePath "winget" `
        -Arguments @(
            "install",
            "--id", "OpenJS.NodeJS",
            "-e",
            "--silent",
            "--accept-source-agreements",
            "--accept-package-agreements"
        ) `
        -FailureMessage "winget no pudo instalar Node.js."

    Update-SessionPath

    if (-not (Test-NodeVersion)) {
        throw "Node.js no se detecta tras la instalacion automatica. Abre una terminal nueva o instala Node.js manualmente."
    }
}

function Resolve-TargetFolder {
    $desktop = [System.Environment]::GetFolderPath("Desktop")
    $userProfile = $env:USERPROFILE
    $isOneDrive = ($desktop -like "*OneDrive*") -or (Test-Path env:OneDrive) -or (Test-Path env:OneDriveConsumer)

    if ($isOneDrive) {
        Write-WarningMessage "Se detecto OneDrive activo o Escritorio sincronizado."
        Write-WarningMessage "Para evitar bloqueos y problemas de permisos se instalara en la carpeta del usuario."
        return (Join-Path $userProfile "AI-Workspace-Manager")
    }

    return (Join-Path $desktop "AI-Workspace-Manager")
}

function Backup-ExistingInstall {
    param([Parameter(Mandatory = $true)][string]$TargetFolder)

    if (-not (Test-Path $TargetFolder)) {
        return
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupFolder = "$TargetFolder.backup-$timestamp"

    Write-WarningMessage "Ya existe una instalacion en: $TargetFolder"
    Write-WarningMessage "Se movera a: $backupFolder"

    try {
        Move-Item -LiteralPath $TargetFolder -Destination $backupFolder -Force
        Write-Success "Backup creado correctamente."
    }
    catch {
        throw "No se pudo crear el backup de la instalacion existente. Cierra editores/terminales abiertos en esa carpeta y vuelve a intentarlo. Detalle: $($_.Exception.Message)"
    }
}

function Install-ProjectDependencies {
    if (Test-Path "package-lock.json") {
        Write-Step "Instalando dependencias con npm ci..."
        Invoke-CheckedCommand -FilePath "npm" -Arguments @("ci") -FailureMessage "npm ci fallo."
        return
    }

    Write-WarningMessage "No se encontro package-lock.json. Usando npm install como fallback."
    Invoke-CheckedCommand -FilePath "npm" -Arguments @("install") -FailureMessage "npm install fallo."
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   AI Workspace Manager - Instalador de un Clic   " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

try {
    if (-not (Test-NodeVersion)) {
        Install-NodeWithWinget
        Write-Success "Node.js instalado correctamente."
    }
    else {
        Write-Success "Node.js detectado ($(node -v))."
    }

    if (-not (Test-NpmVersion)) {
        Write-WarningMessage "npm >= 10 no esta instalado o requiere actualizacion."
        Invoke-CheckedCommand -FilePath "npm" -Arguments @("install", "-g", "npm@latest") -FailureMessage "No se pudo actualizar npm."
        Update-SessionPath

        if (-not (Test-NpmVersion)) {
            throw "npm >= 10 no se detecta despues de la actualizacion."
        }
    }
    else {
        Write-Success "npm detectado ($(& npm -v))."
    }

    Write-Success "Dependencias del sistema validadas."

    $targetFolder = Resolve-TargetFolder
    $tempZip = Join-Path $env:TEMP "AI-Workspace-Manager.zip"
    $tempExtractDir = Join-Path $env:TEMP "AI-Workspace-Manager-TempExt"
    $extractedFolder = Join-Path $tempExtractDir "AI-Workspace-Manager-main"

    Write-Step "Ruta de instalacion: $targetFolder"

    if (Test-Path $tempZip) {
        Remove-Item -LiteralPath $tempZip -Force
    }

    if (Test-Path $tempExtractDir) {
        Remove-Item -LiteralPath $tempExtractDir -Recurse -Force
    }

    Write-Step "Descargando codigo fuente desde GitHub..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    if ([enum]::GetNames([Net.SecurityProtocolType]) -contains "Tls13") {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls13
    }

    Invoke-WebRequest `
        -Uri "https://github.com/wilkinbarban/AI-Workspace-Manager/archive/refs/heads/main.zip" `
        -OutFile $tempZip `
        -UseBasicParsing
    Write-Success "Descarga completada."

    Write-Step "Extrayendo ZIP..."
    New-Item -ItemType Directory -Path $tempExtractDir -Force | Out-Null
    Expand-Archive -Path $tempZip -DestinationPath $tempExtractDir -Force

    if (-not (Test-Path $extractedFolder)) {
        throw "No se encontro la carpeta esperada dentro del ZIP: $extractedFolder"
    }

    Backup-ExistingInstall -TargetFolder $targetFolder

    Write-Step "Moviendo proyecto a la ruta final..."
    Move-Item -LiteralPath $extractedFolder -Destination $targetFolder -Force
    Write-Success "Proyecto instalado en: $targetFolder"
}
catch {
    Write-Failure $_.Exception.Message
    Exit 1
}
finally {
    if ($tempZip -and (Test-Path $tempZip)) {
        Remove-Item -LiteralPath $tempZip -Force
    }

    if ($tempExtractDir -and (Test-Path $tempExtractDir)) {
        Remove-Item -LiteralPath $tempExtractDir -Recurse -Force
    }
}

try {
    Set-Location $targetFolder

    if (-not (Test-Path ".env")) {
        Write-Step "Creando .env desde .env.example..."
        Copy-Item ".env.example" ".env" -Force
    }
    else {
        Write-Success ".env existente preservado."
    }

    $env:NODE_ENV = "development"

    Install-ProjectDependencies

    Write-Step "Verificando y reparando instalacion de Electron..."
    Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "electron:repair") -FailureMessage "npm run electron:repair fallo."

    Write-Step "Generando cliente Prisma..."
    Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "prisma:generate") -FailureMessage "npm run prisma:generate fallo."

    Write-Step "Aplicando esquema SQLite local..."
    Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "db:push") -FailureMessage "npm run db:push fallo."

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "   Entorno configurado e instalado con exito      " -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "[*] Carpeta del proyecto: $targetFolder" -ForegroundColor Gray
    Write-Host "[*] Para abrirlo mas tarde:" -ForegroundColor Gray
    Write-Host "    cd `"$targetFolder`"" -ForegroundColor Gray
    Write-Host "    npm run dev" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[*] Iniciando la aplicacion en modo desarrollo..." -ForegroundColor Yellow
    Write-Host "[*] Presiona Ctrl+C para detenerla." -ForegroundColor Gray
    Write-Host ""

    Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "dev") -FailureMessage "npm run dev fallo."
}
catch {
    Write-Failure $_.Exception.Message
    Write-Host ""
    Write-Host "Puedes reintentar manualmente con:" -ForegroundColor Yellow
    Write-Host "  cd `"$targetFolder`"" -ForegroundColor Yellow
    Write-Host "  npm ci" -ForegroundColor Yellow
    Write-Host "  npm run prisma:generate" -ForegroundColor Yellow
    Write-Host "  npm run db:push" -ForegroundColor Yellow
    Write-Host "  npm run dev" -ForegroundColor Yellow
    Exit 1
}
