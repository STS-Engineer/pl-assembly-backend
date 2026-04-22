const crypto = require('crypto')
const { DataTypes, Op } = require('sequelize')
const sequelize = require('../config/sequelize')

const PASSWORD_ITERATIONS = 310000
const PASSWORD_KEY_LENGTH = 32
const PASSWORD_DIGEST = 'sha256'
const PBKDF2_PREFIX = 'pbkdf2'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function normalizeFullName(fullName) {
  return String(fullName || '').trim()
}

function getPayloadFullName(payload = {}) {
  return payload.full_name ?? payload.fullName
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString('hex')

  return `${PBKDF2_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${hash}`
}

function isHashedPassword(password) {
  return typeof password === 'string' && password.startsWith(`${PBKDF2_PREFIX}$`)
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword) {
    return false
  }

  if (!isHashedPassword(storedPassword)) {
    return password === storedPassword
  }

  const [prefix, iterationValue, salt, storedHash] = storedPassword.split('$')

  if (!prefix || !iterationValue || !salt || !storedHash) {
    return false
  }

  const iterations = Number(iterationValue)
  const storedHashBuffer = Buffer.from(storedHash, 'hex')
  const computedHashBuffer = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    storedHashBuffer.length,
    PASSWORD_DIGEST
  )

  if (storedHashBuffer.length !== computedHashBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(storedHashBuffer, computedHashBuffer)
}

async function hashPasswordHook(user) {
  if (user.password && user.changed('password') && !isHashedPassword(user.password)) {
    user.password = hashPassword(user.password)
  }

  if (user.email) {
    user.email = normalizeEmail(user.email)
  }

  if (user.full_name) {
    user.full_name = normalizeFullName(user.full_name)
  }
}

function sanitizeUser(user) {
  if (!user) {
    return null
  }

  const plainUser = typeof user.get === 'function' ? user.get({ plain: true }) : user
  const { password, ...safeUser } = plainUser
  return safeUser
}

function validateSignUpPayload(payload) {
  if (!normalizeFullName(getPayloadFullName(payload))) {
    throw createHttpError(400, 'Le nom complet est obligatoire.')
  }

  if (!normalizeEmail(payload.email) || !EMAIL_REGEX.test(normalizeEmail(payload.email))) {
    throw createHttpError(400, 'Une adresse email valide est obligatoire.')
  }

  if (typeof payload.password !== 'string' || payload.password.trim().length < 6) {
    throw createHttpError(400, 'Le mot de passe doit contenir au moins 6 caracteres.')
  }
}

function validateSignInPayload({ email, password }) {
  if (!normalizeEmail(email) || typeof password !== 'string' || !password) {
    throw createHttpError(400, 'Email et mot de passe sont obligatoires.')
  }
}

function validatePasswordValue(password, fieldName = 'password') {
  if (typeof password !== 'string' || password.trim().length < 6) {
    throw createHttpError(400, `Le champ ${fieldName} doit contenir au moins 6 caracteres.`)
  }
}

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    full_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
      set(value) {
        this.setDataValue('email', normalizeEmail(value))
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'user',
    },
    approval_status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'pending',
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    approvable_sub_elements: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    pilot_sub_elements: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
  },
  {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: hashPasswordHook,
      beforeUpdate: hashPasswordHook,
    },
  }
)

User.createHttpError = createHttpError
User.sanitizeUser = sanitizeUser

User.findByEmail = async function findByEmail(email) {
  return User.findOne({
    where: {
      email: normalizeEmail(email),
    },
  })
}

User.findById = async function findById(id) {
  const numericId = Number(id)

  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw createHttpError(400, 'Identifiant utilisateur invalide.')
  }

  return User.findByPk(numericId)
}

User.findAllUsers = async function findAllUsers() {
  const users = await User.findAll({
    attributes: {
      exclude: ['password'],
    },
    order: [['id', 'DESC']],
  })

  return users.map((user) => sanitizeUser(user))
}

User.findApprovedAdmins = async function findApprovedAdmins() {
  return User.findAll({
    where: {
      role: 'admin',
      approval_status: 'approved',
    },
    attributes: {
      exclude: ['password'],
    },
    order: [['id', 'ASC']],
  })
}

User.signUp = async function signUp(payload) {
  validateSignUpPayload(payload)

  const email = normalizeEmail(payload.email)
  const existingUser = await User.findByEmail(email)

  if (existingUser) {
    throw createHttpError(409, 'Un compte existe deja avec cet email.')
  }

  try {
    const user = await User.create({
      full_name: normalizeFullName(getPayloadFullName(payload)),
      email,
      password: payload.password,
      role: 'user',
      approval_status: 'pending',
      approved_at: null,
    })

    return sanitizeUser(user)
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw createHttpError(409, 'Un compte existe deja avec cet email.')
    }

    throw error
  }
}

User.signIn = async function signIn(payload) {
  validateSignInPayload(payload)

  const user = await User.findByEmail(payload.email)

  if (!user || !verifyPassword(payload.password, user.password)) {
    throw createHttpError(401, 'Email ou mot de passe invalide.')
  }

  if (!isHashedPassword(user.password)) {
    user.password = payload.password
    await user.save()
  }

  if (user.approval_status !== 'approved') {
    throw createHttpError(403, 'Votre compte est en attente d approbation par un administrateur.')
  }

  return sanitizeUser(user)
}

User.updatePasswordById = async function updatePasswordById(id, password) {
  validatePasswordValue(password, 'password')

  const user = await User.findById(id)

  if (!user) {
    throw createHttpError(404, 'Utilisateur introuvable.')
  }

  user.password = password
  await user.save()

  return sanitizeUser(user)
}

User.approveById = async function approveById(id) {
  const user = await User.findById(id)

  if (!user) {
    throw createHttpError(404, 'Utilisateur introuvable.')
  }

  if (user.approval_status === 'approved') {
    return sanitizeUser(user)
  }

  user.approval_status = 'approved'
  user.approved_at = new Date()
  await user.save()

  return sanitizeUser(user)
}

User.ensureApprovalState = async function ensureApprovalState() {
  const usersWithMissingApproval = await User.findAll({
    where: {
      approval_status: {
        [Op.is]: null,
      },
    },
  })

  for (const user of usersWithMissingApproval) {
    user.approval_status = 'approved'
    if (!user.approved_at) {
      user.approved_at = user.updated_at || user.created_at || new Date()
    }
    await user.save()
  }

  const adminUsers = await User.findAll({
    where: {
      role: 'admin',
    },
  })

  for (const user of adminUsers) {
    let shouldSave = false

    if (user.approval_status !== 'approved') {
      user.approval_status = 'approved'
      shouldSave = true
    }

    if (!user.approved_at) {
      user.approved_at = user.updated_at || user.created_at || new Date()
      shouldSave = true
    }

    if (shouldSave) {
      await user.save()
    }
  }
}

User.validatePasswordValue = validatePasswordValue
User.verifyPassword = verifyPassword

module.exports = User
