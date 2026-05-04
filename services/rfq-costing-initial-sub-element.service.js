const crypto = require('crypto')
const { Op } = require('sequelize')
const RfqCosting = require('../models/rfq-costing.model')
const RfqCostingInitialSubElement = require('../models/rfq-costing-initial-sub-element.model')
const emailService = require('../emails/email.service')
const User = require('../models/user.model')
const { getCostingDisplayData, getCostingDisplayDataMap } = require('./rfq-display.service')

const STATUS_ALIASES = {
  'to be plannd': 'To be planned',
  'question to sals': 'Question to sales',
  'qustion to pm': 'Question to PM',
  'qustion to sales': 'Question to sales',
  'qustion to pl': 'Question to PL',
}

const APPROVAL_STATUS_ALIASES = {
  'need to b reworked': 'Need to be reworked',
}

const DESIGN_TYPE_ALIASES = {
  'custom': 'Customer Design',
  'customer': 'Customer Design',
  'avo': 'AVO Design',
}

const DEFAULT_PILOT_PLACEHOLDER = 'Pilot name'
const LEGACY_PILOT_PLACEHOLDERS = new Set(['pilot name', 'project pilot'])

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function generateApprovalToken() {
  // Générer un token aléatoire de 32 bytes (256 bits)
  return crypto.randomBytes(32).toString('hex')
}

function getApprovalTokenExpiryDate() {
  // Token valide pendant 7 jours
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + 7)
  return expiryDate
}

function getTrimmedText(value) {
  return String(value || '').trim()
}

function normalizeLookupKey(value) {
  return getTrimmedText(value).toLowerCase()
}

function isValidEmail(value) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(String(value || '').trim())
}

function normalizeEnumValue(value, allowedValues, aliases = {}) {
  const lookupKey = normalizeLookupKey(value)

  if (!lookupKey) {
    return ''
  }

  const matchingValue = allowedValues.find(
    (candidateValue) => normalizeLookupKey(candidateValue) === lookupKey,
  )

  if (matchingValue) {
    return matchingValue
  }

  return aliases[lookupKey] || ''
}

function normalizeRole(value) {
  const normalizedRole = normalizeLookupKey(value)

  if (!normalizedRole) {
    return ''
  }

  return RfqCostingInitialSubElement.ROLE_VALUES.includes(normalizedRole) ? normalizedRole : ''
}

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || getTrimmedText(value) === '') {
    return null
  }

  const normalizedValue = Number.parseInt(String(value).trim(), 10)
  return Number.isInteger(normalizedValue) && normalizedValue > 0 ? normalizedValue : null
}

function normalizeDuration(value) {
  if (value === undefined || value === null || getTrimmedText(value) === '') {
    return null
  }

  const normalizedValue =
    typeof value === 'number' && Number.isFinite(value) ? value : Number(getTrimmedText(value))

  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    throw createHttpError(400, 'Invalid duration. Duration must be a positive integer.')
  }

  return normalizedValue
}

function normalizeDueDate(value) {
  const trimmedValue = getTrimmedText(value)

  if (!trimmedValue) {
    return null
  }

  const parsedDate = new Date(trimmedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, 'Invalid due date.')
  }

  return parsedDate.toISOString().slice(0, 10)
}

function isPilotPlaceholderValue(value) {
  const normalizedValue = normalizeLookupKey(value)
  return !normalizedValue || LEGACY_PILOT_PLACEHOLDERS.has(normalizedValue)
}

function getPilotDisplayValue(user = {}) {
  return getTrimmedText(user.full_name) || getTrimmedText(user.email) || DEFAULT_PILOT_PLACEHOLDER
}

function getRequestedRole(payload = {}) {
  return normalizeRole(payload?.current_role ?? payload?.currentRole ?? payload?.role)
}

function getTemplatesForCostingType(costingType) {
  return RfqCostingInitialSubElement.getTemplatesForCostingType(costingType)
}

function getTemplateByKey(costingType, key) {
  return RfqCostingInitialSubElement.getTemplateByKey(costingType, getTrimmedText(key))
}

function supportsDesignType(costingType) {
  return getTrimmedText(costingType) === 'Initial Costing'
}

async function resolveApproverEmail(approverValue) {
  if (!approverValue) {
    return null
  }

  const trimmedValue = getTrimmedText(approverValue)

  if (isValidEmail(trimmedValue)) {
    return trimmedValue
  }

  try {
    const user = await User.findOne({
      where: {
        full_name: trimmedValue,
      },
    })

    if (user && user.email) {
      return user.email
    }
  } catch (error) {
  }

  return null
}

async function resolvePilotUser(payload = {}) {
  const pilotId = normalizeOptionalInteger(payload?.pilot_id ?? payload?.pilotId)
  const pilotEmail = getTrimmedText(payload?.pilot_email ?? payload?.pilotEmail).toLowerCase()
  const pilotValue = getTrimmedText(payload?.pilot)

  if (pilotId) {
    const userById = await User.findByPk(pilotId)

    if (userById) {
      return userById
    }
  }

  if (pilotEmail) {
    const userByEmail = await User.findOne({
      where: {
        email: pilotEmail,
      },
    })

    if (userByEmail) {
      return userByEmail
    }
  }

  if (!pilotValue) {
    return null
  }

  const normalizedPilotValue = normalizeLookupKey(pilotValue)
  const approvedUsers = await User.findAll({
    where: {
      approval_status: 'approved',
    },
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
          email: pilotValue.toLowerCase(),
        },
        {
          full_name: pilotValue,
        },
      ],
    },
  })
}

async function findApproversBySubElementKey(subElementKey) {
  if (!subElementKey) {
    return []
  }

  try {
    const users = await User.findAll({
      where: {
        approval_status: 'approved',
      },
      attributes: ['id', 'email', 'full_name', 'approvable_sub_elements'],
    })

    const approvers = users.filter(user => {
      const approvableSubElements = user.approvable_sub_elements || []
      return Array.isArray(approvableSubElements) && approvableSubElements.includes(subElementKey)
    })

    return approvers
  } catch (error) {
    console.error(`Error finding approvers for sub-element "${subElementKey}":`, error.message)
    return []
  }
}

async function getApproversBySubElementKeyMap() {
  try {
    const users = await User.findAll({
      where: {
        approval_status: 'approved',
      },
      attributes: ['id', 'email', 'full_name', 'approvable_sub_elements'],
    })

    return users.reduce((approversByKey, user) => {
      const approvableSubElements = Array.isArray(user.approvable_sub_elements)
        ? user.approvable_sub_elements
        : []

      approvableSubElements.forEach((subElementKey) => {
        const normalizedKey = getTrimmedText(subElementKey)

        if (!normalizedKey) {
          return
        }

        if (!approversByKey.has(normalizedKey)) {
          approversByKey.set(normalizedKey, [])
        }

        approversByKey.get(normalizedKey).push(user)
      })

      return approversByKey
    }, new Map())
  } catch (error) {
    console.error('Error building approvers map:', error.message)
    return new Map()
  }
}

async function getDefaultPilotsBySubElementKeyMap() {
  try {
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
  } catch (error) {
    console.error('Error building default pilots map:', error.message)
    return new Map()
  }
}

function getDefaultPilotValueForSubElementKey(subElementKey, pilotsByKey = null) {
  if (!(pilotsByKey instanceof Map)) {
    return DEFAULT_PILOT_PLACEHOLDER
  }

  const candidatePilot = (pilotsByKey.get(getTrimmedText(subElementKey)) || [])[0]
  return candidatePilot ? getPilotDisplayValue(candidatePilot) : DEFAULT_PILOT_PLACEHOLDER
}

function buildSubElementDefinition(template) {
  return {
    key: template.key,
    title: template.title,
    pilot_label: template.pilotLabel,
    approver_label: template.approverLabel,
    approver_role: template.approverRole,
    fill_roles: [...template.fillRoles],
    view_roles: [...template.viewRoles],
  }
}

function buildPermissions(template, currentRole) {
  const normalizedRole = normalizeRole(currentRole)

  if (!template) {
    return {
      current_role: normalizedRole,
      can_fill: false,
      can_view: false,
      hasExplicitFillPermission: false,
      canView: false,
    }
  }

  const canFill = normalizedRole ? template.fillRoles.includes(normalizedRole) : false
  const canView = normalizedRole ? template.viewRoles.includes(normalizedRole) : true

  return {
    current_role: normalizedRole,
    can_fill: canFill,
    can_view: canView,
    hasExplicitFillPermission: canFill,
    canView: canView,
  }
}

async function serializeSubElement(
  subElement,
  template,
  currentRole,
  approversByKey = null,
  costingDisplayData = null,
) {
  const rawSubElement =
    subElement && typeof subElement.toJSON === 'function' ? subElement.toJSON() : subElement || {}

  const managers =
    approversByKey instanceof Map
      ? approversByKey.get(rawSubElement.key) || []
      : await findApproversBySubElementKey(rawSubElement.key)

  return {
    id: rawSubElement.id,
    rfq_costing_id: rawSubElement.rfq_costing_id,
    key: rawSubElement.key,
    title: rawSubElement.title,
    pilot: rawSubElement.pilot,
    approver: rawSubElement.approver,
    status: rawSubElement.status,
    approval_status: rawSubElement.approval_status,
    duration: rawSubElement.duration,
    due_date: rawSubElement.due_date,
    link: costingDisplayData?.costing_link || rawSubElement.link || null,
    design_type: rawSubElement.design_type,
    rfq_id: costingDisplayData?.rfq_id || null,
    project_display_name: costingDisplayData?.project_display_name || null,
    projectDisplayName: costingDisplayData?.project_display_name || null,
    managers: managers.map(m => ({
      id: m.id,
      email: m.email,
      full_name: m.full_name,
    })),
    permissions: buildPermissions(template, currentRole),
  }
}

async function getCostingWithSubElements(costingId) {
  const costing = await RfqCosting.findByPk(costingId)

  if (!costing) {
    throw createHttpError(404, 'RFQ Costing not found.')
  }

  if (!RfqCostingInitialSubElement.SUPPORTED_COSTING_TYPES.includes(costing.type)) {
    throw createHttpError(
      400,
      `This endpoint is available only for supported costing sub-elements. Found: ${costing.type}.`,
    )
  }

  return costing
}

async function ensureSubElementForCosting(costingId, template, defaultPilotsByKey = null) {
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

async function ensureDefaultSubElements(costingId) {
  const itemsByCostingId = await ensureDefaultSubElementsByCostingIds([costingId])
  return itemsByCostingId.get(String(costingId)) || []
}

async function ensureDefaultSubElementsByCostingIds(costingIds = []) {
  const normalizedCostingIds = Array.from(
    new Set(
      (Array.isArray(costingIds) ? costingIds : [])
        .map((costingId) => Number.parseInt(String(costingId || '').trim(), 10))
        .filter((costingId) => Number.isInteger(costingId) && costingId > 0),
    ),
  )

  if (normalizedCostingIds.length === 0) {
    return new Map()
  }

  const costings = await RfqCosting.findAll({
    where: {
      id: normalizedCostingIds,
      type: RfqCostingInitialSubElement.SUPPORTED_COSTING_TYPES,
    },
    attributes: ['id', 'type'],
    order: [['id', 'ASC']],
  })

  if (costings.length === 0) {
    return new Map()
  }

  const templateKeys = Array.from(
    new Set(
      costings.flatMap((costing) =>
        getTemplatesForCostingType(costing.type).map((template) => template.key),
      ),
    ),
  )

  const [existingItems, defaultPilotsByKey] = await Promise.all([
    RfqCostingInitialSubElement.findAll({
      where: {
        rfq_costing_id: normalizedCostingIds,
        key: templateKeys,
      },
    }),
    getDefaultPilotsBySubElementKeyMap(),
  ])

  const existingItemsByCompositeKey = existingItems.reduce((lookup, item) => {
    lookup.set(`${item.rfq_costing_id}:${item.key}`, item)
    return lookup
  }, new Map())

  const itemsToCreate = []
  const titleUpdateOperations = []

  costings.forEach((costing) => {
    const templates = getTemplatesForCostingType(costing.type)

    templates.forEach((template) => {
      const compositeKey = `${costing.id}:${template.key}`
      const existingItem = existingItemsByCompositeKey.get(compositeKey)

      if (!existingItem) {
        itemsToCreate.push({
          rfq_costing_id: costing.id,
          key: template.key,
          title: template.title,
          pilot: getDefaultPilotValueForSubElementKey(template.key, defaultPilotsByKey),
          status: template.defaultStatus,
          approval_status: template.defaultApprovalStatus,
        })
        return
      }

      const updateData = {}

      if (existingItem.title !== template.title) {
        updateData.title = template.title
      }

      if (isPilotPlaceholderValue(existingItem.pilot)) {
        const defaultPilot = getDefaultPilotValueForSubElementKey(template.key, defaultPilotsByKey)

        if (existingItem.pilot !== defaultPilot) {
          updateData.pilot = defaultPilot
        }
      }

      if (Object.keys(updateData).length > 0) {
        titleUpdateOperations.push(existingItem.update(updateData))
      }
    })
  })

  if (itemsToCreate.length > 0) {
    await RfqCostingInitialSubElement.bulkCreate(itemsToCreate, {
      ignoreDuplicates: true,
    })
  }

  if (titleUpdateOperations.length > 0) {
    await Promise.all(titleUpdateOperations)
  }

  const finalItems =
    itemsToCreate.length > 0 || titleUpdateOperations.length > 0
      ? await RfqCostingInitialSubElement.findAll({
        where: {
          rfq_costing_id: normalizedCostingIds,
          key: templateKeys,
        },
      })
      : existingItems

  const itemsByCostingId = costings.reduce((lookup, costing) => {
    lookup.set(String(costing.id), [])
    return lookup
  }, new Map())
  const costingsById = costings.reduce((lookup, costing) => {
    lookup.set(String(costing.id), costing)
    return lookup
  }, new Map())

  finalItems.forEach((item) => {
    const costingKey = String(item.rfq_costing_id)

    if (!itemsByCostingId.has(costingKey)) {
      itemsByCostingId.set(costingKey, [])
    }

    itemsByCostingId.get(costingKey).push(item)
  })

  itemsByCostingId.forEach((items, costingKey) => {
    const itemsByKey = new Map(items.map((item) => [item.key, item]))
    const costing = costingsById.get(costingKey)
    const templates = getTemplatesForCostingType(costing?.type)
    const templateOrderLookup = getTemplateOrderLookup(costing?.type)
    const orderedItems = templates
      .map((template) => itemsByKey.get(template.key))
      .filter(Boolean)
      .sort((leftItem, rightItem) => {
        const leftOrder = templateOrderLookup.get(leftItem.key) ?? Number.MAX_SAFE_INTEGER
        const rightOrder = templateOrderLookup.get(rightItem.key) ?? Number.MAX_SAFE_INTEGER
        return leftOrder - rightOrder
      })

    itemsByCostingId.set(costingKey, orderedItems)
  })

  return itemsByCostingId
}

function getTriggeredSubElementKeys(designType) {
  if (designType === 'AVO Design') {
    return ['avo-design-assembly-2d']
  }

  if (designType === 'Customer Design') {
    return ['technical-feasibility-assessment', 'bom-spec-completed']
  }

  return []
}

function getSubElementKeysAfterAvoAssembly2d() {
  return ['technical-feasibility-assessment', 'bom-spec-completed']
}

function getSubElementKeysAfterTechnicalFeasibilityAndBomSpec() {
  return ['bom-cost-ready', 'assembly-cost-line']
}

function getSubElementKeyAfterBomCostAndAssemblyCost() {
  return ['costing-file-reviewed']
}

function getImprovedSubElementKeysAfterCustomerFeedback() {
  return ['technical-feasibility-assessment', 'bom-spec-completed', 'avo-design-assembly-2d']
}

function getImprovedSubElementKeysAfterTechnicalReview() {
  return ['bom-cost-ready', 'assembly-cost-line']
}

function getImprovedSubElementKeysAfterCostingPreparation() {
  return ['costing-file-reviewed']
}

function getImprovedSubElementKeysAfterCostingFileReview() {
  return ['project-risks-opportunities-ebit-bridge']
}

function getLastCallSubElementKeysAfterCustomerFeedback() {
  return ['technical-feasibility-assessment', 'bom-spec-completed', 'avo-design-assembly-2d']
}

function getLastCallSubElementKeysAfterTechnicalReview() {
  return ['bom-cost-ready', 'assembly-cost-line']
}

function getLastCallSubElementKeysAfterCostingPreparation() {
  return ['costing-file-reviewed']
}

function getLastCallSubElementKeysAfterCostingFileReview() {
  return ['project-risks-opportunities-ebit-bridge']
}

function getTemplateOrderLookup(costingType) {
  return getTemplatesForCostingType(costingType).reduce((lookup, template, index) => {
    lookup.set(template.key, index)
    return lookup
  }, new Map())
}

async function updateLateStatuses() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const subElements = await RfqCostingInitialSubElement.findAll({
      where: {
        due_date: {
          [Op.ne]: null,
        },
        status: {
          [Op.notIn]: ['Done', 'Late!'],
        },
      },
    })

    let updatedCount = 0

    for (const subElement of subElements) {
      const dueDate = new Date(subElement.due_date)
      dueDate.setHours(0, 0, 0, 0)

      if (dueDate < today) {

        try {
          await subElement.update({ status: 'Late!' })
          updatedCount++
        } catch (error) {
          console.error('❌ Error updating status to Late! for sub-element:', subElement.key, error.message)
        }
      }
    }

  } catch (error) {
    console.error('❌ Error in late status update check:', error.message)
  }
}

function shouldOpenTriggeredSubElement(subElement) {
  return ['To be planned', 'Not requested'].includes(subElement?.status)
}

async function areSubElementsApproved(costingId, targetKeys) {
  if (!Array.isArray(targetKeys) || targetKeys.length === 0) {
    return false
  }

  const subElements = await RfqCostingInitialSubElement.findAll({
    where: {
      rfq_costing_id: costingId,
      key: targetKeys,
    },
  })

  const subElementsByKey = new Map(subElements.map((subElement) => [subElement.key, subElement]))
  return targetKeys.every(
    (targetKey) => subElementsByKey.get(targetKey)?.approval_status === 'Approved',
  )
}

async function triggerSubElements(costing, sourceItem, targetKeys) {
  const defaultPilotsByKey = await getDefaultPilotsBySubElementKeyMap()

  for (const targetKey of targetKeys) {
    const template = getTemplateByKey(costing.type, targetKey)

    if (!template) {
      console.warn(`Sub-element template not found for key "${targetKey}".`)
      continue
    }

    const subElement = await ensureSubElementForCosting(costing.id, template, defaultPilotsByKey)
    const canOpenSubElement = shouldOpenTriggeredSubElement(subElement)

    if (canOpenSubElement) {
      await subElement.update({
        status: 'Ready to start',
      })
    }

    if (!canOpenSubElement) {
      continue
    }

    await notifyManagersThatSubElementWasTriggered(costing, sourceItem, subElement)
  }
}

async function notifyPilotsThatSubElementsAreReadyToStart(costing, sourceItem, targetKeys) {
  if (!Array.isArray(targetKeys) || targetKeys.length === 0) {
    return
  }

  const defaultPilotsByKey = await getDefaultPilotsBySubElementKeyMap()
  const costingDisplayData = await getCostingDisplayData(costing)

  for (const targetKey of targetKeys) {
    const template = getTemplateByKey(costing.type, targetKey)

    if (!template) {
      console.warn(`Sub-element template not found for key "${targetKey}".`)
      continue
    }

    const subElement = await ensureSubElementForCosting(costing.id, template, defaultPilotsByKey)

    if (shouldOpenTriggeredSubElement(subElement)) {
      await subElement.update({
        status: 'Ready to start',
      })
    }

    if (subElement.status === 'Done') {
      continue
    }

    const resolvedPilotUser = await resolvePilotUser({
      pilot: subElement.pilot,
    })

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
      sourceItem.title || getTemplateByKey(costing.type, sourceItem.key)?.title || sourceItem.key,
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

async function triggerInitialWorkflowAfterApproval(costing, sourceItem) {
  switch (sourceItem.key) {
    case 'needed-data-understood':
      await triggerDesignDependentSubElements(costing, sourceItem, sourceItem.design_type)
      return
    case 'avo-design-assembly-2d':
      await triggerSubElements(costing, sourceItem, getSubElementKeysAfterAvoAssembly2d())
      return
    case 'technical-feasibility-assessment':
    case 'bom-spec-completed':
      if (
        await areSubElementsApproved(
          costing.id,
          getSubElementKeysAfterAvoAssembly2d(),
        )
      ) {
        await triggerSubElements(
          costing,
          sourceItem,
          getSubElementKeysAfterTechnicalFeasibilityAndBomSpec(),
        )
      }
      return
    case 'bom-cost-ready':
    case 'assembly-cost-line':
      if (
        await areSubElementsApproved(
          costing.id,
          ['bom-cost-ready', 'assembly-cost-line'],
        )
      ) {
        await triggerSubElements(
          costing,
          sourceItem,
          getSubElementKeyAfterBomCostAndAssemblyCost(),
        )
      }
      return
    default:
      return
  }
}

async function triggerImprovedWorkflowAfterApproval(costing, sourceItem) {
  switch (sourceItem.key) {
    case 'needed-data-understood':
      await triggerSubElements(
        costing,
        sourceItem,
        getImprovedSubElementKeysAfterCustomerFeedback(),
      )
      return
    case 'technical-feasibility-assessment':
    case 'bom-spec-completed':
    case 'avo-design-assembly-2d':
      if (
        await areSubElementsApproved(
          costing.id,
          getImprovedSubElementKeysAfterCustomerFeedback(),
        )
      ) {
        await triggerSubElements(
          costing,
          sourceItem,
          getImprovedSubElementKeysAfterTechnicalReview(),
        )
      }
      return
    case 'bom-cost-ready':
    case 'assembly-cost-line':
      if (
        await areSubElementsApproved(
          costing.id,
          getImprovedSubElementKeysAfterTechnicalReview(),
        )
      ) {
        await triggerSubElements(
          costing,
          sourceItem,
          getImprovedSubElementKeysAfterCostingPreparation(),
        )
      }
      return
    case 'costing-file-reviewed':
      await triggerSubElements(
        costing,
        sourceItem,
        getImprovedSubElementKeysAfterCostingFileReview(),
      )
      return
    default:
      return
  }
}

async function triggerLastCallWorkflowAfterApproval(costing, sourceItem) {
  switch (sourceItem.key) {
    case 'needed-data-understood':
      await triggerSubElements(
        costing,
        sourceItem,
        getLastCallSubElementKeysAfterCustomerFeedback(),
      )
      return
    case 'technical-feasibility-assessment':
    case 'bom-spec-completed':
    case 'avo-design-assembly-2d':
      if (
        await areSubElementsApproved(
          costing.id,
          getLastCallSubElementKeysAfterCustomerFeedback(),
        )
      ) {
        await triggerSubElements(
          costing,
          sourceItem,
          getLastCallSubElementKeysAfterTechnicalReview(),
        )
      }
      return
    case 'bom-cost-ready':
    case 'assembly-cost-line':
      if (
        await areSubElementsApproved(
          costing.id,
          getLastCallSubElementKeysAfterTechnicalReview(),
        )
      ) {
        await triggerSubElements(
          costing,
          sourceItem,
          getLastCallSubElementKeysAfterCostingPreparation(),
        )
      }
      return
    case 'costing-file-reviewed':
      await triggerSubElements(
        costing,
        sourceItem,
        getLastCallSubElementKeysAfterCostingFileReview(),
      )
      return
    default:
      return
  }
}

async function triggerWorkflowAfterApproval(costing, sourceItem) {
  if (costing.type === 'Improved Costing') {
    await triggerImprovedWorkflowAfterApproval(costing, sourceItem)
    return
  }

  if (costing.type === 'Last Call Costing') {
    await triggerLastCallWorkflowAfterApproval(costing, sourceItem)
    return
  }

  await triggerInitialWorkflowAfterApproval(costing, sourceItem)
}

async function notifyManagersThatSubElementWasTriggered(costing, sourceItem, subElement) {
  return
  const managers = await findApproversBySubElementKey(subElement.key)
  const costingDisplayData = await getCostingDisplayData(costing)
  const pilotName = subElement.pilot || sourceItem.pilot || 'Not assigned'

  let successCount = 0
  let failCount = 0

  for (const manager of managers) {

    if (!manager.email) {
      console.warn(`⚠️ Manager has no email:`, manager.full_name)
      failCount++
      continue
    }

    try {
      await emailService.sendSubElementOpeningNotification(
        manager.email,
        pilotName,
        costingDisplayData,
        costing.id || 'N/A',
        subElement.title,
      )
      successCount++
    } catch (error) {
      console.error('❌ Error sending email to', manager.email, ':', error.message)
      console.error('❌ Full error stack:', error.stack)
      failCount++
    }
  }

}

async function triggerDesignDependentSubElements(costing, sourceItem, designType) {
  const targetKeys = getTriggeredSubElementKeys(designType)

  if (!targetKeys.length) {
    console.warn('No design-dependent sub-elements were triggered because design type is missing or invalid.', {
      designType,
      costingId: costing.id,
    })
    return
  }

  await triggerSubElements(costing, sourceItem, targetKeys)
}

async function getOptions() {
  const subElementsByCostingType = Object.fromEntries(
    RfqCostingInitialSubElement.SUPPORTED_COSTING_TYPES.map((costingType) => [
      costingType,
      getTemplatesForCostingType(costingType).map((template) => buildSubElementDefinition(template)),
    ]),
  )

  return {
    role_options: [...RfqCostingInitialSubElement.ROLE_VALUES],
    status_options: [...RfqCostingInitialSubElement.STATUS_VALUES],
    approval_status_options: [...RfqCostingInitialSubElement.APPROVAL_STATUS_VALUES],
    design_type_options: [...RfqCostingInitialSubElement.DESIGN_TYPE_VALUES],
    sub_elements: getTemplatesForCostingType('Initial Costing').map((template) =>
      buildSubElementDefinition(template),
    ),
    sub_elements_by_costing_type: subElementsByCostingType,
  }
}

async function getSubElementsByCostingIds(costingIds, context = {}) {
  const normalizedCostingIds = Array.from(
    new Set(
      (Array.isArray(costingIds) ? costingIds : [])
        .map((costingId) => Number.parseInt(String(costingId || '').trim(), 10))
        .filter((costingId) => Number.isInteger(costingId) && costingId > 0),
    ),
  )

  if (normalizedCostingIds.length === 0) {
    return {
      items_by_costing_id: {},
      metadata: await getOptions(),
    }
  }

  const costings = await RfqCosting.findAll({
    where: {
      id: normalizedCostingIds,
      type: RfqCostingInitialSubElement.SUPPORTED_COSTING_TYPES,
    },
    order: [['id', 'ASC']],
  })

  const currentRole = getRequestedRole(context)

  const [itemsByCostingId, costingDisplayDataById, approversByKey, metadata] = await Promise.all([
    ensureDefaultSubElementsByCostingIds(costings.map((costing) => costing.id)),
    getCostingDisplayDataMap(costings),
    getApproversBySubElementKeyMap(),
    getOptions(),
  ])

  const serializedEntries = await Promise.all(
    costings.map(async (costing) => {
      const costingKey = String(costing.id)
      const costingItems = itemsByCostingId.get(costingKey) || []
      const serializedItems = await Promise.all(
        costingItems.map(async (item) => {
          const template = getTemplateByKey(costing.type, item.key)
          return serializeSubElement(
            item,
            template,
            currentRole,
            approversByKey,
            costingDisplayDataById.get(costingKey) || null,
          )
        }),
      )

      return [costingKey, serializedItems]
    }),
  )

  return {
    items_by_costing_id: Object.fromEntries(serializedEntries),
    metadata,
  }
}

async function getSubElementsByCostingId(costingId, context = {}) {
  const costing = await getCostingWithSubElements(costingId)
  const costingDisplayData = await getCostingDisplayData(costing)
  const currentRole = getRequestedRole(context)
  const [items, approversByKey] = await Promise.all([
    ensureDefaultSubElements(costing.id),
    getApproversBySubElementKeyMap(),
  ])

  return {
    costing_id: costing.id,
    rfq_id: costing.rfq_id,
    project_display_name: costingDisplayData.project_display_name,
    costing_type: costing.type,
    items: await Promise.all(
      items.map(async (item) => {
        const template = getTemplateByKey(costing.type, item.key)
        return await serializeSubElement(
          item,
          template,
          currentRole,
          approversByKey,
          costingDisplayData,
        )
      })
    ),
    metadata: await getOptions(),
  }
}

async function getSubElementByKey(costingId, key, context = {}) {
  const costing = await getCostingWithSubElements(costingId)
  const costingDisplayData = await getCostingDisplayData(costing)
  await ensureDefaultSubElements(costing.id)

  const template = getTemplateByKey(costing.type, key)

  if (!template) {
    throw createHttpError(404, `${costing.type} sub-element not found.`)
  }

  const item = await RfqCostingInitialSubElement.findOne({
    where: {
      rfq_costing_id: costing.id,
      key: template.key,
    },
  })

  const currentRole = getRequestedRole(context)
  const permissions = buildPermissions(template, currentRole)

  if (currentRole && !permissions.can_view) {
    throw createHttpError(403, `The role "${currentRole}" is not allowed to view this sub-element.`)
  }

  return {
    costing_id: costing.id,
    rfq_id: costing.rfq_id,
    project_display_name: costingDisplayData.project_display_name,
    costing_type: costing.type,
    sub_element: await serializeSubElement(
      item,
      template,
      currentRole,
      await getApproversBySubElementKeyMap(),
      costingDisplayData,
    ),
    metadata: buildSubElementDefinition(template),
  }
}

async function updateSubElementByKey(costingId, key, payload = {}) {
  const costing = await getCostingWithSubElements(costingId)
  const costingDisplayData = await getCostingDisplayData(costing)
  await ensureDefaultSubElements(costing.id)

  const template = getTemplateByKey(costing.type, key)

  if (!template) {
    throw createHttpError(404, `${costing.type} sub-element not found.`)
  }

  const item = await RfqCostingInitialSubElement.findOne({
    where: {
      rfq_costing_id: costing.id,
      key: template.key,
    },
  })

  const currentRole = getRequestedRole(payload)
  const permissions = buildPermissions(template, currentRole)

  if (currentRole && !permissions.can_fill) {
    throw createHttpError(403, `The role "${currentRole}" is not allowed to fill this sub-element.`)
  }

  const updateData = {}
  const normalizedStatus = normalizeEnumValue(
    payload?.status,
    RfqCostingInitialSubElement.STATUS_VALUES,
    STATUS_ALIASES,
  )
  const normalizedApprovalStatus = normalizeEnumValue(
    payload?.approval_status ?? payload?.approvalStatus,
    RfqCostingInitialSubElement.APPROVAL_STATUS_VALUES,
    APPROVAL_STATUS_ALIASES,
  )
  const normalizedDesignType = supportsDesignType(costing.type)
    ? normalizeEnumValue(
        payload?.design_type ?? payload?.designType,
        RfqCostingInitialSubElement.DESIGN_TYPE_VALUES,
        DESIGN_TYPE_ALIASES,
      )
    : ''

  if (payload.pilot !== undefined) {
    updateData.pilot = getTrimmedText(payload.pilot) || null
  }

  if (
    payload.approver !== undefined ||
    payload.esc_level_1_approver !== undefined ||
    payload.escLevel1Approver !== undefined
  ) {
    updateData.approver =
      getTrimmedText(
        payload.approver ?? payload.esc_level_1_approver ?? payload.escLevel1Approver,
      ) || null
  }

  if (payload.status !== undefined) {
    if (!normalizedStatus) {
      throw createHttpError(400, 'Invalid status.')
    }

    updateData.status = normalizedStatus
  }

  if (payload.approval_status !== undefined || payload.approvalStatus !== undefined) {
    if (!normalizedApprovalStatus) {
      throw createHttpError(400, 'Invalid approval status.')
    }

    updateData.approval_status = normalizedApprovalStatus
  }

  if (payload.design_type !== undefined || payload.designType !== undefined) {
    if (!supportsDesignType(costing.type)) {
      throw createHttpError(400, 'Design type is available only for Initial Costing.')
    }

    if (!normalizedDesignType) {
      throw createHttpError(400, 'Invalid design type.')
    }

    updateData.design_type = normalizedDesignType
  }

  if (payload.duration !== undefined) {
    updateData.duration = normalizeDuration(payload.duration)
  }

  if (
    payload.due_date !== undefined ||
    payload.dueDate !== undefined ||
    payload.echeance !== undefined ||
    payload.echeances !== undefined
  ) {
    updateData.due_date = normalizeDueDate(
      payload.due_date ?? payload.dueDate ?? payload.echeance ?? payload.echeances,
    )
  }


  const previousApprovalStatus = item.approval_status
  const previousPilot = item.pilot
  const previousStatus = item.status
  const resolvedPilotUser = updateData.pilot !== undefined ? await resolvePilotUser(payload) : null

  if (Object.keys(updateData).length > 0) {
    await item.update(updateData)
  }


  // Envoyer un email au pilot quand il est affecté
  const pilotWasAssigned = updateData.pilot !== undefined && updateData.pilot !== previousPilot

  if (pilotWasAssigned && updateData.pilot) {
    ; (async () => {
      try {
        if (resolvedPilotUser && resolvedPilotUser.email) {
          await emailService.sendPilotAssignmentNotification(
            resolvedPilotUser.email,
            resolvedPilotUser.full_name || updateData.pilot,
            template.title,
            costingDisplayData,
            costing.id,
          )
        } else {
          console.warn('⚠️ Pilot user not found or has no email:', {
            pilot: updateData.pilot,
            pilot_id: payload?.pilot_id ?? payload?.pilotId ?? null,
            pilot_email: payload?.pilot_email ?? payload?.pilotEmail ?? null,
          })
        }
      } catch (error) {
        console.error('❌ Error sending pilot assignment notification:', error.message)
        console.error('❌ Error stack:', error.stack)
      }
    })()
  }

  try {
    const statusWasUpdated = updateData.status !== undefined
    const statusIsDone = updateData.status === 'Done'
    const statusJustDone = statusIsDone && previousStatus !== 'Done'
    const statusIsNotifiable = ['Help!!!', 'Late!', 'Escalation level 1'].includes(updateData.status)

    if (statusWasUpdated && statusJustDone) {
      ; (async () => {
        try {
          const approvers = await findApproversBySubElementKey(key)

          if (approvers && approvers.length > 0) {
            const approvalToken = generateApprovalToken()
            const approvalTokenExpiresAt = getApprovalTokenExpiryDate()

            await item.update({
              approval_token: approvalToken,
              approval_token_expires_at: approvalTokenExpiresAt,
            })

            for (const approver of approvers) {
              if (approver.email) {
                await emailService.sendSubElementApprovalRequest(
                  approver.email,
                  item.pilot,
                  costingDisplayData,
                  costing.id,
                  template.title,
                  approvalToken,
                  costing.link || item.link
                )
              }
            }
          } else {
            console.warn(`⚠️ No approvers found for sub-element: "${key}"`)
          }
        } catch (emailError) {
          console.error('❌ Error sending approval request email:', emailError.message)
          console.error('Full error:', emailError)
        }
      })()
    } else if (statusWasUpdated && statusIsNotifiable) {
      ; (async () => {
        try {
          const approvers = await findApproversBySubElementKey(key)

          if (approvers && approvers.length > 0) {
            for (const approver of approvers) {
              if (approver.email) {
                await emailService.sendSubElementStatusNotification(
                  approver.email,
                  item.pilot,
                  costingDisplayData,
                  costing.id,
                  template.title,
                  updateData.status,
                )
                console.log(`✅ Status notification email sent to ${approver.email}`)
              }
            }
          } else {
            console.warn(`⚠️ No approvers found for sub-element: "${key}"`)
          }
        } catch (emailError) {
          console.error('❌ Error sending status notification email:', emailError.message)
          console.error('Full error:', emailError)
        }
      })()
    } else {
    }
  } catch (error) {
    console.error('❌ Error in email trigger logic:', error.message)
  }

  const bomSpecCompletedJustDone =
    costing.type === 'Initial Costing' &&
    key === 'bom-spec-completed' &&
    updateData.status === 'Done' &&
    previousStatus !== 'Done'

  if (bomSpecCompletedJustDone) {
    ; (async () => {
      try {
        await item.reload()
        await notifyPilotsThatSubElementsAreReadyToStart(
          costing,
          item,
          getSubElementKeysAfterTechnicalFeasibilityAndBomSpec(),
        )
      } catch (error) {
        console.error(
          'Error while notifying pilots after "BoM and spec are correctly completed inside the costing file" was marked Done:',
          error.message,
        )
        console.error('Full error:', error)
      }
    })()
  }

  const approvalJustGranted =
    updateData.approval_status === 'Approved' &&
    previousApprovalStatus !== 'Approved'

  if (approvalJustGranted) {
    ; (async () => {
      try {
        await item.reload()
        await triggerWorkflowAfterApproval(costing, item)
      } catch (error) {
        console.error('Error while triggering sub-elements after approval:', error.message)
      }
    })()
  }

  const avoAssembly2dJustDone =
    item.title === 'AVO Design owner : assembly 2D is available for customer communication' &&
    updateData.status === 'Done' &&
    item.status !== 'Done'

  if (false && avoAssembly2dJustDone) {
    ; (async () => {
      try {
        const targetKeys = getSubElementKeysAfterAvoAssembly2d()
        for (const targetKey of targetKeys) {
          const template = getTemplateByKey(costing.type, targetKey)
          if (!template) {
            console.warn(`Sub-element template not found for key "${targetKey}".`)
            continue
          }

          const subElement = await ensureSubElementForCosting(costing.id, template)
          const shouldOpenSubElement = subElement.status === 'To be planned'

          if (shouldOpenSubElement) {
            await subElement.update({
              status: 'Ready to start',
            })
          }

          if (!shouldOpenSubElement) {
            continue
          }

          await notifyManagersThatSubElementWasTriggered(costing, item, subElement)
        }
      } catch (error) {
        console.error('Error while triggering sub-elements after AVO Design owner:', error.message)
      }
    })()
  }

  const isTechnicalFeasibilityOrBomSpec =
    (key === 'technical-feasibility-assessment' || key === 'bom-spec-completed')

  if (false && isTechnicalFeasibilityOrBomSpec && updateData.status !== undefined) {
    ; (async () => {
      try {
        await item.reload()

        const technicalFeasibility = await RfqCostingInitialSubElement.findOne({
          where: {
            rfq_costing_id: costing.id,
            key: 'technical-feasibility-assessment',
          },
        })

        const bomSpec = await RfqCostingInitialSubElement.findOne({
          where: {
            rfq_costing_id: costing.id,
            key: 'bom-spec-completed',
          },
        })

        const bothDone =
          technicalFeasibility?.status === 'Done' && bomSpec?.status === 'Done'

        if (bothDone) {
          const targetKeys = getSubElementKeysAfterTechnicalFeasibilityAndBomSpec()

          for (const targetKey of targetKeys) {
            const template = getTemplateByKey(costing.type, targetKey)
            if (!template) {
              console.warn(`Sub-element template not found for key "${targetKey}".`)
              continue
            }

            const subElement = await ensureSubElementForCosting(costing.id, template)
            const shouldOpenSubElement = subElement.status === 'To be planned'


            if (shouldOpenSubElement) {
              await subElement.update({
                status: 'Ready to start',
              })
            }

            if (!shouldOpenSubElement) {
              continue
            }

            await notifyManagersThatSubElementWasTriggered(costing, item, subElement)
          }
        } else {

        }
      } catch (error) {
        console.error('Error while triggering sub-elements after technical-feasibility and bom-spec:', error.message)
        console.error('Full error:', error)
      }
    })()
  }

  const isBomCostOrAssemblyCost =
    (key === 'bom-cost-ready' || key === 'assembly-cost-line')

  if (false && isBomCostOrAssemblyCost && updateData.status !== undefined) {
    ; (async () => {
      try {
        await item.reload()

        const bomCost = await RfqCostingInitialSubElement.findOne({
          where: {
            rfq_costing_id: costing.id,
            key: 'bom-cost-ready',
          },
        })

        const assemblyCost = await RfqCostingInitialSubElement.findOne({
          where: {
            rfq_costing_id: costing.id,
            key: 'assembly-cost-line',
          },
        })

        const bothDone =
          bomCost?.status === 'Done' && assemblyCost?.status === 'Done'

        if (bothDone) {
          const targetKeys = getSubElementKeyAfterBomCostAndAssemblyCost()

          for (const targetKey of targetKeys) {
            const template = getTemplateByKey(costing.type, targetKey)
            if (!template) {
              console.warn(`Sub-element template not found for key "${targetKey}".`)
              continue
            }

            const subElement = await ensureSubElementForCosting(costing.id, template)
            const shouldOpenSubElement = subElement.status === 'To be planned'

            if (shouldOpenSubElement) {
              await subElement.update({
                status: 'Ready to start',
              })
            }

            if (!shouldOpenSubElement) {
              continue
            }

            await notifyManagersThatSubElementWasTriggered(costing, item, subElement)
          }
        } else {

        }
      } catch (error) {
        console.error('Error while triggering final step after bom-cost and assembly-cost:', error.message)
        console.error('Full error:', error)
      }
    })()
  }

  if (false && key === 'needed-data-understood' && updateData.status === 'Done') {
    const designType = updateData.design_type || item.design_type
    const costingDisplayData = await getCostingDisplayData(costing)

      ; (async () => {
        try {
          if (designType === 'AVO Design') {
            const secondSubElement = await RfqCostingInitialSubElement.findOne({
              where: {
                rfq_costing_id: costing.id,
                key: 'technical-feasibility-assessment',
              },
            })

            if (secondSubElement) {
              await secondSubElement.update({
                title: 'AVO Design owner : assembly 2D is available for customer communication',
              })

              const managers = await findApproversBySubElementKey('technical-feasibility-assessment')
              const pilotName = secondSubElement.pilot || item.pilot || 'Not assigned'

              for (const manager of managers) {
                if (manager.email) {
                  await emailService.sendSubElementOpeningNotification(
                    manager.email,
                    pilotName,
                    costingDisplayData,
                    costing.id || 'N/A',
                    'AVO Design owner : assembly 2D is available for customer communication',
                  )
                }
              }
            }
          } else if (designType === 'Customer Design') {
            const secondSubElement = await RfqCostingInitialSubElement.findOne({
              where: {
                rfq_costing_id: costing.id,
                key: 'technical-feasibility-assessment',
              },
            })

            const thirdSubElement = await RfqCostingInitialSubElement.findOne({
              where: {
                rfq_costing_id: costing.id,
                key: 'bom-spec-completed',
              },
            })

            if (secondSubElement) {
              const managers = await findApproversBySubElementKey('technical-feasibility-assessment')
              const pilotName = secondSubElement.pilot || item.pilot || 'Not assigned'
              for (const manager of managers) {
                if (manager.email) {
                  await emailService.sendSubElementOpeningNotification(
                    manager.email,
                    pilotName,
                    costingDisplayData,
                    costing.id || 'N/A',
                    'Technical feasibility assessment is available for customer communication',
                  )
                }
              }
            }

            if (thirdSubElement) {
              const managers = await findApproversBySubElementKey('bom-spec-completed')
              const pilotName = thirdSubElement.pilot || item.pilot || 'Not assigned'
              for (const manager of managers) {
                if (manager.email) {
                  await emailService.sendSubElementOpeningNotification(
                    manager.email,
                    pilotName,
                    costingDisplayData,
                    costing.id || 'N/A',
                    'BoM and spec are correctly completed inside the costing file',
                  )
                }
              }
            }
          }
        } catch (error) {
          console.error('❌ Error in conditional logic:', error.message)
        }
      })()
  }

  return {
    message: 'Costing sub-element updated successfully.',
    costing_id: costing.id,
    rfq_id: costing.rfq_id,
    project_display_name: costingDisplayData.project_display_name,
    costing_type: costing.type,
    sub_element: await serializeSubElement(
      item,
      template,
      currentRole,
      await getApproversBySubElementKeyMap(),
      costingDisplayData,
    ),
    metadata: buildSubElementDefinition(template),
  }
}

async function getSubElementByApprovalToken(token, context = {}) {
  if (!token || !token.trim()) {
    throw createHttpError(400, 'Approval token is required.')
  }

  const item = await RfqCostingInitialSubElement.findOne({
    where: {
      approval_token: token.trim(),
    },
  })

  if (!item) {
    throw createHttpError(404, 'Invalid or expired approval token.')
  }

  if (item.approval_token_expires_at && new Date() > new Date(item.approval_token_expires_at)) {
    throw createHttpError(410, 'Approval token has expired.')
  }

  const costing = await RfqCosting.findByPk(item.rfq_costing_id)

  if (!costing) {
    throw createHttpError(404, 'Associated RFQ Costing not found.')
  }

  const template = getTemplateByKey(costing.type, item.key)

  if (!template) {
    throw createHttpError(404, 'Sub-element template not found.')
  }

  const costingDisplayData = await getCostingDisplayData(costing)

  return {
    costing_id: costing.id,
    rfq_id: costing.rfq_id,
    project_display_name: costingDisplayData.project_display_name,
    costing_type: costing.type,
    sub_element: {
      id: item.id,
      rfq_costing_id: item.rfq_costing_id,
      key: item.key,
      title: item.title,
      pilot: item.pilot,
      approver: item.approver,
      status: item.status,
      approval_status: item.approval_status,
      duration: item.duration,
      due_date: item.due_date,
      link: costingDisplayData.costing_link || item.link || null,
      design_type: item.design_type,
      rfq_id: costingDisplayData.rfq_id,
      project_display_name: costingDisplayData.project_display_name,
      projectDisplayName: costingDisplayData.project_display_name,
    },
    metadata: buildSubElementDefinition(template),
  }
}

async function approveSubElementByToken(token, payload = {}) {
  if (!token || !token.trim()) {
    throw createHttpError(400, 'Approval token is required.')
  }

  const item = await RfqCostingInitialSubElement.findOne({
    where: {
      approval_token: token.trim(),
    },
  })

  if (!item) {
    throw createHttpError(404, 'Invalid or expired approval token.')
  }

  if (item.approval_token_expires_at && new Date() > new Date(item.approval_token_expires_at)) {
    throw createHttpError(410, 'Approval token has expired.')
  }

  const costing = await RfqCosting.findByPk(item.rfq_costing_id)

  if (!costing) {
    throw createHttpError(404, 'Associated RFQ Costing not found.')
  }

  const template = getTemplateByKey(costing.type, item.key)

  const costingDisplayData = await getCostingDisplayData(costing)

  if (!template) {
    throw createHttpError(404, 'Sub-element template not found.')
  }

  const normalizedApprovalStatus = normalizeEnumValue(
    payload?.approval_status ?? payload?.approvalStatus,
    RfqCostingInitialSubElement.APPROVAL_STATUS_VALUES,
    APPROVAL_STATUS_ALIASES,
  )

  if (!normalizedApprovalStatus) {
    throw createHttpError(400, 'Invalid approval status.')
  }

  const normalizedDesignType = supportsDesignType(costing.type)
    ? normalizeEnumValue(
        payload?.design_type ?? payload?.designType,
        RfqCostingInitialSubElement.DESIGN_TYPE_VALUES,
        DESIGN_TYPE_ALIASES,
      )
    : ''

  const previousApprovalStatus = item.approval_status

  const updateData = {
    approval_status: normalizedApprovalStatus,
    approval_token: null,
    approval_token_expires_at: null,
  }

  if (payload?.design_type !== undefined || payload?.designType !== undefined) {
    if (!supportsDesignType(costing.type)) {
      throw createHttpError(400, 'Design type is available only for Initial Costing.')
    }

    if (!normalizedDesignType) {
      throw createHttpError(400, 'Invalid design type.')
    }

    updateData.design_type = normalizedDesignType
  }

  if (normalizedApprovalStatus === 'Not approved') {
    updateData.status = 'In progress'

  }

  await item.update(updateData)

  await item.reload()

  const approvalJustGranted =
    normalizedApprovalStatus === 'Approved' &&
    previousApprovalStatus !== 'Approved'

  if (approvalJustGranted) {
    ; (async () => {
      try {
        await triggerWorkflowAfterApproval(costing, item)
      } catch (error) {
        console.error('Error while triggering design-dependent sub-elements:', error.message)
      }
    })()
  }

  return {
    message: 'Sub-element approved successfully.',
    costing_id: costing.id,
    rfq_id: costing.rfq_id,
    project_display_name: costingDisplayData.project_display_name,
    costing_type: costing.type,
    sub_element: {
      id: item.id,
      rfq_costing_id: item.rfq_costing_id,
      key: item.key,
      title: item.title,
      pilot: item.pilot,
      approver: item.approver,
      status: item.status,
      approval_status: item.approval_status,
      duration: item.duration,
      due_date: item.due_date,
      link: costingDisplayData.costing_link || item.link || null,
      design_type: item.design_type,
      rfq_id: costingDisplayData.rfq_id,
      project_display_name: costingDisplayData.project_display_name,
      projectDisplayName: costingDisplayData.project_display_name,
    },
    metadata: buildSubElementDefinition(template),
  }
}

module.exports = {
  getOptions,
  getSubElementsByCostingIds,
  getSubElementsByCostingId,
  getSubElementByKey,
  updateSubElementByKey,
  getSubElementByApprovalToken,
  approveSubElementByToken,
  updateLateStatuses,
}
