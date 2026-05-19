# AI Workspace Manager - Windows one-click installer
#
# This script installs AI Workspace Manager from the GitHub main branch.
# It keeps the console clean and writes detailed command output to install.log.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"

$ErrorActionPreference = "Stop"
$script:InstallLog = Join-Path $env:TEMP "AI-Workspace-Manager-install.log"

function Initialize-InstallLog {
    param([Parameter(Mandatory = $true)][string]$LogPath)

    $script:InstallLog = $LogPath
    $logParent = Split-Path -Parent $script:InstallLog
    if ($logParent -and -not (Test-Path $logParent)) {
        New-Item -ItemType Directory -Path $logParent -Force | Out-Null
    }

    @(
        "==================================================",
        "AI Workspace Manager installer log",
        "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
        "User: $env:USERNAME",
        "Computer: $env:COMPUTERNAME",
        "PowerShell: $($PSVersionTable.PSVersion)",
        "==================================================",
        ""
    ) | Set-Content -Path $script:InstallLog -Encoding UTF8
}

function Move-InstallLog {
    param([Parameter(Mandatory = $true)][string]$TargetFolder)

    $finalLog = Join-Path $TargetFolder "install.log"
    $currentLog = $script:InstallLog

    if ($currentLog -ne $finalLog) {
        $targetParent = Split-Path -Parent $finalLog
        if (-not (Test-Path $targetParent)) {
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        }

        if (Test-Path $currentLog) {
            Copy-Item -LiteralPath $currentLog -Destination $finalLog -Force
        }
        else {
            New-Item -ItemType File -Path $finalLog -Force | Out-Null
        }

        $script:InstallLog = $finalLog
        Write-Log "Log moved to project folder: $finalLog"
    }

    return $finalLog
}

function Write-Log {
    param([Parameter(Mandatory = $true)][string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $Message" | Add-Content -Path $script:InstallLog -Encoding UTF8
}

function Write-ConsoleStep {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
    Write-Log "STEP: $Message"
}

function Write-ConsoleSuccess {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host "    $Message" -ForegroundColor Green
    Write-Log "SUCCESS: $Message"
}

function Write-ConsoleWarning {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host "    $Message" -ForegroundColor Yellow
    Write-Log "WARNING: $Message"
}

function Write-ConsoleError {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Write-Host "Log de instalacion: $script:InstallLog" -ForegroundColor Yellow
    Write-Log "ERROR: $Message"
}

function Resolve-CommandExecutable {
    param([Parameter(Mandatory = $true)][string]$FilePath)

    $command = Get-Command $FilePath -ErrorAction Stop
    $source = $command.Source

    if ($source -and $source.EndsWith(".ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
        $cmdShim = [System.IO.Path]::ChangeExtension($source, ".cmd")
        if (Test-Path $cmdShim) {
            return $cmdShim
        }
    }

    return $source
}

function Wait-ProcessWithSpinner {
    param(
        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$Process,

        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $frames = @('|', '/', '-', '\')
    $index = 0

    while (-not $Process.HasExited) {
        $frame = $frames[$index % $frames.Count]
        Write-Host -NoNewline "`r    $frame $Message..."
        Start-Sleep -Milliseconds 140
        $index++
    }

    Write-Host -NoNewline "`r    - $Message... completado.          `n"
}

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [Parameter(Mandatory = $true)]
        [string]$FailureMessage,

        [string]$Activity = "Trabajando en segundo plano"
    )

    $displayCommand = "$FilePath $($Arguments -join ' ')"
    Write-Log "COMMAND: $displayCommand"

    $stdoutLog = Join-Path $env:TEMP "AI-Workspace-Manager-stdout-$([guid]::NewGuid()).log"
    $stderrLog = Join-Path $env:TEMP "AI-Workspace-Manager-stderr-$([guid]::NewGuid()).log"

    try {
        $commandPath = Resolve-CommandExecutable -FilePath $FilePath
        $process = Start-Process `
            -FilePath $commandPath `
            -ArgumentList $Arguments `
            -NoNewWindow `
            -PassThru `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog

        Wait-ProcessWithSpinner -Process $process -Message $Activity
        $exitCode = $process.ExitCode

        if (Test-Path $stdoutLog) {
            $stdout = Get-Content -Path $stdoutLog -Raw -ErrorAction SilentlyContinue
            if ($stdout -and $stdout.Trim()) {
                Add-Content -Path $script:InstallLog -Value $stdout -Encoding UTF8
            }
        }

        if (Test-Path $stderrLog) {
            $stderr = Get-Content -Path $stderrLog -Raw -ErrorAction SilentlyContinue
            if ($stderr -and $stderr.Trim()) {
                Add-Content -Path $script:InstallLog -Value $stderr -Encoding UTF8
            }
        }
    }
    finally {
        if (Test-Path $stdoutLog) {
            Remove-Item -LiteralPath $stdoutLog -Force -ErrorAction SilentlyContinue
        }

        if (Test-Path $stderrLog) {
            Remove-Item -LiteralPath $stderrLog -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Log "EXIT CODE: $exitCode"

    if ($exitCode -ne 0) {
        if (Select-String -Path $script:InstallLog -Pattern "Electron uninstall" -Quiet) {
            throw "Electron no quedo instalado correctamente. $FailureMessage"
        }

        throw "$FailureMessage Codigo de salida: $exitCode"
    }
}

function Update-SessionPath {
    Write-Log "Refreshing PATH for current PowerShell session."

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
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        return $false
    }

    $versionRaw = & node -v
    Write-Log "Detected node version: $versionRaw"
    if ($versionRaw -match "^v(\d+)") {
        return ([int]$Matches[1] -ge 20)
    }

    return $false
}

function Test-NpmVersion {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        return $false
    }

    $versionRaw = & npm -v
    Write-Log "Detected npm version: $versionRaw"
    if ($versionRaw -match "^(\d+)") {
        return ([int]$Matches[1] -ge 10)
    }

    return $false
}

function Install-NodeWithWinget {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget no esta disponible. Instala Node.js >= 20 desde https://nodejs.org y vuelve a ejecutar este instalador."
    }

    Write-ConsoleWarning "Node.js >= 20 no esta disponible. Se instalara con winget."
    Invoke-LoggedCommand `
        -FilePath "winget" `
        -Arguments @(
            "install",
            "--id", "OpenJS.NodeJS",
            "-e",
            "--silent",
            "--accept-source-agreements",
            "--accept-package-agreements"
        ) `
        -FailureMessage "No se pudo instalar Node.js con winget." `
        -Activity "Instalando Node.js con winget"

    Update-SessionPath

    if (-not (Test-NodeVersion)) {
        throw "Node.js no se detecta despues de la instalacion automatica. Abre una terminal nueva o instala Node.js manualmente."
    }
}

function Resolve-TargetFolder {
    $desktop = [System.Environment]::GetFolderPath("Desktop")
    $userProfile = $env:USERPROFILE
    $isOneDrive = ($desktop -like "*OneDrive*") -or (Test-Path env:OneDrive) -or (Test-Path env:OneDriveConsumer)

    if ($isOneDrive) {
        Write-ConsoleWarning "OneDrive detectado. Se usara la carpeta del usuario para evitar bloqueos."
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

    Write-ConsoleWarning "Instalacion existente detectada. Se creara un backup."
    Write-Log "Existing install: $TargetFolder"
    Write-Log "Backup folder: $backupFolder"

    try {
        Move-Item -LiteralPath $TargetFolder -Destination $backupFolder -Force
        Write-ConsoleSuccess "Backup creado: $backupFolder"
    }
    catch {
        throw "No se pudo crear el backup. Cierra editores o terminales abiertos en la carpeta de instalacion."
    }
}

function Install-ProjectDependencies {
    if (Test-Path "package-lock.json") {
        Write-ConsoleStep "Instalando dependencias"
        Invoke-LoggedCommand `
            -FilePath "npm" `
            -Arguments @("ci") `
            -FailureMessage "La instalacion reproducible de dependencias fallo." `
            -Activity "Instalando dependencias npm"
        return
    }

    Write-ConsoleStep "Instalando dependencias"
    Write-ConsoleWarning "No se encontro package-lock.json. Se usara npm install."
    Invoke-LoggedCommand `
        -FilePath "npm" `
        -Arguments @("install") `
        -FailureMessage "La instalacion de dependencias fallo." `
        -Activity "Instalando dependencias npm"
}

function Test-ElectronInstall {
    $electronRoot = Join-Path (Get-Location) "node_modules\electron"
    $packagePath = Join-Path $electronRoot "package.json"
    $pathTxt = Join-Path $electronRoot "path.txt"
    $versionFile = Join-Path $electronRoot "dist\version"

    if (-not (Test-Path $packagePath)) {
        Write-Log "Electron validation failed: missing $packagePath"
        return $false
    }

    try {
        $electronPackage = Get-Content -Path $packagePath -Raw | ConvertFrom-Json
        $expectedVersion = [string]$electronPackage.version
    }
    catch {
        Write-Log "Electron validation failed: could not parse $packagePath"
        return $false
    }

    if (-not (Test-Path $pathTxt)) {
        Write-Log "Electron validation failed: missing $pathTxt"
        return $false
    }

    $relativeExecutable = (Get-Content -Path $pathTxt -Raw).Trim()
    if (-not $relativeExecutable) {
        Write-Log "Electron validation failed: path.txt is empty"
        return $false
    }

    $electronExe = Join-Path (Join-Path $electronRoot "dist") $relativeExecutable
    if (-not (Test-Path $electronExe)) {
        Write-Log "Electron validation failed: missing executable $electronExe"
        return $false
    }

    if (-not (Test-Path $versionFile)) {
        Write-Log "Electron validation failed: missing $versionFile"
        return $false
    }

    $installedVersion = (Get-Content -Path $versionFile -Raw).Trim().TrimStart("v")
    if ($installedVersion -ne $expectedVersion) {
        Write-Log "Electron validation failed: expected $expectedVersion but found $installedVersion"
        return $false
    }

    Write-Log "Electron validation succeeded: $electronExe ($installedVersion)"
    return $true
}

function Get-ElectronPackageVersion {
    $packagePath = Join-Path (Join-Path (Get-Location) "node_modules\electron") "package.json"

    if (-not (Test-Path $packagePath)) {
        throw "No se encontro node_modules\electron\package.json."
    }

    $electronPackage = Get-Content -Path $packagePath -Raw | ConvertFrom-Json
    return [string]$electronPackage.version
}

function Get-ElectronArch {
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:npm_config_arch -eq "arm64") {
        return "arm64"
    }

    return "x64"
}

function Repair-ElectronFromArtifact {
    Write-ConsoleWarning "Aplicando reparacion manual de Electron."

    $electronRoot = Join-Path (Get-Location) "node_modules\electron"
    $distDir = Join-Path $electronRoot "dist"
    $version = Get-ElectronPackageVersion
    $arch = Get-ElectronArch
    $zipName = "electron-v$version-win32-$arch.zip"
    $cacheRoot = Join-Path $env:LOCALAPPDATA "electron\Cache"
    $zipFile = $null

    Write-Log "Manual Electron repair requested for version $version arch $arch."

    if (Test-Path $cacheRoot) {
        $zipFile = Get-ChildItem -Path $cacheRoot -Filter $zipName -Recurse -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
    }

    if (-not $zipFile) {
        $downloadDir = Join-Path $env:TEMP "AI-Workspace-Manager-Electron"
        if (-not (Test-Path $downloadDir)) {
            New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
        }

        $downloadPath = Join-Path $downloadDir $zipName
        $downloadUrl = "https://github.com/electron/electron/releases/download/v$version/$zipName"
        Write-Log "Electron ZIP not found in cache. Downloading $downloadUrl"

        $client = New-Object System.Net.WebClient
        try {
            $task = $client.DownloadFileTaskAsync($downloadUrl, $downloadPath)
            $frames = @('|', '/', '-', '\')
            $index = 0
            while (-not $task.IsCompleted) {
                $frame = $frames[$index % $frames.Count]
                Write-Host -NoNewline "`r    $frame Descargando binario de Electron..."
                Start-Sleep -Milliseconds 140
                $index++
            }
            Write-Host -NoNewline "`r    - Descargando binario de Electron... completado.          `n"

            if ($task.IsFaulted) {
                throw $task.Exception
            }
        }
        finally {
            $client.Dispose()
        }

        $zipFile = Get-Item $downloadPath
    }

    Write-Log "Extracting Electron ZIP: $($zipFile.FullName)"

    if (Test-Path $distDir) {
        Remove-Item -LiteralPath $distDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null

    $frames = @('|', '/', '-', '\')
    $job = Start-Job -ScriptBlock {
        param($ZipPath, $Destination)
        Expand-Archive -Path $ZipPath -DestinationPath $Destination -Force
    } -ArgumentList $zipFile.FullName, $distDir
    $index = 0
    while ($job.State -eq "Running") {
        $frame = $frames[$index % $frames.Count]
        Write-Host -NoNewline "`r    $frame Extrayendo binario de Electron..."
        Start-Sleep -Milliseconds 140
        $index++
    }
    Write-Host -NoNewline "`r    - Extrayendo binario de Electron... completado.          `n"

    Receive-Job -Job $job *>> $script:InstallLog
    if ($job.State -ne "Completed") {
        Remove-Job -Job $job -Force
        throw "No se pudo extraer el ZIP de Electron."
    }
    Remove-Job -Job $job -Force

    $typeFile = Join-Path $distDir "electron.d.ts"
    if (Test-Path $typeFile) {
        Move-Item -LiteralPath $typeFile -Destination (Join-Path $electronRoot "electron.d.ts") -Force
    }

    "electron.exe" | Set-Content -Path (Join-Path $electronRoot "path.txt") -NoNewline -Encoding ASCII
    Write-Log "Manual Electron repair completed."
}

function Repair-ElectronInstall {
    Write-ConsoleStep "Verificando Electron"

    if (Test-ElectronInstall) {
        Write-ConsoleSuccess "Electron esta listo."
        return
    }

    Write-ConsoleWarning "Electron esta incompleto. Ejecutando reparacion automatica."
    Invoke-LoggedCommand `
        -FilePath "npm" `
        -Arguments @("run", "electron:repair") `
        -FailureMessage "No se pudo reparar Electron." `
        -Activity "Reparando binarios de Electron"

    if (-not (Test-ElectronInstall)) {
        Repair-ElectronFromArtifact
    }

    if (-not (Test-ElectronInstall)) {
        throw "Electron sigue incompleto despues de la reparacion automatica y manual."
    }

    Write-ConsoleSuccess "Electron reparado correctamente."
}

function Start-Application {
    Write-ConsoleStep "Iniciando aplicacion"

    if (-not (Test-ElectronInstall)) {
        Repair-ElectronInstall
    }

    Invoke-LoggedCommand `
        -FilePath "npm" `
        -Arguments @("run", "dev") `
        -FailureMessage "No se pudo iniciar la aplicacion." `
        -Activity "Ejecutando Electron"
}

Initialize-InstallLog -LogPath $script:InstallLog

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   AI Workspace Manager - Instalador profesional  " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "La salida detallada se guardara en install.log." -ForegroundColor Gray

$targetFolder = $null
$tempZip = Join-Path $env:TEMP "AI-Workspace-Manager.zip"
$tempExtractDir = Join-Path $env:TEMP "AI-Workspace-Manager-TempExt"

try {
    Write-ConsoleStep "Validando entorno"

    if (-not (Test-NodeVersion)) {
        Install-NodeWithWinget
    }
    else {
        Write-ConsoleSuccess "Node.js detectado."
    }

    if (-not (Test-NpmVersion)) {
        Write-ConsoleWarning "npm >= 10 no esta disponible. Se actualizara npm."
        Invoke-LoggedCommand `
            -FilePath "npm" `
            -Arguments @("install", "-g", "npm@latest") `
            -FailureMessage "No se pudo actualizar npm." `
            -Activity "Actualizando npm"
        Update-SessionPath

        if (-not (Test-NpmVersion)) {
            throw "npm >= 10 no se detecta despues de la actualizacion."
        }
    }
    else {
        Write-ConsoleSuccess "npm detectado."
    }

    $targetFolder = Resolve-TargetFolder
    $extractedFolder = Join-Path $tempExtractDir "AI-Workspace-Manager-main"
    Write-Log "Target folder: $targetFolder"

    Write-ConsoleStep "Descargando proyecto"

    if (Test-Path $tempZip) {
        Remove-Item -LiteralPath $tempZip -Force
    }

    if (Test-Path $tempExtractDir) {
        Remove-Item -LiteralPath $tempExtractDir -Recurse -Force
    }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    if ([enum]::GetNames([Net.SecurityProtocolType]) -contains "Tls13") {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls13
    }

    Write-Log "Downloading ZIP from GitHub main branch."
    Invoke-WebRequest `
        -Uri "https://github.com/wilkinbarban/AI-Workspace-Manager/archive/refs/heads/main.zip" `
        -OutFile $tempZip `
        -UseBasicParsing *>> $script:InstallLog

    Write-ConsoleSuccess "Proyecto descargado."

    Write-ConsoleStep "Preparando archivos"
    New-Item -ItemType Directory -Path $tempExtractDir -Force | Out-Null
    Expand-Archive -Path $tempZip -DestinationPath $tempExtractDir -Force
    Write-Log "ZIP extracted to $tempExtractDir"

    if (-not (Test-Path $extractedFolder)) {
        throw "No se encontro la carpeta esperada dentro del ZIP descargado."
    }

    Backup-ExistingInstall -TargetFolder $targetFolder

    Move-Item -LiteralPath $extractedFolder -Destination $targetFolder -Force
    Move-InstallLog -TargetFolder $targetFolder | Out-Null
    Write-ConsoleSuccess "Proyecto instalado en $targetFolder"
}
catch {
    Write-ConsoleError $_.Exception.Message
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

    Write-ConsoleStep "Configurando proyecto"

    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env" -Force
        Write-Log ".env created from .env.example"
    }
    else {
        Write-Log ".env already exists and was preserved."
    }

    $env:NODE_ENV = "development"

    Install-ProjectDependencies

    Repair-ElectronInstall

    Write-ConsoleStep "Preparando base de datos"
    Invoke-LoggedCommand `
        -FilePath "npm" `
        -Arguments @("run", "prisma:generate") `
        -FailureMessage "No se pudo generar el cliente Prisma." `
        -Activity "Generando cliente Prisma"
    Invoke-LoggedCommand `
        -FilePath "npm" `
        -Arguments @("run", "db:push") `
        -FailureMessage "No se pudo aplicar el esquema SQLite." `
        -Activity "Aplicando esquema SQLite"
    Write-ConsoleSuccess "Base de datos lista."

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "   Instalacion completada correctamente           " -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "Proyecto: $targetFolder" -ForegroundColor Gray
    Write-Host "Log:      $script:InstallLog" -ForegroundColor Gray

    Start-Application
}
catch {
    Write-ConsoleError $_.Exception.Message
    Exit 1
}
