# ─── AI Workspace Manager - Windows One-Click Installer ──────────────────────
#
# This script automates the environment setup and installation of AI Workspace Manager.
# It validates dependencies (Node.js >= 20, npm >= 10, Git), installs them via winget
# if missing, configures environment variables, restores packages, and launches
# the application in development mode.
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

# ─── Check & Install Git ─────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Git no está instalado. Instalándolo vía winget..." -ForegroundColor Yellow
    try {
        Start-Process winget -ArgumentList "install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements" -NoNewWindow -Wait
        Refresh-SessionPath
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            throw "No se pudo encontrar Git después de la instalación."
        }
        Write-Host "[+] Git instalado correctamente." -ForegroundColor Green
    } catch {
        Write-Host "[-] Error al instalar Git de forma automática. Por favor instálalo desde git-scm.com y vuelve a correr el script." -ForegroundColor Red
        Exit 1
    }
} else {
    Write-Host "[+] Git detectado correctamente." -ForegroundColor Green
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

# ─── Cloning or entering repository ──────────────────────────────────────────
$inRepo = $false
if (Test-Path "package.json") {
    $pkgJson = Get-Content "package.json" -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($pkgJson -and $pkgJson.name -eq "ai-workspace-manager") {
        $inRepo = $true
    }
}

if ($inRepo) {
    Write-Host "[*] Detectado directorio del proyecto. Configurando en la ubicación actual..." -ForegroundColor Cyan
} else {
    Write-Host "[*] No se detectó el directorio del proyecto en la ubicación actual." -ForegroundColor Yellow
    Write-Host "[*] Clonando repositorio 'AI-Workspace-Manager' desde GitHub..." -ForegroundColor Cyan
    
    if (Test-Path "AI-Workspace-Manager") {
        Write-Host "[!] Ya existe un directorio 'AI-Workspace-Manager'. Accediendo a él..." -ForegroundColor Yellow
        Set-Location "AI-Workspace-Manager"
    } else {
        try {
            git clone "https://github.com/wilkinbarban/AI-Workspace-Manager.git"
            Set-Location "AI-Workspace-Manager"
            Write-Host "[+] Clonado completado." -ForegroundColor Green
        } catch {
            Write-Host "[-] Error al clonar el repositorio." -ForegroundColor Red
            Exit 1
        }
    }
}

# ─── Install Project Dependencies ────────────────────────────────────────────
Write-Host ""
Write-Host "[*] 1. Instalando dependencias del proyecto (npm install)..." -ForegroundColor Cyan
& npm install

Write-Host ""
Write-Host "[*] 2. Generando cliente de base de datos local (npm run prisma:generate)..." -ForegroundColor Cyan
& npm run prisma:generate

Write-Host ""
Write-Host "[*] 3. Aplicando migraciones y esquema local (npm run db:push)..." -ForegroundColor Cyan
& npm run db:push

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "   ¡Entorno configurado e instalado con éxito!    " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[*] Iniciando la aplicación en modo desarrollo (npm run dev)..." -ForegroundColor Yellow
Write-Host "[*] Presiona Ctrl+C en esta terminal para detener la aplicación." -ForegroundColor Gray
Write-Host ""

# Launch dev server
& npm run dev
