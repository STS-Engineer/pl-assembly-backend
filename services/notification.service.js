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

function normalizePositiveInteger(value) {
  const parsedValue = Number.parseInt(String(value ?? '').trim(), 10)

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null
  }

  return parsedValue
}

function normalizeRecipientReferences(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeRecipientReferences(entry))
  }

  if (!value) {
    return []
  }

  if (typeof value === 'object') {
    const userId = normalizePositiveInteger(value.user_id ?? value.userId ?? value.id)
    const recipientEmails = normalizeRecipients(
      value.email ?? value.recipient_email ?? value.recipientEmail ?? value.to,
    )

    if (userId && recipientEmails.length > 0) {
      return recipientEmails.map((email) => ({
        user_id: userId,
        email,
      }))
    }

    if (userId) {
      return [
        {
          user_id: userId,
          email: null,
        },
      ]
    }

    return recipientEmails.map((email) => ({
      user_id: null,
      email,
    }))
  }

  return normalizeRecipients(value).map((email) => ({
    user_id: null,
    email,
  }))
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
  const recipientReferences = normalizeRecipientReferences(recipients).filter(
    (recipientReference, index, references) =>
      references.findIndex(
        (candidateReference) =>
          candidateReference.user_id === recipientReference.user_id &&
          candidateReference.email === recipientReference.email,
      ) === index,
  )
  const title = normalizeText(payload.title)
  const message = normalizeText(payload.message)

  if (recipientReferences.length === 0 || !title || !message) {
    return {
      created_count: 0,
      skipped_count: recipientReferences.length,
    }
  }

  const userIds = Array.from(
    new Set(
      recipientReferences
        .map((recipientReference) => recipientReference.user_id)
        .filter((userId) => Number.isInteger(userId) && userId > 0),
    ),
  )
  const recipientEmails = Array.from(
    new Set(
      recipientReferences
        .map((recipientReference) => recipientReference.email)
        .filter(Boolean),
    ),
  )
  const userLookupConditions = []

  if (userIds.length > 0) {
    userLookupConditions.push({
      id: {
        [Op.in]: userIds,
      },
    })
  }

  if (recipientEmails.length > 0) {
    userLookupConditions.push({
      email: {
        [Op.in]: recipientEmails,
      },
    })
  }

  if (userLookupConditions.length === 0) {
    return {
      created_count: 0,
      skipped_count: recipientReferences.length,
    }
  }

  const users = await User.findAll({
    where: {
      [Op.or]: userLookupConditions,
    },
    attributes: ['id', 'email'],
  })

  const userIdsLookup = users.reduce((lookup, user) => {
    lookup.set(user.id, user.id)
    return lookup
  }, new Map())
  const userIdsByEmail = users.reduce((lookup, user) => {
    lookup.set(String(user.email || '').trim().toLowerCase(), user.id)
    return lookup
  }, new Map())

  const notificationsToCreate = recipientReferences
    .map((recipientReference) => {
      const userId =
        (recipientReference.user_id ? userIdsLookup.get(recipientReference.user_id) : null) ||
        (recipientReference.email ? userIdsByEmail.get(recipientReference.email) : null)

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
    .filter(
      (notificationToCreate, index, notifications) =>
        notifications.findIndex(
          (candidateNotification) => candidateNotification.user_id === notificationToCreate.user_id,
        ) === index,
    )

  if (notificationsToCreate.length === 0) {
    return {
      created_count: 0,
      skipped_count: recipientReferences.length,
    }
  }

  await Notification.bulkCreate(notificationsToCreate)

  return {
    created_count: notificationsToCreate.length,
    skipped_count: recipientReferences.length - notificationsToCreate.length,
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
