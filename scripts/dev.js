const http = require('http')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

const projectRoot = path.join(__dirname, '..')
const serverEntry = path.join(projectRoot, 'index.js')
const PORT = Number(process.env.PORT || 3000)

function parseListeningPid(output, port) {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const columns = line.split(/\s+/)

    if (columns.length < 5) {
      continue
    }

    const localAddress = columns[1]
    const state = columns[3]
    const processId = columns[4]

    if (
      localAddress.endsWith(`:${port}`) &&
      state.toUpperCase() === 'LISTENING' &&
      /^\d+$/.test(processId)
    ) {
      return Number(processId)
    }
  }

  return null
}

function getListeningPid(port) {
  try {
    const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    return parseListeningPid(output, port)
  } catch (error) {
    const fallbackOutput = typeof error.stdout === 'string' && error.stdout ? error.stdout : ''

    return parseListeningPid(fallbackOutput, port)
  }
}

function requestHealth(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/health',
        timeout: 2000,
      },
      (response) => {
        let body = ''

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })

        response.on('end', () => {
          if (response.statusCode !== 200) {
            resolve(false)
            return
          }

          try {
            const payload = JSON.parse(body)
            resolve(payload && payload.status === 'ok')
          } catch (error) {
            resolve(false)
          }
        })
      }
    )

    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })

    request.on('error', () => {
      resolve(false)
    })
  })
}

function stopProcess(processId) {
  execFileSync('taskkill.exe', ['/PID', String(processId), '/F', '/T'], {
    stdio: ['ignore', 'ignore', 'ignore'],
  })
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function startBackendProcess() {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })

  child.on('error', (error) => {
    console.error('Unable to start backend process:', error.message)
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code ?? 0)
  })
}

async function main() {
  const existingProcessId = getListeningPid(PORT)

  if (existingProcessId) {
    const backendRunning = await requestHealth(PORT)

    if (!backendRunning) {
      console.error(
        `Port ${PORT} is already used by another process (PID ${existingProcessId}). Stop it or change PORT in .env.`
      )
      process.exit(1)
    }

    console.log(`Backend already running on port ${PORT} with PID ${existingProcessId}. Restarting it...`)
    stopProcess(existingProcessId)
    await delay(1200)
  }

  startBackendProcess()
}

main().catch((error) => {
  console.error('Unable to prepare dev server:', error.message)
  process.exit(1)
})
