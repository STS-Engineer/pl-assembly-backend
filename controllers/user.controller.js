const fs = require('fs')
const path = require('path')
const userService = require('../services/user.service')

const brandLogoPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'img', 'logo.PNG')
let cachedBrandLogoDataUri = null

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function getSignInUrl() {
  if (!process.env.FRONTEND_URL) {
    return ''
  }

  return `${normalizeBaseUrl(process.env.FRONTEND_URL)}/`
}

function getBrandLogoDataUri() {
  if (cachedBrandLogoDataUri !== null) {
    return cachedBrandLogoDataUri
  }

  if (!fs.existsSync(brandLogoPath)) {
    cachedBrandLogoDataUri = ''
    return cachedBrandLogoDataUri
  }

  const extension = path.extname(brandLogoPath).toLowerCase()
  const mimeType = extension === '.png' ? 'image/png' : 'application/octet-stream'
  const fileBuffer = fs.readFileSync(brandLogoPath)

  cachedBrandLogoDataUri = `data:${mimeType};base64,${fileBuffer.toString('base64')}`
  return cachedBrandLogoDataUri
}

function renderBrandMark() {
  const logoDataUri = getBrandLogoDataUri()

  if (!logoDataUri) {
    return `
      <div class="brand-mark">
        <div class="brand-mark__badge brand-mark__badge--fallback">PL</div>
        <div class="brand-mark__copy">
          <span class="brand-mark__title">PL Assembly</span>
          <span class="brand-mark__subtitle">Workflow access & validations</span>
        </div>
      </div>
    `
  }

  return `
    <div class="brand-mark">
      <div class="brand-mark__badge">
        <img src="${logoDataUri}" alt="AVO Carbon Group" />
      </div>
      <div class="brand-mark__copy">
        <span class="brand-mark__title">PL Assembly</span>
        <span class="brand-mark__subtitle">Workflow access & validations</span>
      </div>
    </div>
  `
}

function renderInfoRows(infoRows = []) {
  const safeRows = infoRows.filter((row) => row && row.label && row.value)

  if (safeRows.length === 0) {
    return ''
  }

  const rowsHtml = safeRows
    .map(
      (row) => `
        <div class="approval-meta__row">
          <span class="approval-meta__label">${escapeHtml(row.label)}</span>
          <span class="approval-meta__value">${escapeHtml(row.value)}</span>
        </div>
      `
    )
    .join('')

  return `<div class="approval-meta">${rowsHtml}</div>`
}

function sendApprovalHtml(res, options) {
  const {
    statusCode,
    title,
    message,
    eyebrow,
    variant = 'success',
    actionLabel = '',
    actionUrl = '',
    infoRows = [],
  } = options

  const isSuccess = variant === 'success'
  const panelClassName = isSuccess ? 'approval-panel approval-panel--success' : 'approval-panel approval-panel--error'
  const chipClassName = isSuccess ? 'approval-chip approval-chip--success' : 'approval-chip approval-chip--error'
  const actionHtml =
    actionLabel && actionUrl
      ? `
        <div class="approval-actions">
          <a class="approval-action" href="${escapeHtml(actionUrl)}">${escapeHtml(actionLabel)}</a>
        </div>
      `
      : ''

  res.status(statusCode).type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          :root {
            --navy-950: #081e2f;
            --navy-700: #0e4e78;
            --ink-950: #162231;
            --ink-700: #53697b;
            --orange-500: #ef7807;
            --orange-400: #ff9d3d;
            --surface-50: #fbf8f4;
            --surface-100: #f8f4ee;
            --surface-200: #f3ede5;
            --success-50: #eaf7ef;
            --success-700: #1d5d36;
            --error-50: #fce8e4;
            --error-700: #9c2f1c;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: 'Segoe UI', Calibri, 'Trebuchet MS', Arial, sans-serif;
            color: var(--ink-950);
            background:
              radial-gradient(circle at top left, rgba(4, 110, 175, 0.08), transparent 26%),
              radial-gradient(circle at bottom right, rgba(239, 120, 7, 0.1), transparent 24%),
              linear-gradient(180deg, var(--surface-100) 0%, var(--surface-200) 100%);
          }

          .approval-page {
            position: relative;
            min-height: 100vh;
            overflow: hidden;
          }

          .approval-accent {
            position: absolute;
            border-radius: 999px;
            filter: blur(18px);
            opacity: 0.55;
            pointer-events: none;
          }

          .approval-accent--blue {
            top: -120px;
            left: -80px;
            width: 260px;
            height: 260px;
            background: rgba(4, 110, 175, 0.18);
          }

          .approval-accent--orange {
            right: -80px;
            bottom: -40px;
            width: 260px;
            height: 260px;
            background: rgba(239, 120, 7, 0.18);
          }

          .approval-layout {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 28px 16px 36px;
          }

          .approval-shell {
            width: min(100%, 460px);
          }

          .approval-card {
            width: 100%;
            padding: 30px;
            border-radius: 28px;
            background: rgba(255, 255, 255, 0.96);
            border: 1px solid rgba(14, 78, 120, 0.08);
            box-shadow: 0 18px 44px rgba(8, 31, 49, 0.1);
          }

          .approval-card__header {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
            text-align: left;
          }

          .brand-mark {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 6px;
          }

          .brand-mark__badge {
            display: grid;
            place-items: center;
            width: 92px;
            min-width: 92px;
            padding: 8px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 16px 34px rgba(8, 31, 49, 0.12);
          }

          .brand-mark__badge img {
            display: block;
            width: 100%;
            height: auto;
          }

          .brand-mark__badge--fallback {
            font-family: 'Trebuchet MS', 'Segoe UI', Calibri, Arial, sans-serif;
            font-size: 1.35rem;
            font-weight: 700;
            color: var(--navy-950);
          }

          .brand-mark__copy {
            display: flex;
            flex-direction: column;
            gap: 2px;
            text-align: left;
          }

          .brand-mark__title {
            font-family: 'Trebuchet MS', 'Segoe UI', Calibri, Arial, sans-serif;
            font-size: 1.2rem;
            font-weight: 700;
            line-height: 1.1;
            color: var(--navy-950);
          }

          .brand-mark__subtitle {
            max-width: 260px;
            font-size: 0.92rem;
            line-height: 1.4;
            color: var(--ink-700);
          }

          .approval-chip {
            display: inline-flex;
            width: fit-content;
            padding: 8px 12px;
            border-radius: 999px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            font-size: 0.76rem;
            font-weight: 800;
          }

          .approval-chip--success {
            background: rgba(29, 93, 54, 0.1);
            color: var(--success-700);
          }

          .approval-chip--error {
            background: rgba(156, 47, 28, 0.1);
            color: var(--error-700);
          }

          .approval-card__header h1 {
            margin: 0;
            font-family: 'Trebuchet MS', 'Segoe UI', Calibri, Arial, sans-serif;
            font-size: 2.1rem;
            font-weight: 700;
            line-height: 1.12;
            letter-spacing: -0.03em;
            color: var(--navy-950);
          }

          .approval-card__header p,
          .approval-meta__value,
          .approval-footer {
            margin: 0;
            font-size: 1rem;
            line-height: 1.6;
            color: var(--ink-700);
          }

          .approval-panel {
            margin-top: 22px;
            padding: 18px;
            border-radius: 20px;
            border: 1px solid transparent;
          }

          .approval-panel--success {
            background: var(--success-50);
            border-color: rgba(29, 93, 54, 0.16);
            color: var(--success-700);
          }

          .approval-panel--error {
            background: var(--error-50);
            border-color: rgba(156, 47, 28, 0.14);
            color: var(--error-700);
          }

          .approval-panel p {
            margin: 0;
            font-size: 1rem;
            line-height: 1.6;
          }

          .approval-meta {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 18px;
            padding: 18px;
            border-radius: 20px;
            background: var(--surface-50);
            border: 1px solid rgba(14, 78, 120, 0.14);
          }

          .approval-meta__row {
            display: grid;
            grid-template-columns: 112px minmax(0, 1fr);
            gap: 12px;
          }

          .approval-meta__label {
            font-size: 0.95rem;
            font-weight: 700;
            color: #0a3452;
          }

          .approval-actions {
            display: flex;
            margin-top: 22px;
          }

          .approval-action {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 52px;
            padding: 0 24px;
            border-radius: 16px;
            background: linear-gradient(135deg, var(--orange-500), var(--orange-400));
            color: #ffffff;
            text-decoration: none;
            font-size: 1rem;
            font-weight: 700;
            box-shadow: 0 18px 40px rgba(239, 120, 7, 0.24);
          }

          .approval-footer {
            margin-top: 22px;
          }

          @media (max-width: 720px) {
            .approval-card {
              padding: 24px;
            }

            .approval-card__header h1 {
              font-size: 2rem;
            }

            .approval-meta__row {
              grid-template-columns: 1fr;
              gap: 4px;
            }
          }
        </style>
      </head>
      <body>
        <main class="approval-page">
          <div class="approval-accent approval-accent--blue"></div>
          <div class="approval-accent approval-accent--orange"></div>

          <section class="approval-layout">
            <div class="approval-shell">
              <div class="approval-card">
                <div class="approval-card__header">
                  ${renderBrandMark()}
                  <span class="${chipClassName}">${escapeHtml(eyebrow)}</span>
                  <h1>${escapeHtml(title)}</h1>
                  <p>Review the account status below and continue back to PL Assembly when you are ready.</p>
                </div>

                <div class="${panelClassName}">
                  <p>${escapeHtml(message)}</p>
                </div>

                ${renderInfoRows(infoRows)}
                ${actionHtml}

                <p class="approval-footer">
                  ${isSuccess ? 'The user can now access the platform after signing in.' : 'You can close this page and request a new approval link if needed.'}
                </p>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  `)
}

async function signUp(req, res) {
  try {
    const response = await userService.signUp(req.body || {})
    res.status(201).json(response)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function signIn(req, res) {
  try {
    const response = await userService.signIn(req.body || {})
    res.status(200).json(response)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function approveUserAccount(req, res) {
  try {
    const response = await userService.approveUserAccount(req.params.token)
    const acceptHeader = String(req.headers.accept || '')

    if (acceptHeader.includes('text/html')) {
      sendApprovalHtml(res, {
        statusCode: 200,
        title: response.alreadyApproved ? 'Account already approved' : 'Account approved',
        message: response.message,
        eyebrow: response.alreadyApproved ? 'Already approved' : 'Approval completed',
        variant: 'success',
        actionLabel: getSignInUrl() ? 'Go to sign in' : '',
        actionUrl: getSignInUrl(),
        infoRows: response.user
          ? [
              { label: 'Full name', value: response.user.full_name },
              { label: 'Email', value: response.user.email },
            ]
          : [],
      })
      return
    }

    res.status(200).json(response)
  } catch (error) {
    const acceptHeader = String(req.headers.accept || '')

    if (acceptHeader.includes('text/html')) {
      const statusCode = error.statusCode || 500
      const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message
      sendApprovalHtml(res, {
        statusCode,
        title: 'Approval failed',
        message,
        eyebrow: 'Approval error',
        variant: 'error',
        actionLabel: getSignInUrl() ? 'Back to sign in' : '',
        actionUrl: getSignInUrl(),
      })
      return
    }

    handleControllerError(res, error)
  }
}

async function getAllUsers(req, res) {
  try {
    const users = await userService.getAllUsers()
    res.status(200).json(users)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getUserById(req, res) {
  try {
    const user = await userService.getUserById(req.params.id)
    res.status(200).json(user)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function changePassword(req, res) {
  try {
    const response = await userService.changePassword(req.params.id, req.body || {})
    res.status(200).json({
      message: 'Mot de passe modifie avec succes.',
      user: response,
    })
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function forgotPassword(req, res) {
  try {
    const response = await userService.forgotPassword(req.body || {})
    res.status(200).json(response)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function verifyResetPasswordToken(req, res) {
  try {
    const response = await userService.verifyResetPasswordToken(req.params.token)
    res.status(200).json(response)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function resetPasswordWithToken(req, res) {
  try {
    const response = await userService.resetPasswordWithToken(req.params.token, req.body || {})
    res.status(200).json(response)
  } catch (error) {
    handleControllerError(res, error)
  }
}

module.exports = {
  approveUserAccount,
  changePassword,
  forgotPassword,
  getAllUsers,
  getUserById,
  signUp,
  signIn,
  verifyResetPasswordToken,
  resetPasswordWithToken,
}
