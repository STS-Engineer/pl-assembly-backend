const crypto = require('crypto')
const RfqCosting = require('../models/rfq-costing.model')
const RfqCostingInitialSubElement = require('../models/rfq-costing-initial-sub-element.model')
const SubElementConversationMessage = require('../models/sub-element-conversation-message.model')
const User = require('../models/user.model')
const notificationService = require('./notification.service')
const { getCostingDisplayData } = require('./rfq-display.service')

const MAX_MESSAGE_LENGTH = 2000
const MAX_ATTACHMENTS = 4
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_FILENAME_LENGTH = 180
const DATA_URL_REGEX = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i
const FRONTEND_DEFAULT_PORT = process.env.PORT || 3000

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getTrimmedText(value) {
  return String(value ?? '').trim()
}

function getLookupValue(value) {
  return getTrimmedText(value).toLowerCase()
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeBaseUrl(value) {
  return String(value || `http://localhost:${FRONTEND_DEFAULT_PORT}`).replace(/\/+$/, '')
}

function getWorkspaceCostingUrl() {
  return `${normalizeBaseUrl(process.env.FRONTEND_URL || process.env.BACKEND_URL)}/workspace/costing`
}

function buildNotificationSummary(parts = []) {
  return parts
    .map((part) => getTrimmedText(part))
    .filter(Boolean)
    .join(' | ')
}

function getIdentityLookupValues(source = {}) {
  return Array.from(
    new Set(
      [
        source?.id,
        source?.email,
        source?.full_name,
        source?.fullName,
        source?.name,
      ]
        .map((value) => getLookupValue(value))
        .filter(Boolean),
    ),
  )
}

function getEmailLocalPart(email) {
  const normalizedEmail = getTrimmedText(email).toLowerCase()

  if (!normalizedEmail.includes('@')) {
    return ''
  }

  return normalizedEmail.split('@')[0]
}

function sanitizeFileName(value) {
  const normalizedName = getTrimmedText(value)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')

  if (!normalizedName) {
    return 'attachment'
  }

  return normalizedName.slice(0, MAX_FILENAME_LENGTH)
}

function isAdminUser(user = {}) {
  return getLookupValue(user?.role) === 'admin'
}

function getTemplateByKey(key) {
  const normalizedKey = getTrimmedText(key)
  return RfqCostingInitialSubElement.TEMPLATES.find((template) => template.key === normalizedKey) || null
}

async function getInitialCosting(costingId) {
  console.log('[getInitialCosting] Validating costing...', { costingId })

  const normalizedCostingId = Number.parseInt(String(costingId || '').trim(), 10)

  if (!Number.isInteger(normalizedCostingId) || normalizedCostingId <= 0) {
    console.error('[getInitialCosting] Invalid costing ID:', { costingId, normalized: normalizedCostingId })
    throw createHttpError(400, 'Invalid costing identifier.')
  }

  const costing = await RfqCosting.findByPk(normalizedCostingId)

  if (!costing) {
    console.error('[getInitialCosting] Costing not found:', { costingId: normalizedCostingId })
    throw createHttpError(404, `RFQ Costing with ID ${normalizedCostingId} not found.`)
  }

  console.log('[getInitialCosting] Costing found:', {
    id: costing.id,
    type: costing.type,
    rfq_id: costing.rfq_id,
  })

  if (costing.type !== 'Initial Costing') {
    console.error('[getInitialCosting] Invalid costing type:', { id: costing.id, type: costing.type })
    throw createHttpError(
      400,
      `Conversation is available only for Initial Costing steps. Found: ${costing.type}`,
    )
  }

  return costing
}

async function ensureSubElementForCosting(costingId, template) {
  const [subElement] = await RfqCostingInitialSubElement.findOrCreate({
    where: {
      rfq_costing_id: costingId,
      key: template.key,
    },
    defaults: {
      rfq_costing_id: costingId,
      key: template.key,
      title: template.title,
      status: template.defaultStatus,
      approval_status: template.defaultApprovalStatus,
    },
  })

  if (subElement.title !== template.title) {
    await subElement.update({ title: template.title })
  }

  return subElement
}

async function getConversationContext(costingId, key) {
  console.log('[getConversationContext] Starting...', { costingId, key })

  const costing = await getInitialCosting(costingId)
  const template = getTemplateByKey(key)

  console.log('[getConversationContext] Template lookup:', {
    requestedKey: key,
    found: !!template,
    templateKey: template?.key,
    availableTemplates: RfqCostingInitialSubElement.TEMPLATES.map((t) => t.key),
  })

  if (!template) {
    throw createHttpError(
      404,
      `Initial Costing step "${key}" not found. Available steps: ${RfqCostingInitialSubElement.TEMPLATES.map((t) => t.key).join(', ')}`,
    )
  }

  const [subElement, costingDisplayData] = await Promise.all([
    ensureSubElementForCosting(costing.id, template),
    getCostingDisplayData(costing),
  ])

  console.log('[getConversationContext] Context created:', {
    costingId: costing.id,
    templateKey: template.key,
    subElementId: subElement.id,
  })

  return {
    costing,
    template,
    subElement,
    costingDisplayData,
  }
}

function createParticipantRecord(user) {
  const rawUser = user && typeof user.toJSON === 'function' ? user.toJSON() : user || {}

  return {
    id: rawUser.id ?? null,
    full_name: rawUser.full_name || null,
    email: rawUser.email || null,
    role: rawUser.role || 'user',
    scopes: new Set(),
    lookup_values: getIdentityLookupValues(rawUser),
  }
}

function addParticipantRecord(participantsByKey, participantRecord, scope) {
  if (!participantRecord) {
    return
  }

  const participantKey =
    participantRecord.id !== null && participantRecord.id !== undefined
      ? `id:${participantRecord.id}`
      : `email:${getLookupValue(participantRecord.email) || getLookupValue(participantRecord.full_name)}`

  if (!participantKey || participantKey.endsWith(':')) {
    return
  }

  const existingRecord = participantsByKey.get(participantKey) || {
    ...participantRecord,
    scopes: new Set(),
    lookup_values: Array.isArray(participantRecord.lookup_values)
      ? participantRecord.lookup_values
      : getIdentityLookupValues(participantRecord),
  }
  existingRecord.scopes.add(scope)
  participantsByKey.set(participantKey, existingRecord)
}

function addParticipant(participantsByKey, user, scope) {
  if (!user) {
    return
  }

  addParticipantRecord(participantsByKey, createParticipantRecord(user), scope)
}

function resolveUserReference(referenceValue, users) {
  const normalizedReference = getTrimmedText(referenceValue)

  if (!normalizedReference) {
    return null
  }

  const normalizedLookupValue = getLookupValue(normalizedReference)

  return (
    users.find((user) => {
      const userLookupValues = getIdentityLookupValues(user)
      return userLookupValues.includes(normalizedLookupValue)
    }) || null
  )
}

function serializeParticipant(participant = {}) {
  return {
    id: participant.id,
    full_name: participant.full_name,
    email: participant.email,
    role: participant.role,
    scopes: Array.from(participant.scopes || []).sort(),
  }
}

function normalizeMentionRecord(user = {}) {
  const rawUser = user && typeof user.toJSON === 'function' ? user.toJSON() : user || {}

  return {
    id: rawUser.id ?? null,
    full_name: rawUser.full_name || rawUser.fullName || null,
    email: rawUser.email || null,
    role: rawUser.role || 'user',
    lookup_values: getIdentityLookupValues(rawUser),
  }
}

function normalizeStoredMentions(mentions) {
  if (!Array.isArray(mentions)) {
    return []
  }

  return mentions
    .map((mention) => {
      const id = Number.parseInt(String(mention?.id ?? '').trim(), 10)
      const fullName = getTrimmedText(mention?.full_name ?? mention?.fullName)
      const email = getTrimmedText(mention?.email)
      const role = getTrimmedText(mention?.role)

      if (!Number.isInteger(id) || id <= 0) {
        return null
      }

      return {
        id,
        full_name: fullName || null,
        email: email || null,
        role: role || 'user',
        lookup_values: getIdentityLookupValues({
          id,
          full_name: fullName,
          email,
          role,
        }),
      }
    })
    .filter(Boolean)
}

function buildMentionAliases(users = []) {
  const fullNameCounts = users.reduce((counts, user) => {
    const fullName = getTrimmedText(user?.full_name ?? user?.fullName).toLowerCase()

    if (!fullName) {
      return counts
    }

    counts.set(fullName, (counts.get(fullName) || 0) + 1)
    return counts
  }, new Map())
  const localPartCounts = users.reduce((counts, user) => {
    const localPart = getEmailLocalPart(user?.email)

    if (!localPart) {
      return counts
    }

    counts.set(localPart, (counts.get(localPart) || 0) + 1)
    return counts
  }, new Map())

  return users.map((user) => {
    const fullName = getTrimmedText(user?.full_name ?? user?.fullName)
    const email = getTrimmedText(user?.email)
    const localPart = getEmailLocalPart(email)
    const aliases = new Set()

    if (fullName && fullNameCounts.get(fullName.toLowerCase()) === 1) {
      aliases.add(fullName)
    }

    if (email) {
      aliases.add(email)
    }

    if (localPart && localPartCounts.get(localPart) === 1) {
      aliases.add(localPart)
    }

    return {
      ...user,
      mention_aliases: Array.from(aliases).sort((leftAlias, rightAlias) => rightAlias.length - leftAlias.length),
    }
  })
}

function messageContainsMention(message, alias) {
  const normalizedMessage = String(message || '')
  const normalizedAlias = getTrimmedText(alias)

  if (!normalizedMessage || !normalizedAlias) {
    return false
  }

  const mentionPattern = new RegExp(
    `(^|[^\\w])@${escapeRegExp(normalizedAlias)}(?=$|[^\\w])`,
    'i',
  )

  return mentionPattern.test(normalizedMessage)
}

function resolveMentionedUsers(message, users = [], authorUserId = null) {
  const normalizedUsers = buildMentionAliases(Array.isArray(users) ? users : [])
  const mentionedUsersMap = new Map()

  normalizedUsers.forEach((user) => {
    if (!Number.isInteger(user?.id) || user.id <= 0 || user.id === authorUserId) {
      return
    }

    if (
      Array.isArray(user.mention_aliases) &&
      user.mention_aliases.some((alias) => messageContainsMention(message, alias))
    ) {
      mentionedUsersMap.set(user.id, normalizeMentionRecord(user))
    }
  })

  return Array.from(mentionedUsersMap.values())
}

function resolveMentionedUsersFromPayload(mentions, users = [], authorUserId = null) {
  const sourceMentions = Array.isArray(mentions) ? mentions : []
  const usersById = new Map()
  const usersByLookupValue = new Map()

  users.forEach((user) => {
    const normalizedUser = normalizeMentionRecord(user)

    if (Number.isInteger(normalizedUser.id) && normalizedUser.id > 0) {
      usersById.set(normalizedUser.id, normalizedUser)
    }

    getIdentityLookupValues(normalizedUser).forEach((lookupValue) => {
      if (!usersByLookupValue.has(lookupValue)) {
        usersByLookupValue.set(lookupValue, normalizedUser)
      }
    })
  })

  const mentionedUsersMap = new Map()

  sourceMentions.forEach((mention) => {
    const mentionId = Number.parseInt(String(mention?.id ?? '').trim(), 10)
    const mentionLookupValues = getIdentityLookupValues({
      id: mention?.id,
      email: mention?.email,
      full_name: mention?.full_name ?? mention?.fullName ?? mention?.name,
    })
    const matchedUser =
      (Number.isInteger(mentionId) && mentionId > 0 ? usersById.get(mentionId) : null) ||
      mentionLookupValues
        .map((lookupValue) => usersByLookupValue.get(lookupValue))
        .find(Boolean) ||
      null

    if (
      !matchedUser ||
      !Number.isInteger(matchedUser.id) ||
      matchedUser.id <= 0 ||
      matchedUser.id === authorUserId
    ) {
      return
    }

    mentionedUsersMap.set(matchedUser.id, matchedUser)
  })

  return Array.from(mentionedUsersMap.values())
}

async function resolveConversationParticipants(subElement, template, conversationItems = []) {
  const users = await User.findAll({
    where: {
      approval_status: 'approved',
    },
    attributes: ['id', 'full_name', 'email', 'role', 'approvable_sub_elements'],
    order: [
      ['full_name', 'ASC'],
      ['email', 'ASC'],
    ],
  })

  const participantsByKey = new Map()

  users.forEach((user) => {
    const approvableSubElements = Array.isArray(user.approvable_sub_elements)
      ? user.approvable_sub_elements
      : []

    if (approvableSubElements.includes(template.key)) {
      addParticipant(participantsByKey, user, 'manager')
    }
  })

  addParticipant(participantsByKey, resolveUserReference(subElement?.pilot, users), 'pilot')
  addParticipant(participantsByKey, resolveUserReference(subElement?.approver, users), 'approver')
  ;(Array.isArray(conversationItems) ? conversationItems : []).forEach((item) => {
    const rawItem = item && typeof item.toJSON === 'function' ? item.toJSON() : item || {}
    normalizeStoredMentions(rawItem.mentions).forEach((mentionedUser) => {
      addParticipantRecord(participantsByKey, mentionedUser, 'mentioned')
    })
  })

  return Array.from(participantsByKey.values()).sort((leftParticipant, rightParticipant) => {
    const leftLabel =
      getTrimmedText(leftParticipant.full_name) || getTrimmedText(leftParticipant.email) || ''
    const rightLabel =
      getTrimmedText(rightParticipant.full_name) || getTrimmedText(rightParticipant.email) || ''

    return leftLabel.localeCompare(rightLabel)
  })
}

function assertConversationAccess(authenticatedUser, participants) {
  if (!authenticatedUser?.id) {
    throw createHttpError(401, 'Authentication is required.')
  }

  if (isAdminUser(authenticatedUser)) {
    return
  }

  const currentUserLookupValues = getIdentityLookupValues(authenticatedUser)
  const hasAccess = participants.some((participant) =>
    participant.lookup_values.some((lookupValue) => currentUserLookupValues.includes(lookupValue)),
  )

  if (!hasAccess) {
    throw createHttpError(403, 'You are not allowed to access this step conversation.')
  }
}

function normalizeStoredAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return []
  }

  return attachments
    .map((attachment) => {
      const dataUrl = getTrimmedText(attachment?.data_url ?? attachment?.dataUrl)
      const name = sanitizeFileName(attachment?.name)

      if (!dataUrl) {
        return null
      }

      const mimeType =
        getTrimmedText(attachment?.mime_type ?? attachment?.mimeType) ||
        dataUrl.match(DATA_URL_REGEX)?.[1] ||
        'application/octet-stream'
      const sizeBytes = Number.parseInt(
        String(attachment?.size_bytes ?? attachment?.sizeBytes ?? 0).trim(),
        10,
      )

      return {
        id: getTrimmedText(attachment?.id) || crypto.randomBytes(8).toString('hex'),
        name,
        mime_type: mimeType,
        size_bytes: Number.isInteger(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0,
        kind:
          getTrimmedText(attachment?.kind) ||
          (mimeType.toLowerCase().startsWith('image/') ? 'image' : 'file'),
        data_url: dataUrl,
      }
    })
    .filter(Boolean)
}

async function notifyMentionedUsers(mentionedUsers, context, authenticatedUser) {
  const validMentionedUsers = Array.isArray(mentionedUsers) ? mentionedUsers : []

  if (validMentionedUsers.length === 0) {
    return {
      created_count: 0,
      skipped_count: 0,
    }
  }

  const authorName =
    getTrimmedText(authenticatedUser?.full_name ?? authenticatedUser?.fullName) ||
    getTrimmedText(authenticatedUser?.email) ||
    'A colleague'
  const projectDisplayName =
    context?.costingDisplayData?.project_display_name || getTrimmedText(context?.costing?.rfq_id) || 'Project'
  const costingType = getTrimmedText(context?.costing?.type) || 'Costing'
  const subElementTitle =
    getTrimmedText(context?.subElement?.title) || getTrimmedText(context?.template?.title) || 'Step'
  const notificationMessage =
    buildNotificationSummary([
      projectDisplayName ? `Project: ${projectDisplayName}` : null,
      costingType ? `Stage: ${costingType}` : null,
      subElementTitle ? `Step: ${subElementTitle}` : null,
    ]) || `${authorName} mentioned you in a message`

  return notificationService.createNotificationsForRecipients(validMentionedUsers, {
    type: 'conversation-mention',
    subject: `PL Assembly - You were mentioned by ${authorName}`,
    title: `You were mentioned by ${authorName}`,
    message: notificationMessage,
    body: null,
    action_label: 'Open conversation',
    action_url: getWorkspaceCostingUrl(),
    metadata: {
      action_type: 'open-step-conversation',
      section_id: 'costing',
      rfq_id: context?.costingDisplayData?.rfq_id || context?.costing?.rfq_id || null,
      project_display_name: projectDisplayName,
      costing_id: context?.costing?.id ?? null,
      costing_reference: getTrimmedText(context?.costing?.reference) || null,
      costing_type: costingType,
      stage_label: costingType,
      sub_element_key: context?.template?.key || null,
      sub_element_title: subElementTitle,
      author_id: authenticatedUser?.id ?? null,
      author_name: authorName,
    },
  })
}

function normalizeAttachmentPayload(attachment) {
  const dataUrl = getTrimmedText(attachment?.data_url ?? attachment?.dataUrl)

  if (!dataUrl) {
    throw createHttpError(400, 'Each attachment must include a data URL.')
  }

  const dataUrlMatch = dataUrl.match(DATA_URL_REGEX)

  if (!dataUrlMatch) {
    throw createHttpError(400, 'Invalid attachment format. Please upload the file again.')
  }

  const mimeType = getTrimmedText(attachment?.mime_type ?? attachment?.mimeType) || dataUrlMatch[1]
  const base64Payload = dataUrlMatch[2].replace(/\s+/g, '')

  if (!base64Payload || /[^a-z0-9+/=]/i.test(base64Payload)) {
    throw createHttpError(400, 'Invalid attachment payload.')
  }

  const sizeBytes = Buffer.byteLength(base64Payload, 'base64')

  if (sizeBytes <= 0) {
    throw createHttpError(400, 'The attachment is empty.')
  }

  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw createHttpError(400, 'Each attachment must be 4 MB or smaller.')
  }

  return {
    id: getTrimmedText(attachment?.id) || crypto.randomBytes(8).toString('hex'),
    name: sanitizeFileName(attachment?.name),
    mime_type: mimeType,
    size_bytes: sizeBytes,
    kind: mimeType.toLowerCase().startsWith('image/') ? 'image' : 'file',
    data_url: dataUrl,
  }
}

function normalizeMessagePayload(payload = {}) {
  const message = getTrimmedText(payload?.message)
  const rawAttachments = Array.isArray(payload?.attachments) ? payload.attachments : []

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw createHttpError(400, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`)
  }

  if (rawAttachments.length > MAX_ATTACHMENTS) {
    throw createHttpError(400, `You can upload up to ${MAX_ATTACHMENTS} attachments per message.`)
  }

  const attachments = rawAttachments.map((attachment) => normalizeAttachmentPayload(attachment))
  const totalAttachmentBytes = attachments.reduce(
    (totalSize, attachment) => totalSize + attachment.size_bytes,
    0,
  )

  if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw createHttpError(400, 'Total attachment size must stay below 10 MB.')
  }

  if (!message && attachments.length === 0) {
    throw createHttpError(400, 'Please add a message or at least one attachment.')
  }

  return {
    message: message || null,
    attachments,
  }
}

function serializeAuthor(user = {}) {
  const rawUser = user && typeof user.toJSON === 'function' ? user.toJSON() : user || {}

  return {
    id: rawUser.id ?? null,
    full_name: rawUser.full_name || null,
    email: rawUser.email || null,
    role: rawUser.role || null,
  }
}

function serializeConversationMessage(item, authorsById) {
  const rawItem = item && typeof item.toJSON === 'function' ? item.toJSON() : item || {}

  return {
    id: rawItem.id,
    rfq_costing_id: rawItem.rfq_costing_id,
    sub_element_key: rawItem.sub_element_key,
    message: rawItem.message || '',
    mentions: normalizeStoredMentions(rawItem.mentions).map((mention) => ({
      id: mention.id,
      full_name: mention.full_name,
      email: mention.email,
      role: mention.role,
    })),
    attachments: normalizeStoredAttachments(rawItem.attachments),
    created_at: rawItem.created_at || rawItem.createdAt || null,
    author: serializeAuthor(authorsById.get(rawItem.user_id)),
  }
}

async function serializeConversationMessages(items) {
  const rawItems = Array.isArray(items) ? items : []
  const authorIds = Array.from(
    new Set(
      rawItems
        .map((item) => item?.user_id ?? item?.userId)
        .filter((authorId) => Number.isInteger(authorId) && authorId > 0),
    ),
  )
  const authors = authorIds.length
    ? await User.findAll({
        where: {
          id: authorIds,
        },
        attributes: ['id', 'full_name', 'email', 'role'],
      })
    : []
  const authorsById = new Map(authors.map((author) => [author.id, author]))

  return rawItems.map((item) => serializeConversationMessage(item, authorsById))
}

function buildConversationPayload({
  costing,
  template,
  subElement,
  costingDisplayData,
  participants,
}) {
  return {
    costing_id: costing.id,
    rfq_id: costingDisplayData?.rfq_id || costing.rfq_id || null,
    project_display_name: costingDisplayData?.project_display_name || null,
    costing_reference: getTrimmedText(costing.reference) || null,
    costing_type: costing.type,
    sub_element_key: template.key,
    sub_element_title: getTrimmedText(subElement?.title) || template.title,
    status: subElement?.status || template.defaultStatus,
    approval_status: subElement?.approval_status || template.defaultApprovalStatus,
    participants: participants.map((participant) => serializeParticipant(participant)),
  }
}

async function getConversation(costingId, key, authenticatedUser) {
  console.log('[getConversation] Starting...', { costingId, key, userId: authenticatedUser?.id })

  try {
    const context = await getConversationContext(costingId, key)
    console.log('[getConversation] Context retrieved:', {
      costingId: context.costing.id,
      templateKey: context.template.key,
      subElementId: context.subElement.id,
    })

    const items = await SubElementConversationMessage.findAll({
      where: {
        rfq_costing_id: context.costing.id,
        sub_element_key: context.template.key,
      },
      order: [
        ['created_at', 'ASC'],
        ['id', 'ASC'],
      ],
    })

    const participants = await resolveConversationParticipants(
      context.subElement,
      context.template,
      items,
    )
    console.log('[getConversation] Participants resolved:', {
      count: participants.length,
      participantRoles: participants.map((p) => Array.from(p.scopes || [])).flat(),
    })

    assertConversationAccess(authenticatedUser, participants)

    const serializedItems = await serializeConversationMessages(items)

    console.log('[getConversation] Success! Messages count:', serializedItems.length)

    return {
      conversation: buildConversationPayload({
        ...context,
        participants,
      }),
      items: serializedItems,
      total_count: serializedItems.length,
    }
  } catch (error) {
    console.error('[getConversation] Failed:', {
      message: error.message,
      statusCode: error.statusCode,
      costingId,
      key,
      userId: authenticatedUser?.id,
      stack: error.stack,
    })
    throw error
  }
}

async function createConversationMessage(costingId, key, payload = {}, authenticatedUser) {
  const context = await getConversationContext(costingId, key)
  const existingConversationItems = await SubElementConversationMessage.findAll({
    where: {
      rfq_costing_id: context.costing.id,
      sub_element_key: context.template.key,
    },
    order: [
      ['created_at', 'ASC'],
      ['id', 'ASC'],
    ],
  })
  const participants = await resolveConversationParticipants(
    context.subElement,
    context.template,
    existingConversationItems,
  )

  assertConversationAccess(authenticatedUser, participants)

  const normalizedPayload = normalizeMessagePayload(payload)
  const approvedUsers = await User.findAll({
    where: {
      approval_status: 'approved',
    },
    attributes: ['id', 'full_name', 'email', 'role'],
  })
  const mentionedUsersFromPayload = resolveMentionedUsersFromPayload(
    payload?.mentions,
    approvedUsers,
    authenticatedUser?.id ?? null,
  )
  const mentionedUsers = Array.from(
    new Map(
      [...mentionedUsersFromPayload, ...resolveMentionedUsers(
        normalizedPayload.message,
        approvedUsers,
        authenticatedUser?.id ?? null,
      )].map((mentionedUser) => [mentionedUser.id, mentionedUser]),
    ).values(),
  )

  const createdItem = await SubElementConversationMessage.create({
    rfq_costing_id: context.costing.id,
    sub_element_key: context.template.key,
    user_id: authenticatedUser.id,
    message: normalizedPayload.message,
    mentions: mentionedUsers.map((mentionedUser) => ({
      id: mentionedUser.id,
      full_name: mentionedUser.full_name,
      email: mentionedUser.email,
      role: mentionedUser.role,
    })),
    attachments: normalizedPayload.attachments,
  })

  const [serializedItem] = await serializeConversationMessages([createdItem])
  const participantsWithMentionsMap = new Map(
    participants.map((participant) => [
      participant.id,
      {
        ...participant,
        scopes: new Set(Array.isArray(participant.scopes) ? participant.scopes : Array.from(participant.scopes || [])),
      },
    ]),
  )

  mentionedUsers.forEach((mentionedUser) => {
    const normalizedMention = normalizeMentionRecord(mentionedUser)
    const existingParticipant = participantsWithMentionsMap.get(normalizedMention.id)

    if (existingParticipant) {
      existingParticipant.scopes.add('mentioned')
      participantsWithMentionsMap.set(normalizedMention.id, existingParticipant)
      return
    }

    participantsWithMentionsMap.set(normalizedMention.id, {
      ...normalizedMention,
      scopes: new Set(['mentioned']),
    })
  })

  try {
    await notifyMentionedUsers(mentionedUsers, context, authenticatedUser)
  } catch (notificationError) {
    console.error('[createConversationMessage] Failed to notify mentioned users:', {
      message: notificationError.message,
      costingId,
      key,
      authorUserId: authenticatedUser?.id,
    })
  }

  return {
    message: 'Conversation message sent successfully.',
    conversation: buildConversationPayload({
      ...context,
      participants: Array.from(participantsWithMentionsMap.values()),
    }),
    item: serializedItem,
  }
}

module.exports = {
  getConversation,
  createConversationMessage,
}
