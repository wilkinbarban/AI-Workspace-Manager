#!/usr/bin/env node

import childProcess from 'node:child_process'

const backendPort = process.env.BACKEND_PORT || '3000'
const frontendPort = process.env.FRONTEND_PORT || '5173'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const processes = []

start('backend', ['run', 'web:server'], {
  ...process.env,
  PORT: backendPort,
  HOST: '127.0.0.1'
})

start('frontend', ['run', 'web:dev', '--', '--host', '0.0.0.0', '--port', frontendPort], process.env)

console.log('')
console.log('AI Workspace Manager web mode')
console.log(`Frontend: http://localhost:${frontendPort}`)
console.log(`Backend:  http://localhost:${backendPort}`)
console.log('Open the frontend URL in your browser. The backend port is only for API/WebSocket.')
console.log('')

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function start(name, args, env) {
  const child = childProcess.spawn(npmCommand, args, {
    env,
    stdio: 'inherit',
    shell: false
  })

  child.on('exit', (code) => {
    if (process.exitCode === undefined) {
      process.exitCode = code ?? 0
      shutdown()
    }
  })

  processes.push(child)
}

function shutdown() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill()
    }
  }
}
