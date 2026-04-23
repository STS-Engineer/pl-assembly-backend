const crypto = require('crypto')
const { Op } = require('sequelize')
const RfqCosting = require('../models/rfq-costing.model')
const RfqCostingInitialSubElement = require('../models/rfq-costing-initial-sub-element.model')
const emailService = require('../emails/email.service')
const User = require('../models/user.model')
const { getCostingDisplayData } = require('./rfq-display.service')

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

function getRequestedRole(payload = {}) {
  return normalizeRole(payload?.current_role ?? payload?.currentRole ?? payload?.role)
}

function getTemplateByKey(key) {
  const normalizedKey = getTrimmedText(key)
  return RfqCostingInitialSubElement.TEMPLATES.find((template) => template.key === normalizedKey) || null
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

async function getInitialCosting(costingId) {
  const costing = await RfqCosting.findByPk(costingId)

  if (!costing) {
    throw createHttpError(404, 'RFQ Costing not found.')
  }

  if (costing.type !== 'Initial Costing') {
    throw createHttpError(400, 'This endpoint is available only for Initial Costing.')
  }

  return costing
}

async function ensureSubElementForCosting(costingId, template) {
  const [item] = await RfqCostingInitialSubElement.findOrCreate({
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

  if (item.title !== template.title) {
    await item.update({ title: template.title })
  }

  return item
}

async function ensureDefaultSubElements(costingId) {
  const items = await Promise.all(
    RfqCostingInitialSubElement.TEMPLATES.map((template) =>
      ensureSubElementForCosting(costingId, template),
    ),
  )
  const itemsByKey = new Map(items.map((item) => [item.key, item]))

  return RfqCostingInitialSubElement.TEMPLATES.map((template) => itemsByKey.get(template.key)).filter(
    Boolean,
  )
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
  for (const targetKey of targetKeys) {
    const template = getTemplateByKey(targetKey)

    if (!template) {
      console.warn(`Sub-element template not found for key "${targetKey}".`)
      continue
    }

    const subElement = await ensureSubElementForCosting(costing.id, template)
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

async function triggerWorkflowAfterApproval(costing, sourceItem) {
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

async function notifyManagersThatSubElementWasTriggered(costing, sourceItem, subElement) {
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
  return {
    role_options: [...RfqCostingInitialSubElement.ROLE_VALUES],
    status_options: [...RfqCostingInitialSubElement.STATUS_VALUES],
    approval_status_options: [...RfqCostingInitialSubElement.APPROVAL_STATUS_VALUES],
    design_type_options: [...RfqCostingInitialSubElement.DESIGN_TYPE_VALUES],
    sub_elements: RfqCostingInitialSubElement.TEMPLATES.map((template) =>
      buildSubElementDefinition(template),
    ),
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
      type: 'Initial Costing',
    },
    order: [['id', 'ASC']],
  })

  const currentRole = getRequestedRole(context)

  const [costingEntries, costingDisplayEntries, approversByKey, metadata] = await Promise.all([
    Promise.all(
      costings.map(async (costing) => [
        String(costing.id),
        await ensureDefaultSubElements(costing.id),
      ]),
    ),
    Promise.all(
      costings.map(async (costing) => [String(costing.id), await getCostingDisplayData(costing)]),
    ),
    getApproversBySubElementKeyMap(),
    getOptions(),
  ])
  const itemsByCostingId = new Map(costingEntries)
  const costingDisplayDataById = new Map(costingDisplayEntries)

  const serializedEntries = await Promise.all(
    costings.map(async (costing) => {
      const costingKey = String(costing.id)
      const costingItems = itemsByCostingId.get(costingKey) || []
      const serializedItems = await Promise.all(
        costingItems.map(async (item) => {
          const template = getTemplateByKey(item.key)
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
  const costing = await getInitialCosting(costingId)
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
        const template = getTemplateByKey(item.key)
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
  const costing = await getInitialCosting(costingId)
  const costingDisplayData = await getCostingDisplayData(costing)
  await ensureDefaultSubElements(costing.id)

  const template = getTemplateByKey(key)

  if (!template) {
    throw createHttpError(404, 'Initial Costing sub-element not found.')
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
  const costing = await getInitialCosting(costingId)
  const costingDisplayData = await getCostingDisplayData(costing)
  await ensureDefaultSubElements(costing.id)

  const template = getTemplateByKey(key)

  if (!template) {
    throw createHttpError(404, 'Initial Costing sub-element not found.')
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
  const normalizedDesignType = normalizeEnumValue(
    payload?.design_type ?? payload?.designType,
    RfqCostingInitialSubElement.DESIGN_TYPE_VALUES,
    DESIGN_TYPE_ALIASES,
  )

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
  const resolvedPilotUser = updateData.pilot !== undefined ? await resolvePilotUser(payload) : null

  if (Object.keys(updateData).length > 0) {
    await item.update(updateData)
  }


  // Envoyer un email au pilot quand il est affecté
  const pilotWasAssigned = updateData.pilot !== undefined && updateData.pilot !== previousPilot

  if (pilotWasAssigned && updateData.pilot) {
    ;(async () => {
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
    const statusIsNotifiable = ['Help!!!', 'Late!', 'Escalation level 1'].includes(updateData.status)

    if (statusWasUpdated && statusIsDone) {
      ;(async () => {
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
                  approvalToken
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
      ;(async () => {
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

  const approvalJustGranted =
    updateData.approval_status === 'Approved' &&
    previousApprovalStatus !== 'Approved'

  if (approvalJustGranted) {
    ;(async () => {
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
    ;(async () => {
      try {
        const targetKeys = getSubElementKeysAfterAvoAssembly2d()
        for (const targetKey of targetKeys) {
          const template = getTemplateByKey(targetKey)
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
    ;(async () => {
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
            const template = getTemplateByKey(targetKey)
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
    ;(async () => {
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
            const template = getTemplateByKey(targetKey)
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

    ;(async () => {
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
    message: 'Initial Costing sub-element updated successfully.',
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

  const template = getTemplateByKey(item.key)

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

  const template = getTemplateByKey(item.key)

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

  const normalizedDesignType = normalizeEnumValue(
    payload?.design_type ?? payload?.designType,
    RfqCostingInitialSubElement.DESIGN_TYPE_VALUES,
    DESIGN_TYPE_ALIASES,
  )

  const previousApprovalStatus = item.approval_status

  const updateData = {
    approval_status: normalizedApprovalStatus,
    approval_token: null, 
    approval_token_expires_at: null,
  }

  if (normalizedDesignType) {
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
    ;(async () => {
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
