# AI Workspace Manager - Instalador profesional para Windows
#
# Este script instala AI Workspace Manager desde la rama main de GitHub.
# Mantiene la consola limpia para el usuario final y envia la salida detallada,
# warnings y errores tecnicos a install.log para auditoria.
#
# Uso remoto recomendado:
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/wilkinbarban/AI-Workspace-Manager/main/install.ps1 | iex"

# Hace que cualquier error no controlado detenga el script inmediatamente.
$ErrorActionPreference = "Stop"

# Ruta inicial del log. Se usa un archivo temporal hasta que existe la carpeta
# final del proyecto; despues se mueve a <proyecto>\install.log.
$script:InstallLog = Join-Path $env:TEMP "AI-Workspace-Manager-install.log"

<#
.SYNOPSIS
Inicializa el archivo de auditoria de la instalacion.

.DESCRIPTION
Crea la carpeta contenedora del log si no existe, actualiza la variable global
$script:InstallLog y escribe el encabezado con fecha, usuario, equipo y version
de PowerShell. Esta funcion debe ejecutarse antes de cualquier Write-Log.

.PARAMETER LogPath
Ruta absoluta del archivo donde se escribira el log inicial.

.VARIABLES
$script:InstallLog: ruta activa del log compartida por todas las funciones.
$logParent: carpeta contenedora del archivo de log.
#>
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

<#
.SYNOPSIS
Mueve el log temporal a la carpeta final del proyecto.

.DESCRIPTION
Cuando la descarga y extraccion ya produjeron la carpeta instalada, copia o crea
install.log dentro de esa carpeta y actualiza $script:InstallLog para que todo el
resto del flujo escriba en la ubicacion final auditable por el usuario.

.PARAMETER TargetFolder
Carpeta raiz donde quedo instalado AI Workspace Manager.

.VARIABLES
$finalLog: ruta definitiva <TargetFolder>\install.log.
$currentLog: ruta del log activo antes del movimiento.
$targetParent: carpeta contenedora del log final.
#>
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

<#
.SYNOPSIS
Escribe una linea con timestamp en el log activo.

.DESCRIPTION
Centraliza la escritura del log para que todos los mensajes tengan el mismo
formato temporal y usen la ruta actualizada en $script:InstallLog.

.PARAMETER Message
Mensaje tecnico o de auditoria que se agregara al log.

.VARIABLES
$timestamp: fecha y hora local usadas como prefijo de la entrada.
#>
function Write-Log {
    param([Parameter(Mandatory = $true)][string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $Message" | Add-Content -Path $script:InstallLog -Encoding UTF8
}

<#
.SYNOPSIS
Muestra una fase principal del instalador.

.DESCRIPTION
Imprime en consola un paso visible y registra el mismo evento en install.log.
Se usa para acciones de alto nivel: validar entorno, descargar, instalar,
preparar base de datos e iniciar la aplicacion.

.PARAMETER Message
Nombre corto de la fase en curso.
#>
function Write-ConsoleStep {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
    Write-Log "STEP: $Message"
}

<#
.SYNOPSIS
Muestra y registra un resultado exitoso.

.PARAMETER Message
Mensaje de exito orientado al usuario.
#>
function Write-ConsoleSuccess {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host "    $Message" -ForegroundColor Green
    Write-Log "SUCCESS: $Message"
}

<#
.SYNOPSIS
Muestra y registra una advertencia recuperable.

.PARAMETER Message
Mensaje preventivo que no detiene necesariamente la instalacion.
#>
function Write-ConsoleWarning {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host "    $Message" -ForegroundColor Yellow
    Write-Log "WARNING: $Message"
}

<#
.SYNOPSIS
Muestra un error final y la ruta del log.

.DESCRIPTION
Evita volcar detalles tecnicos extensos en consola. El usuario ve el mensaje
resumido y la ruta exacta del install.log para auditoria.

.PARAMETER Message
Descripcion resumida del fallo.
#>
function Write-ConsoleError {
    param([Parameter(Mandatory = $true)][string]$Message)

    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Write-Host "Log de instalacion: $script:InstallLog" -ForegroundColor Yellow
    Write-Log "ERROR: $Message"
}

<#
.SYNOPSIS
Resuelve el ejecutable real de un comando.

.DESCRIPTION
En Windows, comandos como npm pueden resolverse primero a un shim .ps1. Para
ejecutarlos desde System.Diagnostics.Process con salida redirigida, se prefiere
el shim .cmd equivalente cuando existe.

.PARAMETER FilePath
Nombre de comando o ruta de ejecutable solicitada.

.VARIABLES
$command: resultado de Get-Command.
$source: ruta detectada del comando.
$cmdShim: ruta alternativa .cmd cuando el comando apunta a .ps1.
#>
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

<#
.SYNOPSIS
Muestra un indicador animado mientras un proceso externo sigue activo.

.DESCRIPTION
La salida real del proceso se redirige al log. Esta funcion mantiene la consola
viva con un spinner para que el usuario sepa que el instalador sigue trabajando.

.PARAMETER Process
Proceso externo iniciado previamente.

.PARAMETER Message
Texto descriptivo mostrado junto al spinner.

.VARIABLES
$frames: secuencia de caracteres usada para animar el spinner.
$index: contador usado para seleccionar el frame actual.
$frame: caracter mostrado en la iteracion actual.
#>
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

<#
.SYNOPSIS
Convierte argumentos en una cadena segura para ProcessStartInfo.

.DESCRIPTION
System.Diagnostics.ProcessStartInfo.Arguments recibe una cadena, no un arreglo.
Esta funcion conserva argumentos con espacios o comillas envolviendolos y
escapando comillas internas.

.PARAMETER Arguments
Lista ordenada de argumentos que recibira el proceso externo.
#>
function ConvertTo-ProcessArgumentString {
    param([string[]]$Arguments)

    return ($Arguments | ForEach-Object {
            if ($_ -match '[\s"]') {
                '"' + ($_ -replace '"', '\"') + '"'
            }
            else {
                $_
            }
        }) -join ' '
}

<#
.SYNOPSIS
Ejecuta un comando externo con salida completa en install.log.

.DESCRIPTION
Lanza npm, winget, Prisma, Electron u otros comandos mediante
System.Diagnostics.Process para obtener un ExitCode fiable. La consola muestra
solo un spinner; stdout y stderr se agregan al log. Si el comando falla, lanza
un error resumido y conserva el detalle en install.log.

.PARAMETER FilePath
Comando o ejecutable a ejecutar.

.PARAMETER Arguments
Argumentos del comando externo.

.PARAMETER FailureMessage
Mensaje de error de alto nivel usado si el comando devuelve codigo distinto de 0.

.PARAMETER Activity
Texto del spinner mostrado mientras el proceso esta activo.

.VARIABLES
$displayCommand: representacion legible del comando para el log.
$stdout / $stderr: salida capturada del proceso.
$commandPath: ejecutable real resuelto por Resolve-CommandExecutable.
$startInfo: configuracion de arranque del proceso.
$process: instancia System.Diagnostics.Process en ejecucion.
$stdoutTask / $stderrTask: lecturas asincronas de salida estandar y error.
$exitCode: codigo final devuelto por el proceso.
#>
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

    $stdout = $null
    $stderr = $null

    try {
        $commandPath = Resolve-CommandExecutable -FilePath $FilePath

        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $commandPath
        $startInfo.Arguments = ConvertTo-ProcessArgumentString -Arguments $Arguments
        $startInfo.WorkingDirectory = (Get-Location).Path
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $startInfo
        $null = $process.Start()

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()

        Wait-ProcessWithSpinner -Process $process -Message $Activity
        $process.WaitForExit()
        $exitCode = $process.ExitCode
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result

        if ($null -eq $exitCode) {
            throw "$FailureMessage El proceso termino sin devolver codigo de salida."
        }

        if ($stdout -and $stdout.Trim()) {
            Add-Content -Path $script:InstallLog -Value $stdout -Encoding UTF8
        }

        if ($stderr -and $stderr.Trim()) {
            Add-Content -Path $script:InstallLog -Value $stderr -Encoding UTF8
        }
    }
    finally {
        if ($process) {
            $process.Dispose()
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

<#
.SYNOPSIS
Refresca PATH dentro de la sesion actual de PowerShell.

.DESCRIPTION
Despues de instalar Node.js o npm, Windows puede actualizar PATH en el registro
pero no en la sesion actual. Esta funcion reconstruye $env:Path desde los scopes
Machine/User y agrega rutas comunes de Node.js si detecta node.exe.

.VARIABLES
$machinePath: PATH configurado a nivel de maquina.
$userPath: PATH configurado para el usuario actual.
$nodePaths: ubicaciones habituales de Node.js en Windows.
$nodePath: ruta individual evaluada durante el recorrido.
#>
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

<#
.SYNOPSIS
Verifica que Node.js exista y cumpla la version minima.

.DESCRIPTION
El proyecto requiere Node.js 20 o superior. La funcion escribe la version
detectada en el log y devuelve $true solo si el major version es suficiente.

.VARIABLES
$versionRaw: salida cruda de node -v, por ejemplo v26.1.0.
$Matches: captura automatica de PowerShell usada para extraer el major version.
#>
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

<#
.SYNOPSIS
Verifica que npm exista y cumpla la version minima.

.DESCRIPTION
El instalador requiere npm 10 o superior. La funcion registra la version
detectada y devuelve $true solo si el major version es suficiente.

.VARIABLES
$versionRaw: salida cruda de npm -v.
$Matches: captura automatica de PowerShell usada para extraer el major version.
#>
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

<#
.SYNOPSIS
Instala Node.js automaticamente mediante winget.

.DESCRIPTION
Si Node.js no esta disponible o no cumple la version minima, usa winget para
instalar OpenJS.NodeJS. Si winget no existe, detiene el flujo con instrucciones
manuales. Despues refresca PATH y revalida Node.js.
#>
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

<#
.SYNOPSIS
Calcula la carpeta destino de instalacion.

.DESCRIPTION
Evita instalar en Escritorio sincronizado con OneDrive, porque puede bloquear
node_modules o binarios de Electron. Si detecta OneDrive, usa el perfil del
usuario; si no, usa el Escritorio local.

.VARIABLES
$desktop: ruta del Escritorio del usuario.
$userProfile: perfil base del usuario actual.
$isOneDrive: indicador de Escritorio o entorno asociado a OneDrive.
#>
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

<#
.SYNOPSIS
Crea backup de una instalacion previa.

.DESCRIPTION
El instalador es seguro por defecto: nunca borra directamente una carpeta
existente. Si TargetFolder ya existe, la mueve a una carpeta con timestamp.

.PARAMETER TargetFolder
Ruta de instalacion que podria contener una copia previa.

.VARIABLES
$timestamp: marca temporal usada para evitar colisiones de backups.
$backupFolder: ruta final de la copia de respaldo.
#>
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

<#
.SYNOPSIS
Instala dependencias npm del proyecto.

.DESCRIPTION
Usa npm ci cuando existe package-lock.json para instalaciones reproducibles.
Si el repo no trae lockfile, usa npm install y lo registra como fallback. Toda
la salida de npm se guarda en install.log.
#>
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

<#
.SYNOPSIS
Valida que Electron este instalado de forma completa.

.DESCRIPTION
Comprueba los artefactos criticos que electron-vite necesita para arrancar:
package.json, path.txt, ejecutable dentro de dist y archivo dist/version. Tambien
verifica que la version instalada coincida con la version declarada del paquete.

.VARIABLES
$electronRoot: carpeta node_modules\electron.
$packagePath: manifest del paquete Electron.
$pathTxt: archivo que indica el ejecutable relativo.
$versionFile: archivo con la version instalada en dist.
$electronPackage: JSON parseado desde package.json.
$expectedVersion: version esperada segun package.json.
$relativeExecutable: valor leido desde path.txt.
$electronExe: ruta final del ejecutable Electron.
$installedVersion: version real encontrada en dist/version.
#>
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

<#
.SYNOPSIS
Obtiene la version declarada del paquete Electron.

.DESCRIPTION
Lee node_modules\electron\package.json y devuelve su version. Se usa para
construir el nombre del ZIP oficial cuando hay que reparar Electron manualmente.

.VARIABLES
$packagePath: ruta al package.json del paquete Electron.
$electronPackage: objeto JSON del package.json.
#>
function Get-ElectronPackageVersion {
    $packagePath = Join-Path (Join-Path (Get-Location) "node_modules\electron") "package.json"

    if (-not (Test-Path $packagePath)) {
        throw "No se encontro node_modules\electron\package.json."
    }

    $electronPackage = Get-Content -Path $packagePath -Raw | ConvertFrom-Json
    return [string]$electronPackage.version
}

<#
.SYNOPSIS
Detecta la arquitectura de Electron que corresponde al equipo.

.DESCRIPTION
Devuelve arm64 cuando el sistema o npm lo indican; en los demas casos usa x64,
que es la arquitectura Windows comun para Electron.
#>
function Get-ElectronArch {
    if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:npm_config_arch -eq "arm64") {
        return "arm64"
    }

    return "x64"
}

<#
.SYNOPSIS
Repara Electron extrayendo el ZIP oficial.

.DESCRIPTION
Es el fallback manual cuando npm run electron:repair no deja una instalacion
valida. Busca el ZIP en la cache local de Electron; si no existe, lo descarga
desde GitHub Releases, limpia dist, extrae el binario, mueve electron.d.ts si
aparece y recrea path.txt con electron.exe.

.VARIABLES
$electronRoot: carpeta raiz de Electron en node_modules.
$distDir: carpeta donde debe quedar electron.exe.
$version: version esperada de Electron.
$arch: arquitectura objetivo, x64 o arm64.
$zipName: nombre del artefacto oficial de Electron.
$cacheRoot: cache local donde Electron suele guardar descargas.
$zipFile: archivo ZIP seleccionado o descargado.
$downloadDir: carpeta temporal propia del instalador para la descarga.
$downloadPath: ruta final del ZIP descargado.
$downloadUrl: URL de GitHub Releases para el artefacto.
$client: WebClient usado para descarga con progreso visual.
$task: descarga asincrona del ZIP.
$frames / $index / $frame: variables del spinner visual.
$job: trabajo PowerShell que ejecuta Expand-Archive.
$typeFile: archivo electron.d.ts extraido dentro de dist.
#>
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

<#
.SYNOPSIS
Valida y repara Electron antes de iniciar la app.

.DESCRIPTION
Primero ejecuta Test-ElectronInstall. Si falla, intenta la reparacion del script
npm electron:repair. Si todavia falla, usa Repair-ElectronFromArtifact. Solo
retorna con exito cuando Electron queda completamente validado.
#>
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

<#
.SYNOPSIS
Arranca AI Workspace Manager en modo desarrollo.

.DESCRIPTION
Antes de ejecutar npm run dev vuelve a validar Electron. Esto evita el error
Electron uninstall y garantiza que el usuario solo vea un fallo resumido con
detalle disponible en install.log.
#>
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

# Carpeta final de instalacion. Se resuelve despues de validar Node/npm porque
# depende del Escritorio y del estado de OneDrive.
$targetFolder = $null

# ZIP temporal descargado desde GitHub. Se elimina siempre en finally.
$tempZip = Join-Path $env:TEMP "AI-Workspace-Manager.zip"

# Carpeta temporal propia del instalador para extraer el ZIP remoto.
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

    # Carpeta donde se instalara el proyecto y carpeta esperada dentro del ZIP
    # generado por GitHub para la rama main.
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

    # Fuerza TLS moderno para evitar fallos de descarga en entornos Windows con
    # configuraciones antiguas de PowerShell/.NET.
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
    # Limpieza acotada: solo se eliminan temporales creados por este instalador.
    if ($tempZip -and (Test-Path $tempZip)) {
        Remove-Item -LiteralPath $tempZip -Force
    }

    if ($tempExtractDir -and (Test-Path $tempExtractDir)) {
        Remove-Item -LiteralPath $tempExtractDir -Recurse -Force
    }
}

try {
    # A partir de este punto todos los comandos se ejecutan dentro de la carpeta
    # instalada para que npm, Prisma y Electron usen los archivos correctos.
    Set-Location $targetFolder

    Write-ConsoleStep "Configurando proyecto"

    # .env se crea solo si no existe. Esto preserva credenciales o rutas locales
    # cuando el usuario reinstala sobre una copia previa restaurada.
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env" -Force
        Write-Log ".env created from .env.example"
    }
    else {
        Write-Log ".env already exists and was preserved."
    }

    # El instalador arranca la aplicacion en modo desarrollo porque este proyecto
    # todavia no se distribuye como instalador empaquetado .exe.
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
