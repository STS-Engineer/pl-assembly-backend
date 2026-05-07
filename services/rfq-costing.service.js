const { Op } = require('sequelize')
const RfqCosting = require('../models/rfq-costing.model')
const Rfq = require('../models/rfq.model')
const RfqCostingInitialSubElement = require('../models/rfq-costing-initial-sub-element.model')
const User = require('../models/user.model')
const emailService = require('../emails/email.service')
const { getCostingDisplayData } = require('./rfq-display.service')

const PLANT_VALUES = [
  'Monterry',
  'Amiens',
  'Chennai',
  'Daegu',
  'ElFahs',
  'Frankfurt',
  'Poitiers',
  'Tianjin',
  'Kunshan',
]

const DEFAULT_PILOT_PLACEHOLDER = 'Pilot name'
const LEGACY_PILOT_PLACEHOLDERS = new Set(['pilot name', 'project pilot'])

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getTrimmedText(value) {
  return String(value || '').trim()
}

function normalizeOptionalText(value) {
  return getTrimmedText(value) || null
}

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || getTrimmedText(value) === '') {
    return null
  }

  const normalizedValue = Number.parseInt(String(value).trim(), 10)

  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    throw createHttpError(400, 'Invalid duration. Duration must be a positive integer.')
  }

  return normalizedValue
}

function normalizeOptionalDate(value) {
  const trimmedValue = getTrimmedText(value)

  if (!trimmedValue) {
    return null
  }

  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const normalizedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
    )

    if (
      normalizedDate.getFullYear() !== Number(year) ||
      normalizedDate.getMonth() !== Number(month) - 1 ||
      normalizedDate.getDate() !== Number(day)
    ) {
      throw createHttpError(400, 'Invalid due date.')
    }

    return trimmedValue
  }

  const parsedDate = new Date(trimmedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, 'Invalid due date.')
  }

  return parsedDate.toISOString().slice(0, 10)
}

function normalizeLookupKey(value) {
  return getTrimmedText(value).toLowerCase()
}

function isPilotPlaceholderValue(value) {
  const normalizedValue = normalizeLookupKey(value)
  return !normalizedValue || LEGACY_PILOT_PLACEHOLDERS.has(normalizedValue)
}

function getPilotDisplayValue(user = {}) {
  return getTrimmedText(user.full_name) || getTrimmedText(user.email) || DEFAULT_PILOT_PLACEHOLDER
}

function getCostingSubElementTemplate(costingType, key) {
  return RfqCostingInitialSubElement.getTemplateByKey(costingType, getTrimmedText(key))
}

function supportsCostingSubElements(costingType) {
  return RfqCostingInitialSubElement.SUPPORTED_COSTING_TYPES.includes(getTrimmedText(costingType))
}

function supportsCostingLink(costingType) {
  const normalizedCostingType = getTrimmedText(costingType)
  return ['Initial Costing', 'Improved Costing', 'Last Call Costing'].includes(
    normalizedCostingType,
  )
}

function hasOwnField(payload, fieldName) {
  return Boolean(payload) && Object.prototype.hasOwnProperty.call(payload, fieldName)
}

function getNormalizedCostingProductFamily(payload = {}) {
  return getTrimmedText(payload?.product_family ?? payload?.productFamily)
}

function serializeRfqCosting(costing) {
  const rawCosting =
    costing && typeof costing.toJSON === 'function' ? costing.toJSON() : costing || {}

  return {
    ...rawCosting,
    due_date: rawCosting.due_date ?? null,
    dueDate: rawCosting.due_date ?? null,
    createdAt: rawCosting.createdAt ?? rawCosting.created_at ?? null,
    updatedAt: rawCosting.updatedAt ?? rawCosting.updated_at ?? null,
  }
}

function validateSubElementDeadlineAgainstCostingDueDate(deadlineValue, costingDueDateValue) {
  const normalizedDeadlineValue = getTrimmedText(deadlineValue)
  const normalizedCostingDueDateValue = getTrimmedText(costingDueDateValue)

  if (!normalizedDeadlineValue || !normalizedCostingDueDateValue) {
    return
  }

  if (normalizedDeadlineValue > normalizedCostingDueDateValue) {
    throw createHttpError(
      400,
      `Deadline cannot be later than the costing due date (${normalizedCostingDueDateValue}).`,
    )
  }
}

function createDateAtStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isWeekend(date) {
  const weekDay = createDateAtStartOfDay(date).getDay()
  return weekDay === 0 || weekDay === 6
}

function getNextBusinessDay(date) {
  const nextDate = createDateAtStartOfDay(date)

  while (isWeekend(nextDate)) {
    nextDate.setDate(nextDate.getDate() + 1)
  }

  return nextDate
}

function formatIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addBusinessDays(startDate, durationValue) {
  if (!Number.isInteger(durationValue) || durationValue <= 0) {
    return null
  }

  const endDate = getNextBusinessDay(startDate)
  let remainingDays = durationValue - 1

  while (remainingDays > 0) {
    endDate.setDate(endDate.getDate() + 1)

    if (!isWeekend(endDate)) {
      remainingDays -= 1
    }
  }

  return endDate
}

function validateSubElementDurationAgainstCostingDueDate(durationValue, costingDueDateValue) {
  const normalizedCostingDueDateValue = getTrimmedText(costingDueDateValue)

  if (!normalizedCostingDueDateValue) {
    return
  }

  const projectedDueDate = addBusinessDays(getNextBusinessDay(new Date()), durationValue)
  const projectedDueDateValue = projectedDueDate ? formatIsoDate(projectedDueDate) : ''

  if (projectedDueDateValue && projectedDueDateValue > normalizedCostingDueDateValue) {
    throw createHttpError(
      400,
      `Duration cannot project a deadline later than the costing due date (${normalizedCostingDueDateValue}).`,
    )
  }
}

async function validateExistingSubElementDeadlinesForCosting(costingId, costingDueDateValue) {
  const normalizedCostingDueDateValue = getTrimmedText(costingDueDateValue)

  if (!normalizedCostingDueDateValue) {
    return
  }

  const existingSubElements = await RfqCostingInitialSubElement.findAll({
    where: {
      rfq_costing_id: costingId,
      due_date: {
        [Op.ne]: null,
      },
    },
    attributes: ['key', 'title', 'due_date'],
    order: [
      ['due_date', 'DESC'],
      ['id', 'ASC'],
    ],
  })

  const violatingSubElement = existingSubElements.find((subElement) =>
    getTrimmedText(subElement.due_date) > normalizedCostingDueDateValue,
  )

  if (violatingSubElement) {
    throw createHttpError(
      400,
      `The costing due date cannot be earlier than the deadline of "${
        getTrimmedText(violatingSubElement.title) || getTrimmedText(violatingSubElement.key)
      }".`,
    )
  }
}

function buildDefaultSubElementsPayloadForCostingType(costingType) {
  if (!supportsCostingSubElements(costingType)) {
    return []
  }

  return RfqCostingInitialSubElement.getTemplatesForCostingType(costingType).map((template) => ({
    key: template.key,
    title: template.title,
    pilot: template.defaultPilot || DEFAULT_PILOT_PLACEHOLDER,
    approver: template.defaultApprover || null,
    status: template.defaultStatus || 'To be planned',
    approval_status: template.defaultApprovalStatus || 'Not requested',
  }))
}

async function resolvePilotUserByValue(pilotValue) {
  const trimmedPilotValue = getTrimmedText(pilotValue)
  const normalizedPilotValue = normalizeLookupKey(trimmedPilotValue)

  if (!normalizedPilotValue || LEGACY_PILOT_PLACEHOLDERS.has(normalizedPilotValue)) {
    return null
  }

  const approvedUsers = await User.findAll({
    where: {
      approval_status: 'approved',
    },
    attributes: ['id', 'email', 'full_name'],
  })

  const matchingApprovedUser = approvedUsers.find((user) => {
    const normalizedFullName = normalizeLookupKey(user.full_name)
    const normalizedEmail = normalizeLookupKey(user.email)

    return normalizedFullName === normalizedPilotValue || normalizedEmail === normalizedPilotValue
  })

  if (matchingApprovedUser) {
    return matchingApprovedUser
  }

  return User.findOne({
    where: {
      [Op.or]: [
        {
          email: trimmedPilotValue.toLowerCase(),
        },
        {
          full_name: trimmedPilotValue,
        },
      ],
    },
    attributes: ['id', 'email', 'full_name'],
  })
}

async function getDefaultPilotsBySubElementKeyMap() {
  const users = await User.findAll({
    where: {
      approval_status: 'approved',
    },
    attributes: ['id', 'email', 'full_name', 'pilot_sub_elements'],
    order: [
      ['full_name', 'ASC'],
      ['email', 'ASC'],
      ['id', 'ASC'],
    ],
  })

  return users.reduce((pilotsByKey, user) => {
    const pilotSubElements = Array.isArray(user.pilot_sub_elements) ? user.pilot_sub_elements : []

    pilotSubElements.forEach((subElementKey) => {
      const normalizedKey = getTrimmedText(subElementKey)

      if (!normalizedKey) {
        return
      }

      if (!pilotsByKey.has(normalizedKey)) {
        pilotsByKey.set(normalizedKey, [])
      }

      pilotsByKey.get(normalizedKey).push(user)
    })

    return pilotsByKey
  }, new Map())
}

function getDefaultPilotValueForSubElementKey(subElementKey, pilotsByKey = null) {
  if (!(pilotsByKey instanceof Map)) {
    return DEFAULT_PILOT_PLACEHOLDER
  }

  const candidatePilot = (pilotsByKey.get(getTrimmedText(subElementKey)) || [])[0]
  return candidatePilot ? getPilotDisplayValue(candidatePilot) : DEFAULT_PILOT_PLACEHOLDER
}

function shouldOpenTriggeredSubElement(subElement) {
  return ['To be planned', 'Not requested'].includes(subElement?.status)
}

async function ensureInitialSubElementForCosting(costingId, template, defaultPilotsByKey = null) {
  const pilotsByKey =
    defaultPilotsByKey instanceof Map ? defaultPilotsByKey : await getDefaultPilotsBySubElementKeyMap()
  const defaultPilot = getDefaultPilotValueForSubElementKey(template.key, pilotsByKey)
  const [item] = await RfqCostingInitialSubElement.findOrCreate({
    where: {
      rfq_costing_id: costingId,
      key: template.key,
    },
    defaults: {
      rfq_costing_id: costingId,
      key: template.key,
      title: template.title,
      pilot: defaultPilot,
      status: template.defaultStatus,
      approval_status: template.defaultApprovalStatus,
    },
  })

  const updateData = {}

  if (item.title !== template.title) {
    updateData.title = template.title
  }

  if (isPilotPlaceholderValue(item.pilot) && item.pilot !== defaultPilot) {
    updateData.pilot = defaultPilot
  }

  if (Object.keys(updateData).length > 0) {
    await item.update(updateData)
  }

  return item
}

async function notifyPilotsThatBomSpecIsDone(
  costing,
  completedSubElementTitle,
  defaultPilotsByKey = null,
) {
  const targetKeys = ['bom-cost-ready', 'assembly-cost-line']
  const pilotsByKey =
    defaultPilotsByKey instanceof Map ? defaultPilotsByKey : await getDefaultPilotsBySubElementKeyMap()
  const costingDisplayData = await getCostingDisplayData(costing)

  for (const targetKey of targetKeys) {
    const template = getCostingSubElementTemplate(costing.type, targetKey)

    if (!template) {
      continue
    }

    const subElement = await ensureInitialSubElementForCosting(costing.id, template, pilotsByKey)

    if (shouldOpenTriggeredSubElement(subElement)) {
      await subElement.update({
        status: 'Ready to start',
      })
    }

    if (subElement.status === 'Done') {
      continue
    }

    const resolvedPilotUser = await resolvePilotUserByValue(subElement.pilot)

    if (!resolvedPilotUser) {
      console.warn(`No pilot user found for sub-element "${targetKey}".`, {
        pilot: subElement.pilot,
        costingId: costing.id,
      })
      continue
    }

    await emailService.sendSubElementReadyToStartNotification(
      resolvedPilotUser.email || null,
      getPilotDisplayValue(resolvedPilotUser),
      completedSubElementTitle,
      subElement.title || template.title,
      costingDisplayData,
      costing.id,
      {
        user_id: resolvedPilotUser.id,
        email: resolvedPilotUser.email || null,
      },
    )
  }
}

function buildInitialSubElementUpdateData(subElementPayload = {}) {
  const updateData = {}

  if (subElementPayload.title !== undefined) {
    updateData.title = normalizeOptionalText(subElementPayload.title)
  }

  if (subElementPayload.pilot !== undefined) {
    updateData.pilot = normalizeOptionalText(subElementPayload.pilot)
  }

  if (subElementPayload.approver !== undefined) {
    updateData.approver = normalizeOptionalText(subElementPayload.approver)
  }

  if (subElementPayload.status !== undefined) {
    const normalizedStatus = getTrimmedText(subElementPayload.status)

    if (normalizedStatus) {
      updateData.status = normalizedStatus
    }
  }

  if (
    subElementPayload.approval_status !== undefined ||
    subElementPayload.approvalStatus !== undefined
  ) {
    const normalizedApprovalStatus = getTrimmedText(
      subElementPayload.approval_status ?? subElementPayload.approvalStatus,
    )

    if (normalizedApprovalStatus) {
      updateData.approval_status = normalizedApprovalStatus
    }
  }

  if (subElementPayload.duration !== undefined) {
    updateData.duration = normalizeOptionalInteger(subElementPayload.duration)
  }

  if (
    subElementPayload.due_date !== undefined ||
    subElementPayload.dueDate !== undefined ||
    subElementPayload.echeance !== undefined ||
    subElementPayload.echeances !== undefined
  ) {
    updateData.due_date = normalizeOptionalDate(
      subElementPayload.due_date ??
        subElementPayload.dueDate ??
        subElementPayload.echeance ??
        subElementPayload.echeances,
    )
  }

  if (
    subElementPayload.design_type !== undefined ||
    subElementPayload.designType !== undefined
  ) {
    updateData.design_type = normalizeOptionalText(
      subElementPayload.design_type ?? subElementPayload.designType,
    )
  }

  return updateData
}

async function syncInitialSubElements(costing, subElementsPayload = []) {
  if (!supportsCostingSubElements(costing.type)) {
    return
  }

  const normalizedSubElements = Array.isArray(subElementsPayload) ? subElementsPayload : []
  const defaultPilotsByKey = await getDefaultPilotsBySubElementKeyMap()
  const deferredPilotReadyNotifications = []

  for (const subElementPayload of normalizedSubElements) {
    const key = getTrimmedText(subElementPayload?.key)

    if (!key) {
      throw createHttpError(400, 'Each sub-element requires a key.')
    }

    const template = getCostingSubElementTemplate(costing.type, key)
    const existingSubElement = await RfqCostingInitialSubElement.findOne({
      where: {
        rfq_costing_id: costing.id,
        key,
      },
    })
    const updateData = buildInitialSubElementUpdateData(subElementPayload)
    validateSubElementDeadlineAgainstCostingDueDate(updateData.due_date, costing.due_date)
    validateSubElementDurationAgainstCostingDueDate(updateData.duration, costing.due_date)
    const defaultPilot = getDefaultPilotValueForSubElementKey(key, defaultPilotsByKey)
    const requestedPilot = normalizeOptionalText(subElementPayload?.pilot)
    const previousStatus = normalizeOptionalText(existingSubElement?.status)
    const nextPilotValue =
      !isPilotPlaceholderValue(requestedPilot)
        ? requestedPilot
        : !isPilotPlaceholderValue(existingSubElement?.pilot)
          ? normalizeOptionalText(existingSubElement.pilot)
          : defaultPilot
    const completedSubElementTitle =
      updateData.title || existingSubElement?.title || template?.title || key

    if (existingSubElement) {
      if (updateData.title === null) {
        delete updateData.title
      }

      if (
        subElementPayload.pilot !== undefined &&
        normalizeOptionalText(existingSubElement.pilot) !== nextPilotValue
      ) {
        updateData.pilot = nextPilotValue
      }

      if (Object.keys(updateData).length > 0) {
        await existingSubElement.update(updateData)
      }

      const nextStatus = updateData.status ?? previousStatus ?? template?.defaultStatus ?? 'To be planned'

      if (
        costing.type === 'Initial Costing' &&
        key === 'bom-spec-completed' &&
        nextStatus === 'Done' &&
        previousStatus !== 'Done'
      ) {
        deferredPilotReadyNotifications.push({
          completedSubElementTitle,
        })
      }

      continue
    }

    const createdSubElement = await RfqCostingInitialSubElement.create({
      rfq_costing_id: costing.id,
      key,
      title: updateData.title || template?.title || key,
      pilot: nextPilotValue,
      approver: updateData.approver ?? null,
      status: updateData.status || template?.defaultStatus || 'To be planned',
      approval_status:
        updateData.approval_status || template?.defaultApprovalStatus || 'Not requested',
      duration: Object.prototype.hasOwnProperty.call(updateData, 'duration')
        ? updateData.duration
        : null,
      due_date: Object.prototype.hasOwnProperty.call(updateData, 'due_date')
        ? updateData.due_date
        : null,
      design_type: Object.prototype.hasOwnProperty.call(updateData, 'design_type')
        ? updateData.design_type
        : null,
    })

    if (
      costing.type === 'Initial Costing' &&
      key === 'bom-spec-completed' &&
      createdSubElement.status === 'Done'
    ) {
      deferredPilotReadyNotifications.push({
        completedSubElementTitle: createdSubElement.title || template?.title || key,
      })
    }
  }

  for (const notificationPayload of deferredPilotReadyNotifications) {
    try {
      await notifyPilotsThatBomSpecIsDone(
        costing,
        notificationPayload.completedSubElementTitle,
        defaultPilotsByKey,
      )
    } catch (error) {
      console.error(
        'Error while notifying pilots after "BoM and spec are correctly completed inside the costing file" was marked Done through rfq-costing fallback:',
        error.message,
      )
      console.error('Full error:', error)
    }
  }
}

async function getAllRfqCostings() {
  const costings = await RfqCosting.findAll({
    include: [
      {
        model: Rfq,
        as: 'rfq',
        required: false,
      },
    ],
    order: [
      ['createdAt', 'DESC'],
      ['id', 'ASC'],
    ],
  })

  return costings.map((costing) => serializeRfqCosting(costing))
}

async function getRfqCostingById(id) {
  const costing = await RfqCosting.findByPk(id, {
    include: [
      {
        model: Rfq,
        as: 'rfq',
        required: false,
      },
    ],
  })

  if (!costing) {
    throw createHttpError(404, 'RFQ Costing not found.')
  }

  return serializeRfqCosting(costing)
}

async function getRfqCostingsByRfqId(rfqId) {
  const normalizedRfqId = getTrimmedText(rfqId)

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  const rfq = await Rfq.findByPk(normalizedRfqId)
  if (!rfq) {
    throw createHttpError(404, 'RFQ not found.')
  }

  const costings = await RfqCosting.findAll({
    where: {
      rfq_id: normalizedRfqId,
    },
    include: [
      {
        model: Rfq,
        as: 'rfq',
        required: false,
      },
    ],
    order: [
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  })

  return costings.map((costing) => serializeRfqCosting(costing))
}

async function createRfqCosting(payload) {
  const normalizedRfqId = getTrimmedText(payload?.rfq_id)
  const normalizedType = getTrimmedText(payload?.type)
  const normalizedReference = getTrimmedText(payload?.reference)
  const normalizedProductFamily = getNormalizedCostingProductFamily(payload)
  const normalizedPlant = getTrimmedText(payload?.plant)
  const normalizedDueDate = normalizeOptionalDate(
    payload?.due_date ?? payload?.dueDate ?? payload?.echeance ?? payload?.echeances,
  )
  const normalizedLink = normalizeOptionalText(payload?.link ?? payload?.url ?? payload?.lien)

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  if (!RfqCosting.COSTING_TYPE_VALUES.includes(normalizedType)) {
    throw createHttpError(400, 'Invalid costing type.')
  }

  if (!normalizedReference) {
    throw createHttpError(400, 'Reference is required.')
  }

  if (!RfqCosting.PRODUCT_FAMILY_VALUES.includes(normalizedProductFamily)) {
    throw createHttpError(400, 'Invalid product family.')
  }

  if (normalizedPlant && !PLANT_VALUES.includes(normalizedPlant)) {
    throw createHttpError(400, 'Invalid plant.')
  }

  const rfq = await Rfq.findByPk(normalizedRfqId)

  if (!rfq) {
    throw createHttpError(404, 'RFQ not found.')
  }

  const existingCosting = await RfqCosting.findOne({
    where: {
      rfq_id: normalizedRfqId,
      type: normalizedType,
    },
  })

  if (existingCosting) {
    throw createHttpError(409, 'This costing type already exists for the selected RFQ.')
  }

  const costing = await RfqCosting.create({
    rfq_id: normalizedRfqId,
    type: normalizedType,
    reference: normalizedReference,
    product_family: normalizedProductFamily || 'TBD',
    plant: normalizedPlant,
    due_date: normalizedDueDate,
    link: supportsCostingLink(normalizedType) ? normalizedLink : null,
  })

  const subElementsPayload = Array.isArray(payload?.sub_elements)
    ? payload.sub_elements
    : Array.isArray(payload?.subElements)
      ? payload.subElements
      : []

  if (subElementsPayload.length > 0) {
    await syncInitialSubElements(costing, subElementsPayload)
  } else if (supportsCostingSubElements(costing.type)) {
    await syncInitialSubElements(costing, buildDefaultSubElementsPayloadForCostingType(costing.type))
  }

  return serializeRfqCosting(costing)
}

async function updateRfqCosting(id, payload) {
  const costing = await RfqCosting.findByPk(id)

  if (!costing) {
    throw createHttpError(404, 'RFQ Costing not found.')
  }

  const normalizedType = getTrimmedText(payload?.type)
  const normalizedReference = getTrimmedText(payload?.reference)
  const normalizedProductFamily = getNormalizedCostingProductFamily(payload)
  const normalizedPlant = getTrimmedText(payload?.plant)
  const normalizedLink = normalizeOptionalText(payload?.link ?? payload?.url ?? payload?.lien)
  const hasProductFamilyInput =
    hasOwnField(payload, 'product_family') || hasOwnField(payload, 'productFamily')

  if (payload.type && !RfqCosting.COSTING_TYPE_VALUES.includes(normalizedType)) {
    throw createHttpError(400, 'Invalid costing type.')
  }

  if (
    hasProductFamilyInput &&
    !RfqCosting.PRODUCT_FAMILY_VALUES.includes(normalizedProductFamily)
  ) {
    throw createHttpError(400, 'Invalid product family.')
  }

  if (payload.plant && !PLANT_VALUES.includes(normalizedPlant)) {
    throw createHttpError(400, 'Invalid plant.')
  }

  if (payload.type && normalizedType !== costing.type) {
    const existingCosting = await RfqCosting.findOne({
      where: {
        rfq_id: costing.rfq_id,
        type: normalizedType,
        id: { [Op.ne]: id },
      },
    })

    if (existingCosting) {
      throw createHttpError(409, 'This costing type already exists for the selected RFQ.')
    }
  }

  const nextCostingType = payload.type !== undefined ? normalizedType : costing.type
  const updateData = {}
  if (payload.type !== undefined) updateData.type = normalizedType
  if (payload.reference !== undefined) updateData.reference = normalizedReference
  if (hasProductFamilyInput) updateData.product_family = normalizedProductFamily
  if (payload.plant !== undefined) updateData.plant = normalizedPlant
  if (
    payload.due_date !== undefined ||
    payload.dueDate !== undefined ||
    payload.echeance !== undefined ||
    payload.echeances !== undefined
  ) {
    updateData.due_date = normalizeOptionalDate(
      payload.due_date ?? payload.dueDate ?? payload.echeance ?? payload.echeances,
    )
  }
  if (payload.link !== undefined || payload.url !== undefined || payload.lien !== undefined) {
    updateData.link = supportsCostingLink(nextCostingType) ? normalizedLink : null
  } else if (payload.type !== undefined && !supportsCostingLink(nextCostingType)) {
    updateData.link = null
  }

  if (Object.prototype.hasOwnProperty.call(updateData, 'due_date')) {
    await validateExistingSubElementDeadlinesForCosting(id, updateData.due_date)
  }

  await costing.update(updateData)

  const subElementsPayload = Array.isArray(payload?.sub_elements)
    ? payload.sub_elements
    : Array.isArray(payload?.subElements)
      ? payload.subElements
      : null

  if (subElementsPayload) {
    await syncInitialSubElements(costing, subElementsPayload)
  } else if (supportsCostingSubElements(nextCostingType)) {
    await syncInitialSubElements(
      costing,
      buildDefaultSubElementsPayloadForCostingType(nextCostingType),
    )
  }

  const reloadedCosting = await costing.reload()
  return serializeRfqCosting(reloadedCosting)
}

async function deleteRfqCosting(id) {
  const costing = await RfqCosting.findByPk(id)

  if (!costing) {
    throw createHttpError(404, 'RFQ Costing not found.')
  }

  await costing.destroy()
  return { message: 'RFQ Costing deleted successfully.' }
}

async function getCostingTypes() {
  return RfqCosting.COSTING_TYPE_VALUES
}

async function getProductFamilies() {
  return RfqCosting.PRODUCT_FAMILY_VALUES
}

async function getPlants() {
  return PLANT_VALUES
}

module.exports = {
  getAllRfqCostings,
  getRfqCostingById,
  getRfqCostingsByRfqId,
  createRfqCosting,
  updateRfqCosting,
  deleteRfqCosting,
  getCostingTypes,
  getProductFamilies,
  getPlants,
}
