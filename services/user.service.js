const crypto = require('crypto')
const User = require('../models/user.model')
const emailService = require('../emails/email.service')

const DEFAULT_TOKEN_DURATION_SECONDS = 60 * 60 * 24
const DEFAULT_RESET_TOKEN_DURATION_SECONDS = 60 * 60

function parseDurationToSeconds(value) {
  if (!value) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const normalizedValue = String(value).trim().toLowerCase()

  if (/^\d+$/.test(normalizedValue)) {
    return Number(normalizedValue)
  }

  const match = normalizedValue.match(/^(\d+)([smhd])$/)

  if (!match) {
    return null
  }

  const amount = Number(match[1])
  const unit = match[2]
  const unitToSeconds = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  }

  return amount * unitToSeconds[unit]
}

const TOKEN_DURATION_SECONDS =
  parseDurationToSeconds(process.env.AUTH_TOKEN_TTL) ||
  parseDurationToSeconds(process.env.JWT_EXPIRES_IN) ||
  DEFAULT_TOKEN_DURATION_SECONDS

const RESET_TOKEN_DURATION_SECONDS =
  parseDurationToSeconds(process.env.RESET_TOKEN_TTL) ||
  DEFAULT_RESET_TOKEN_DURATION_SECONDS

const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.JWT_SECRET ||
  'change-me-in-production'

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

function signToken(payload, expiresInSeconds) {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }
  const tokenPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }
  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(tokenPayload)
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

function verifySignedToken(token) {
  if (typeof token !== 'string' || !token) {
    throw createHttpError(400, 'Token invalide.')
  }

  const parts = token.split('.')

  if (parts.length !== 3) {
    throw createHttpError(400, 'Token invalide.')
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts
  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  const providedSignatureBuffer = Buffer.from(providedSignature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    throw createHttpError(400, 'Token invalide.')
  }

  const header = base64UrlDecode(encodedHeader)
  const payload = base64UrlDecode(encodedPayload)

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw createHttpError(400, 'Token invalide.')
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw createHttpError(400, 'Token expire.')
  }

  return payload
}

function buildPasswordFingerprint(user) {
  return crypto.createHash('sha256').update(String(user.password || '')).digest('hex')
}

function createAccessToken(user) {
  return signToken(
    {
      type: 'access',
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    TOKEN_DURATION_SECONDS
  )
}

function createPasswordResetToken(user) {
  return signToken(
    {
      type: 'reset-password',
      sub: user.id,
      email: user.email,
      fingerprint: buildPasswordFingerprint(user),
    },
    RESET_TOKEN_DURATION_SECONDS
  )
}

function createApprovalToken(user) {
  return signToken(
    {
      type: 'approve-account',
      sub: user.id,
      email: user.email,
    },
    TOKEN_DURATION_SECONDS
  )
}

function buildAuthResponse(message, user) {
  return {
    message,
    user,
    accessToken: createAccessToken(user),
    expiresIn: TOKEN_DURATION_SECONDS,
  }
}

async function signUp(payload) {
  const user = await User.signUp(payload)
  const approvalToken = createApprovalToken(user)
  const approvedAdmins = await User.findApprovedAdmins()
  const adminEmails = approvedAdmins.map((admin) => admin.email)
  const notificationRecipients = emailService.resolveAdminRecipients(adminEmails)
  let adminNotificationSent = true

  try {
    await emailService.sendAdminApprovalRequest(
      {
        ...user,
        adminEmails: notificationRecipients,
      },
      approvalToken
    )
  } catch (error) {
    adminNotificationSent = false
    console.error('Unable to send admin approval email:', error.message)
  }

  return {
    message: 'Compte cree avec succes. Votre compte est en attente d approbation par un administrateur.',
    user,
    requiresApproval: true,
    accessToken: null,
    expiresIn: null,
    adminNotificationSent,
    notifiedAdmins: notificationRecipients,
  }
}

async function signIn(payload) {
  const user = await User.signIn(payload)
  return buildAuthResponse('Connexion reussie.', user)
}

async function approveUserAccount(token) {
  const payload = verifySignedToken(token)

  if (payload.type !== 'approve-account') {
    throw createHttpError(400, 'Token d approbation invalide.')
  }

  const user = await User.findById(payload.sub)

  if (!user) {
    throw createHttpError(404, 'Utilisateur introuvable.')
  }

  if (user.email !== payload.email) {
    throw createHttpError(400, 'Token d approbation invalide.')
  }

  if (user.approval_status === 'approved') {
    return {
      message: 'Ce compte est deja approuve.',
      user: User.sanitizeUser(user),
      userNotificationSent: false,
      alreadyApproved: true,
    }
  }

  const approvedUser = await User.approveById(user.id)
  let userNotificationSent = true

  try {
    await emailService.sendUserApprovalConfirmation(approvedUser)
  } catch (error) {
    userNotificationSent = false
    console.error('Unable to send user approval email:', error.message)
  }

  return {
    message: 'Compte approuve avec succes.',
    user: approvedUser,
    userNotificationSent,
    alreadyApproved: false,
  }
}

async function getAllUsers() {
  return User.findAllUsers()
}

async function getUserById(id) {
  const user = await User.findById(id)

  if (!user) {
    throw createHttpError(404, 'Utilisateur introuvable.')
  }

  return User.sanitizeUser(user)
}

async function changePassword(id, payload) {
  const { currentPassword, oldPassword, password, newPassword } = payload || {}

  if (typeof currentPassword !== 'string' && typeof oldPassword !== 'string') {
    throw createHttpError(400, 'Le mot de passe actuel est obligatoire.')
  }

  User.validatePasswordValue(newPassword || password, 'newPassword')

  const user = await User.findById(id)

  if (!user) {
    throw createHttpError(404, 'Utilisateur introuvable.')
  }

  const currentPasswordValue = currentPassword || oldPassword

  if (!User.verifyPassword(currentPasswordValue, user.password)) {
    throw createHttpError(401, 'Mot de passe actuel invalide.')
  }

  return User.updatePasswordById(user.id, newPassword || password)
}

async function forgotPassword(payload) {
  const email = String(payload?.email || '').trim().toLowerCase()

  if (!email) {
    throw createHttpError(400, 'L email est obligatoire.')
  }

  const user = await User.findByEmail(email)

  if (!user) {
    return {
      message: 'If an account exists with this email, a password reset email has been sent.',
    }
  }

  const resetToken = createPasswordResetToken(user)
  const resetUrl = emailService.getPasswordResetUrl(resetToken)

  try {
    await emailService.sendUserPasswordResetEmail(user, resetToken)
  } catch (error) {
    console.error('Unable to send password reset email:', error.message)
    throw createHttpError(
      503,
      'Unable to send the password reset email right now. Please try again later.',
    )
  }

  const frontendUrl = String(process.env.FRONTEND_URL || '').toLowerCase()
  const shouldExposeResetToken =
    frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1')

  return {
    message: 'If an account exists with this email, a password reset email has been sent.',
    resetToken: shouldExposeResetToken ? resetToken : undefined,
    expiresIn: RESET_TOKEN_DURATION_SECONDS,
    resetPath: `/reset-password/${encodeURIComponent(resetToken)}`,
    resetUrl,
  }
}

async function verifyResetPasswordToken(token) {
  const payload = verifySignedToken(token)

  if (payload.type !== 'reset-password') {
    throw createHttpError(400, 'Token de reinitialisation invalide.')
  }

  const user = await User.findById(payload.sub)

  if (!user) {
    throw createHttpError(404, 'Utilisateur introuvable.')
  }

  if (payload.fingerprint !== buildPasswordFingerprint(user)) {
    throw createHttpError(400, 'Token de reinitialisation invalide ou deja utilise.')
  }

  return {
    message: 'Token valide.',
    user: User.sanitizeUser(user),
  }
}

async function resetPasswordWithToken(token, payload) {
  const validatedToken = await verifyResetPasswordToken(token)
  const newPassword = payload?.newPassword || payload?.password

  User.validatePasswordValue(newPassword, 'newPassword')

  const updatedUser = await User.updatePasswordById(validatedToken.user.id, newPassword)

  return {
    message: 'Mot de passe reinitialise avec succes.',
    user: updatedUser,
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
