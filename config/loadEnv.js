const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env')

function normalizeEnvValue(value) {
  const trimmedValue = value.trim()

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1)
  }

  return trimmedValue
}

function loadEnvFile() {
  if (!fs.existsSync(envPath)) {
    return
  }

  const fileContent = fs.readFileSync(envPath, 'utf8')

  for (const line of fileContent.split(/\r?\n/)) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1)

    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue
    }

    process.env[key] = normalizeEnvValue(rawValue)
  }
}

loadEnvFile()
