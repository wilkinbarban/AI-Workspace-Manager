#!/usr/bin/env node

import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { downloadArtifact } from '@electron/get'
import extract from 'extract-zip'

// createRequire permite leer package.json de electron desde un modulo ESM.
const require = createRequire(import.meta.url)
/** Ruta al package.json de electron instalado en node_modules. */
const electronPackagePath = require.resolve('electron/package.json')
/** Carpeta raiz del paquete electron donde viven install.js, path.txt y dist. */
const electronDir = path.dirname(electronPackagePath)
/** Metadata del paquete electron usada para conocer version esperada. */
const electronPackage = require(electronPackagePath)
/** Version de Electron que debe coincidir con dist/version. */
const version = electronPackage.version
/** Plataforma objetivo respetando overrides de npm/electron. */
const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || os.platform()
/** Arquitectura objetivo respetando overrides de npm/electron. */
const arch = process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch
/** Directorio donde Electron espera encontrar el binario extraido. */
const distDir = path.join(electronDir, 'dist')
/** Ruta relativa del ejecutable esperada por electron-vite. */
const platformPath = getPlatformPath(platform)
/** Archivo que electron-vite lee para localizar el ejecutable. */
const pathTxt = path.join(electronDir, 'path.txt')

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})

/** Flujo principal: valida Electron, intenta instalador oficial y reconstruye desde artifact si falla. */
async function main() {
  if (shouldSkipElectronRepair()) {
    console.log('Modo web headless en Linux detectado. Se omite la reparacion de Electron.')
    return
  }

  if (isElectronInstallValid()) {
    console.log(`Electron ${version} ya esta instalado correctamente.`)
    return
  }

  console.log('La instalacion de Electron esta incompleta. Ejecutando instalador oficial...')
  const installResult = childProcess.spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
    stdio: 'inherit',
    env: process.env
  })

  if (installResult.status === 0 && isElectronInstallValid()) {
    console.log('Electron fue reparado con el instalador oficial.')
    return
  }

  console.log('El instalador oficial no dejo una instalacion completa. Reconstruyendo desde artifact...')
  await rebuildFromArtifact()

  if (!isElectronInstallValid()) {
    throw new Error(`La reparacion de Electron termino, pero ${platformPath}/path.txt/version siguen ausentes o invalidos.`)
  }

  console.log('Electron reparado correctamente.')
}

/** Linux usa el servidor web headless por defecto; Electron solo se repara si se habilita explicitamente. */
function shouldSkipElectronRepair() {
  if (process.env.AIWM_SKIP_ELECTRON_REPAIR === '1') {
    return true
  }

  return os.platform() === 'linux' && process.env.AIWM_ENABLE_ELECTRON_ON_LINUX !== '1'
}

/** Comprueba version, path.txt y ejecutable para detectar instalaciones incompletas. */
function isElectronInstallValid() {
  try {
    const expectedExecutable = path.join(distDir, platformPath)
    const installedVersion = fs.readFileSync(path.join(distDir, 'version'), 'utf8').trim().replace(/^v/, '')
    const installedPath = fs.readFileSync(pathTxt, 'utf8').trim()

    return installedVersion === version && installedPath === platformPath && fs.existsSync(expectedExecutable)
  } catch {
    return false
  }
}

/** Descarga el artifact oficial de Electron y reconstruye dist/path.txt manualmente. */
async function rebuildFromArtifact() {
  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    force: true,
    cacheRoot: process.env.electron_config_cache,
    checksums:
      process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
        ? undefined
        : require(path.join(electronDir, 'checksums.json')),
    platform,
    arch
  })

  await extractElectronZip(zipPath, distDir)

  const extractedTypes = path.join(distDir, 'electron.d.ts')
  if (fs.existsSync(extractedTypes)) {
    fs.renameSync(extractedTypes, path.join(electronDir, 'electron.d.ts'))
  }

  fs.writeFileSync(pathTxt, platformPath, 'utf8')
}

/** Extrae el zip de Electron; usa PowerShell en Windows para evitar problemas nativos. */
async function extractElectronZip(zipPath, destination) {
  if (process.platform === 'win32') {
    const extractScript = path.join(os.tmpdir(), `ai-workspace-electron-extract-${process.pid}.ps1`)
    fs.writeFileSync(
      extractScript,
      [
        'param(',
        '  [Parameter(Mandatory = $true)][string]$ZipPath,',
        '  [Parameter(Mandatory = $true)][string]$Destination',
        ')',
        'Expand-Archive -LiteralPath $ZipPath -DestinationPath $Destination -Force'
      ].join('\n'),
      'utf8'
    )

    const result = childProcess.spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        extractScript,
        zipPath,
        destination
      ],
      { stdio: 'inherit' }
    )

    fs.rmSync(extractScript, { force: true })

    if (result.status !== 0) {
      throw new Error(`PowerShell Expand-Archive fallo con codigo de salida ${result.status}.`)
    }

    return
  }

  await extract(zipPath, { dir: destination })
}

/** Devuelve el ejecutable esperado por plataforma segun convencion del paquete electron. */
function getPlatformPath(currentPlatform) {
  switch (currentPlatform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Los builds de Electron no estan disponibles para la plataforma: ${currentPlatform}`)
  }
}
