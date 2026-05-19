#!/usr/bin/env node

import childProcess from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { downloadArtifact } from '@electron/get'
import extract from 'extract-zip'

const require = createRequire(import.meta.url)
const electronPackagePath = require.resolve('electron/package.json')
const electronDir = path.dirname(electronPackagePath)
const electronPackage = require(electronPackagePath)
const version = electronPackage.version
const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || os.platform()
const arch = process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || process.arch
const distDir = path.join(electronDir, 'dist')
const platformPath = getPlatformPath(platform)
const pathTxt = path.join(electronDir, 'path.txt')

main().catch((error) => {
  console.error(error?.stack || error)
  process.exit(1)
})

async function main() {
  if (isElectronInstallValid()) {
    console.log(`Electron ${version} is already installed.`)
    return
  }

  console.log('Electron install is incomplete. Running official installer...')
  const installResult = childProcess.spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
    stdio: 'inherit',
    env: process.env
  })

  if (installResult.status === 0 && isElectronInstallValid()) {
    console.log('Electron repaired with official installer.')
    return
  }

  console.log('Official installer did not produce a complete Electron install. Rebuilding from artifact...')
  await rebuildFromArtifact()

  if (!isElectronInstallValid()) {
    throw new Error('Electron repair finished, but electron.exe/path.txt/version are still missing or invalid.')
  }

  console.log('Electron repaired successfully.')
}

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

async function extractElectronZip(zipPath, destination) {
  if (process.platform === 'win32') {
    const result = childProcess.spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
        zipPath,
        destination
      ],
      { stdio: 'inherit' }
    )

    if (result.status !== 0) {
      throw new Error(`PowerShell Expand-Archive failed with exit code ${result.status}.`)
    }

    return
  }

  await extract(zipPath, { dir: destination })
}

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
      throw new Error(`Electron builds are not available on platform: ${currentPlatform}`)
  }
}
