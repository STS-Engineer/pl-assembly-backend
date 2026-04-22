const { Op } = require('sequelize')
const Notification = require('../models/notification.model')
const User = require('../models/user.model')

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeRecipients(entry))
  }

  if (!value) {
    return []
  }

  return String(value)
    .split(/[;,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeLimit(value, fallback = 20) {
  const parsedValue = Number.parseInt(String(value ?? ''), 10)

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback
  }

  return Math.min(parsedValue, 100)
}

function serializeNotification(notification) {
  const rawNotification =
    notification && typeof notification.toJSON === 'function'
      ? notification.toJSON()
      : notification || {}

  return {
    id: rawNotification.id,
    user_id: rawNotification.user_id,
    type: rawNotification.type,
    subject: rawNotification.subject || '',
    title: rawNotification.title || '',
    message: rawNotification.message || '',
    body: rawNotification.body || '',
    action_label: rawNotification.action_label || '',
    action_url: rawNotification.action_url || '',
    metadata:
      rawNotification.metadata && typeof rawNotification.metadata === 'object'
        ? rawNotification.metadata
        : {},
    read: Boolean(rawNotification.is_read ?? rawNotification.isRead),
    read_at: rawNotification.read_at || rawNotification.readAt || null,
    created_at: rawNotification.created_at || rawNotification.createdAt || null,
    updated_at: rawNotification.updated_at || rawNotification.updatedAt || null,
  }
}

async function createNotificationsForRecipients(recipients, payload = {}) {
  const normalizedRecipients = Array.from(new Set(normalizeRecipients(recipients)))
  const title = normalizeText(payload.title)
  const message = normalizeText(payload.message)

  if (normalizedRecipients.length === 0 || !title || !message) {
    return {
      created_count: 0,
      skipped_count: normalizedRecipients.length,
    }
  }

  const users = await User.findAll({
    where: {
      email: {
        [Op.in]: normalizedRecipients,
      },
    },
    attributes: ['id', 'email'],
  })

  const userIdsByEmail = users.reduce((lookup, user) => {
    lookup.set(String(user.email || '').trim().toLowerCase(), user.id)
    return lookup
  }, new Map())

  const notificationsToCreate = normalizedRecipients
    .map((recipientEmail) => {
      const userId = userIdsByEmail.get(recipientEmail)

      if (!userId) {
        return null
      }

      return {
        user_id: userId,
        type: normalizeText(payload.type) || 'email',
        subject: normalizeText(payload.subject) || null,
        title,
        message,
        body: normalizeText(payload.body) || null,
        action_label: normalizeText(payload.action_label) || null,
        action_url: normalizeText(payload.action_url) || null,
        metadata:
          payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
      }
    })
    .filter(Boolean)

  if (notificationsToCreate.length === 0) {
    return {
      created_count: 0,
      skipped_count: normalizedRecipients.length,
    }
  }

  await Notification.bulkCreate(notificationsToCreate)

  return {
    created_count: notificationsToCreate.length,
    skipped_count: normalizedRecipients.length - notificationsToCreate.length,
  }
}

async function getNotificationsByUserId(userId, query = {}) {
  const normalizedUserId = Number.parseInt(String(userId ?? ''), 10)

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw createHttpError(400, 'Invalid user identifier.')
  }

  const limit = normalizeLimit(query.limit, 20)
  const notifications = await Notification.findAll({
    where: {
      user_id: normalizedUserId,
    },
    order: [
      ['is_read', 'ASC'],
      ['created_at', 'DESC'],
    ],
    limit,
  })

  const unreadCount = await Notification.count({
    where: {
      user_id: normalizedUserId,
      is_read: false,
    },
  })

  return {
    items: notifications.map((notification) => serializeNotification(notification)),
    unread_count: unreadCount,
  }
}

async function markAllNotificationsAsRead(userId) {
  const normalizedUserId = Number.parseInt(String(userId ?? ''), 10)

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw createHttpError(400, 'Invalid user identifier.')
  }

  const readAt = new Date()
  const [updatedCount] = await Notification.update(
    {
      is_read: true,
      read_at: readAt,
    },
    {
      where: {
        user_id: normalizedUserId,
        is_read: false,
      },
    },
  )

  return {
    message: 'Notifications marked as read.',
    updated_count: updatedCount,
  }
}

module.exports = {
  createNotificationsForRecipients,
  getNotificationsByUserId,
  markAllNotificationsAsRead,
}
