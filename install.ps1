# ─── AI Workspace Manager - Windows One-Click Installer (ZIP Method) ─────────
#
# This script automates the environment setup and installation of AI Workspace Manager.
# It validates Node.js and npm, installs them via winget if missing, downloads the
# repository source code as a ZIP file, extracts it directly onto the user's Desktop,
# installs project dependencies, and launches the app in development mode.
#
# Usage:
#   powershell -c "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   AI Workspace Manager - Instalador de un Clic   " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# ─── Helper: Reload PATH in current session ──────────────────────────────────
function Refresh-SessionPath {
    Write-Host "[*] Refrescando variables de entorno del PATH para esta sesión..." -ForegroundColor Yellow
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# ─── Helper: Validate Node.js Version ────────────────────────────────────────
function Test-NodeVersion {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $versionRaw = node -v
        # node -v returns 'vX.Y.Z' -> extract major
        if ($versionRaw -match "^v(\d+)") {
            $major = [int]$Matches[1]
            return $major -ge 20
        }
    }
    return $false
}

# ─── Helper: Validate npm Version ────────────────────────────────────────────
function Test-NpmVersion {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        # npm -v returns 'X.Y.Z'
        $versionRaw = & npm -v
        if ($versionRaw -match "^(\d+)") {
            $major = [int]$Matches[1]
            return $major -ge 10
        }
    }
    return $false
}

# ─── Check & Install Node.js ─────────────────────────────────────────────────
if (-not (Test-NodeVersion)) {
    Write-Host "[!] Node.js >= 20 no está instalado o no se encuentra en el PATH. Instalando LTS vía winget..." -ForegroundColor Yellow
    try {
        # OpenJS.NodeJS is the official LTS package on winget
        Start-Process winget -ArgumentList "install --id OpenJS.NodeJS -e --silent --accept-source-agreements --accept-package-agreements" -NoNewWindow -Wait
        Refresh-SessionPath
        
        # Fallback check path directly if session path reload didn't catch it
        $nodePaths = @(
            "$env:ProgramFiles\nodejs",
            "$env:ProgramFiles(x86)\nodejs"
        )
        foreach ($p in $nodePaths) {
            if (Test-Path "$p\node.exe") {
                $env:Path += ";$p"
            }
        }

        if (-not (Test-NodeVersion)) {
            throw "Node.js no se detecta en el PATH tras la instalación automática."
        }
        Write-Host "[+] Node.js instalado correctamente." -ForegroundColor Green
    } catch {
        Write-Host "[-] Error al instalar Node.js. Por favor instálalo desde nodejs.org (versión >= 20) y vuelve a correr el script." -ForegroundColor Red
        Exit 1
    }
} else {
    $currentVersion = node -v
    Write-Host "[+] Node.js detectado ($currentVersion)." -ForegroundColor Green
}

# ─── Check & Update npm ──────────────────────────────────────────────────────
if (-not (Test-NpmVersion)) {
    Write-Host "[!] npm >= 10 no está instalado o requiere actualización. Actualizando..." -ForegroundColor Yellow
    try {
        # Update npm globally using node's npm
        Start-Process cmd -ArgumentList "/c npm install -g npm@latest" -NoNewWindow -Wait
        Refresh-SessionPath
        if (-not (Test-NpmVersion)) {
            throw "npm no se actualizó correctamente."
        }
        Write-Host "[+] npm actualizado correctamente." -ForegroundColor Green
    } catch {
        Write-Host "[-] Error al actualizar npm. Intentando continuar de todos modos..." -ForegroundColor Yellow
    }
} else {
    $currentNpm = & npm -v
    Write-Host "[+] npm detectado ($currentNpm)." -ForegroundColor Green
}

Write-Host ""
Write-Host "[*] Comprobación de dependencias del sistema completada con éxito." -ForegroundColor Green
Write-Host ""

# ─── Resolving Desktop Path and Downloading ZIP ──────────────────────────────
$desktop = [System.Environment]::GetFolderPath("Desktop")
$targetFolder = Join-Path $desktop "AI-Workspace-Manager"

Write-Host "[*] Resolviendo ruta de instalación en el Escritorio..." -ForegroundColor Cyan
Write-Host "[*] Destino: $targetFolder" -ForegroundColor Gray

# Create temporary paths for downloading and extracting
$tempZip = Join-Path $env:TEMP "AI-Workspace-Manager.zip"
$tempExtractDir = Join-Path $env:TEMP "AI-Workspace-Manager-TempExt"

# Clean up any leftover temporary files/folders from previous attempts
if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
if (Test-Path $tempExtractDir) { Remove-Item $tempExtractDir -Recurse -Force }

Write-Host "[*] Descargando código fuente en formato ZIP desde GitHub..." -ForegroundColor Cyan
try {
    # Force use TLS 1.2/1.3 for download security
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    
    Invoke-WebRequest -Uri "https://github.com/wilkinbarban/AI-Workspace-Manager/archive/refs/heads/main.zip" -OutFile $tempZip -UseBasicParsing
    Write-Host "[+] Descarga completada." -ForegroundColor Green
} catch {
    Write-Host "[-] Error al descargar el archivo ZIP desde GitHub. Verifica tu conexión a internet." -ForegroundColor Red
    Exit 1
}

Write-Host "[*] Extrayendo archivos..." -ForegroundColor Cyan
try {
    # Expand-Archive extracts zip into $tempExtractDir
    New-Item -ItemType Directory -Path $tempExtractDir -Force | Out-Null
    Expand-Archive -Path $tempZip -DestinationPath $tempExtractDir -Force
    Write-Host "[+] Extracción completada." -ForegroundColor Green
} catch {
    Write-Host "[-] Error al extraer el archivo ZIP descargado." -ForegroundColor Red
    Exit 1
}

# The extracted directory name inside the ZIP is "AI-Workspace-Manager-main"
$extractedFolder = Join-Path $tempExtractDir "AI-Workspace-Manager-main"

Write-Host "[*] Moviendo la carpeta al Escritorio..." -ForegroundColor Cyan
try {
    # If the target folder on the Desktop already exists, delete it first for a clean state
    if (Test-Path $targetFolder) {
        Write-Host "[!] Se detectó una carpeta existente de AI-Workspace-Manager en el Escritorio. Eliminándola para una instalación limpia..." -ForegroundColor Yellow
        Remove-Item $targetFolder -Recurse -Force
    }

    Move-Item -Path $extractedFolder -Destination $targetFolder -Force
    Write-Host "[+] Carpeta instalada en el Escritorio correctamente." -ForegroundColor Green
} catch {
    Write-Host "[-] Error al mover la carpeta al Escritorio. Verifica que no esté abierta en otra aplicación." -ForegroundColor Red
    Exit 1
} finally {
    # Clean up temporary zip and temp directory
    if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
    if (Test-Path $tempExtractDir) { Remove-Item $tempExtractDir -Recurse -Force }
}

# Navigate into the project folder on the Desktop
Set-Location $targetFolder

# ─── Configure Environment Variables (.env) ──────────────────────────────────
if (-not (Test-Path ".env")) {
    Write-Host "[*] Creando archivo de variables de entorno (.env) a partir de .env.example..." -ForegroundColor Cyan
    Copy-Item ".env.example" ".env" -Force
}

# ─── Limpieza previa para garantizar instalación fresca ──────────────────────
# El ZIP trae un package-lock.json de otra máquina que hace que npm no instale nada.
# Eliminarlo fuerza a npm a resolver todas las dependencias desde cero.
Write-Host ""
Write-Host "[*] Eliminando package-lock.json para forzar instalación fresca..." -ForegroundColor Cyan
if (Test-Path "package-lock.json") { Remove-Item "package-lock.json" -Force }
if (Test-Path "node_modules") {
    Write-Host "[!] Eliminando node_modules previo..." -ForegroundColor Yellow
    Remove-Item "node_modules" -Recurse -Force
}

# ─── Install Project Dependencies ────────────────────────────────────────────
Write-Host ""
Write-Host "[*] 1. Instalando todas las dependencias del proyecto..." -ForegroundColor Cyan
$env:NODE_ENV = "development"
& npm install

Write-Host ""
Write-Host "[*] 2. Instalando explícitamente Prisma CLI y @prisma/client v6..." -ForegroundColor Cyan
& npm install --save-dev prisma@6.19.3
& npm install @prisma/client@6.19.3

Write-Host ""
Write-Host "[*] 3. Generando cliente de base de datos local (Prisma v6)..." -ForegroundColor Cyan
& npm run prisma:generate

Write-Host ""
Write-Host "[*] 4. Aplicando esquema local a SQLite..." -ForegroundColor Cyan
& npm run db:push

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "   ¡Entorno configurado e instalado con éxito!    " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[*] Carpeta del proyecto: $targetFolder" -ForegroundColor Gray
Write-Host "[*] Iniciando la aplicación en modo desarrollo..." -ForegroundColor Yellow
Write-Host "[*] Presiona Ctrl+C en esta terminal para detener la aplicación." -ForegroundColor Gray
Write-Host ""

# Launch via npm scripts to handle cross-platform path resolution safely
& npm run dev
