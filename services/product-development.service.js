const { Op } = require('sequelize')
const ElementProductDesign = require('../models/element-product-design')
const SubElementProductDesign = require('../models/sub-element-product-design')
const ProductDevelopmentProduct = require('../models/product-development-product.model')
const SubElementConversationMessage = require('../models/sub-element-conversation-message.model')

const PRODUCT_DEVELOPMENT_ELEMENT_CONVERSATION_SCOPE = 'product-development-element'
const PRODUCT_DEVELOPMENT_SUB_ELEMENT_CONVERSATION_SCOPE = 'product-development-sub-element'

const DEFAULT_PRODUCT_ELEMENT_TITLES = [
  'Check Competitors',
  'Feasibility Study',
  'DFMEA "Conception document Excel file"',
  'Create design',
  'Design Validation Plan',
  'Quality & Packaging note',
  'Test',
  'Samples / Prototypes',
  'Project End Revue',
]

const DEFAULT_PRODUCT_SUB_ELEMENT_TEMPLATES = {
  'create design': ['Customer assembly instruction note'],
  'samples / prototypes': [
    'Assembly',
    'Controle plan approved',
    'Create budget',
    'Customer PO',
    'Customer usage instructions',
    'Define assy proto line localisation and set up',
    'Define internal components production site',
    'Define operator work instruction',
    'Delivery note and shipment',
    'Drawing & Spec and CSR clear and frozen',
    'External component order - #1',
    'External component order - #2',
    'External component order - #3',
    'External component received and approved - #1',
    'External component received and approved - #2',
    'External component received and approved - #3',
    'External tests',
    'Internal component order - #1',
    'Internal component order - #2',
    'Internal component order - #3',
    'Internal component received and approved - #1',
    'Internal component received and approved - #2',
    'Internal component received and approved - #3',
    'Invoicing to customer',
    'Lessons learns',
    'Marking and packaging defined',
    'Part controled and approved',
    'Specific checking fixture available and approved',
    'Specific proto checking fixture design',
    'Specific proto tool design',
    'Specific tool available and approved',
  ],
}
const SAMPLES_PROTOTYPES_ELEMENT_TITLE = 'samples / prototypes'
const SAMPLES_PROTOTYPES_MERGED_SUB_ELEMENT_TITLE = 'Drawing & Spec and CSR clear and frozen'
const SAMPLES_PROTOTYPES_LEGACY_SUB_ELEMENT_TITLES = [
  'Drawing',
  'Spec and CSR clear and frozen',
]
const SAMPLES_PROTOTYPES_LEGACY_SUB_ELEMENT_TITLE_LOOKUP = new Set(
  SAMPLES_PROTOTYPES_LEGACY_SUB_ELEMENT_TITLES.map((title) => title.toLowerCase()),
)

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getTrimmedText(value) {
  return String(value || '').trim()
}

function normalizeOptionalEmail(value) {
  const normalizedValue = getTrimmedText(value).toLowerCase()
  return normalizedValue || null
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value === 'boolean') {
    return value
  }

  const normalizedValue = String(value).trim().toLowerCase()

  if (['true', '1', 'yes', 'y', 'on'].includes(normalizedValue)) {
    return true
  }

  if (['false', '0', 'no', 'n', 'off'].includes(normalizedValue)) {
    return false
  }

  return fallback
}

function normalizeNullableBoolean(value, fieldLabel = 'Boolean value') {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value === 'boolean') {
    return value
  }

  const normalizedValue = String(value).trim().toLowerCase()

  if (['true', '1', 'yes', 'y', 'on'].includes(normalizedValue)) {
    return true
  }

  if (['false', '0', 'no', 'n', 'off'].includes(normalizedValue)) {
    return false
  }

  throw createHttpError(400, `${fieldLabel} is invalid.`)
}

function formatDateOnly(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayDateOnly() {
  return formatDateOnly(new Date())
}

function addDays(dateOnlyValue, numberOfDays) {
  const [year, month, day] = String(dateOnlyValue)
    .split('-')
    .map((entry) => Number(entry))
  const nextDate = new Date(year, month - 1, day)
  nextDate.setDate(nextDate.getDate() + Number(numberOfDays || 0))
  return formatDateOnly(nextDate)
}

function normalizeDeadline(value) {
  const normalizedValue = getTrimmedText(value)

  if (!normalizedValue) {
    throw createHttpError(400, 'Deadline is required.')
  }

  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day))

    if (
      parsedDate.getFullYear() !== Number(year) ||
      parsedDate.getMonth() !== Number(month) - 1 ||
      parsedDate.getDate() !== Number(day)
    ) {
      throw createHttpError(400, 'Invalid deadline.')
    }

    return normalizedValue
  }

  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, 'Invalid deadline.')
  }

  return parsedDate.toISOString().slice(0, 10)
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null || getTrimmedText(value) === '') {
    return null
  }

  return normalizeDeadline(value)
}

function normalizeOptionalInteger(value, options = {}) {
  const fieldLabel = options.fieldLabel || 'Integer value'
  const minValue = Number.isFinite(options.min) ? options.min : null

  if (value === undefined || value === null || getTrimmedText(value) === '') {
    return null
  }

  const parsedValue = Number.parseInt(String(value), 10)

  if (!Number.isInteger(parsedValue)) {
    throw createHttpError(400, `${fieldLabel} must be a valid integer.`)
  }

  if (minValue !== null && parsedValue < minValue) {
    throw createHttpError(400, `${fieldLabel} must be greater than or equal to ${minValue}.`)
  }

  return parsedValue
}

function normalizeOptionalIterationTime(value) {
  if (value === undefined || value === null || getTrimmedText(value) === '') {
    return null
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const limitDate = normalizeOptionalDate(
      value.limitDate ?? value.limit_date ?? value.startDate ?? value.start_date,
    )
    const endDate = normalizeOptionalDate(
      value.endDate ?? value.end_date ?? value.finishDate ?? value.finish_date,
    )

    if (limitDate && endDate) {
      return `${limitDate}|${endDate}`
    }
  }

  const normalizedValue = getTrimmedText(value)
  const rangeMatch = normalizedValue.match(
    /^(\d{4}-\d{2}-\d{2})\s*(?:\||->|to)\s*(\d{4}-\d{2}-\d{2})$/,
  )

  if (rangeMatch) {
    const [, limitDate, endDate] = rangeMatch
    return `${normalizeOptionalDate(limitDate)}|${normalizeOptionalDate(endDate)}`
  }

  const parsedInteger = Number.parseInt(normalizedValue, 10)

  if (Number.isInteger(parsedInteger) && String(parsedInteger) === normalizedValue) {
    return String(parsedInteger)
  }

  throw createHttpError(400, 'Iteration time is invalid.')
}

function normalizeOptionalText(value) {
  const normalizedValue = getTrimmedText(value)
  return normalizedValue || null
}

function normalizeRequiredText(value, fieldLabel) {
  const normalizedValue = getTrimmedText(value)

  if (!normalizedValue) {
    throw createHttpError(400, `${fieldLabel} is required.`)
  }

  return normalizedValue
}

function normalizeEnumValue(value, allowedValues = [], options = {}) {
  const fieldLabel = options.fieldLabel || 'Value'
  const allowNull = options.allowNull !== false
  const normalizedValue = getTrimmedText(value)

  if (!normalizedValue) {
    if (allowNull) {
      return null
    }

    throw createHttpError(400, `${fieldLabel} is required.`)
  }

  if (!allowedValues.includes(normalizedValue)) {
    throw createHttpError(400, `${fieldLabel} is invalid.`)
  }

  return normalizedValue
}

function normalizeOptionalSubElementSchedule(value) {
  const normalizedValue = getTrimmedText(value)
  return normalizedValue || null
}

function normalizeSubElementTitle(value) {
  return normalizeRequiredText(value, 'Sub-element title')
}

function isNeutralSubElementStatusValue(value, fallback = 'Not requested') {
  const normalizedValue = getTrimmedText(value).toLowerCase()
  return !normalizedValue || normalizedValue === getTrimmedText(fallback).toLowerCase()
}

function pickPreferredSubElementText(primaryValue, secondaryValue) {
  const normalizedPrimaryValue = getTrimmedText(primaryValue)

  if (normalizedPrimaryValue) {
    return normalizedPrimaryValue
  }

  const normalizedSecondaryValue = getTrimmedText(secondaryValue)
  return normalizedSecondaryValue || null
}

function pickPreferredSubElementStatus(primaryValue, secondaryValue, fallback = 'Not requested') {
  if (!isNeutralSubElementStatusValue(primaryValue, fallback)) {
    return getTrimmedText(primaryValue)
  }

  if (!isNeutralSubElementStatusValue(secondaryValue, fallback)) {
    return getTrimmedText(secondaryValue)
  }

  return getTrimmedText(primaryValue) || getTrimmedText(secondaryValue) || fallback
}

function pickPreferredSubElementBoolean(primaryValue, secondaryValue) {
  if (typeof primaryValue === 'boolean') {
    return primaryValue
  }

  if (typeof secondaryValue === 'boolean') {
    return secondaryValue
  }

  return null
}

function pickPreferredSubElementInteger(primaryValue, secondaryValue) {
  const normalizedPrimaryValue = getOptionalInteger(primaryValue)

  if (normalizedPrimaryValue !== null) {
    return normalizedPrimaryValue
  }

  return getOptionalInteger(secondaryValue)
}

function getDefaultSubElementTitlesForElementTitle(title) {
  return DEFAULT_PRODUCT_SUB_ELEMENT_TEMPLATES[getTrimmedText(title).toLowerCase()] || []
}

function buildDefaultSubElementsPayload(elementId, elementTitle) {
  return getDefaultSubElementTitlesForElementTitle(elementTitle).map((title, index) => ({
    element_product_design_id: elementId,
    title,
    display_order: index + 1,
    is_default: true,
    index: String(index + 1).padStart(2, '0'),
    two_d_status: 'Not requested',
    status_element: 'Not requested',
    validation: 'Not requested',
    shared_to: 'Not requested',
  }))
}

async function mergeSubElementConversationMessages(
  sourceSubElementId,
  targetSubElement,
  options = {},
) {
  const normalizedSourceSubElementId = Number.parseInt(String(sourceSubElementId || ''), 10)
  const normalizedTargetSubElementId = Number.parseInt(String(targetSubElement?.id || ''), 10)

  if (
    !Number.isInteger(normalizedSourceSubElementId) ||
    normalizedSourceSubElementId <= 0 ||
    !Number.isInteger(normalizedTargetSubElementId) ||
    normalizedTargetSubElementId <= 0 ||
    normalizedSourceSubElementId === normalizedTargetSubElementId
  ) {
    return
  }

  await SubElementConversationMessage.update(
    {
      conversation_entity_id: normalizedTargetSubElementId,
      product_development_product_id:
        targetSubElement?.element?.product_development_product_id ??
        targetSubElement?.product_development_product_id ??
        null,
      element_product_design_id:
        targetSubElement?.element_product_design_id ??
        targetSubElement?.element?.id ??
        null,
      sub_element_product_design_id: normalizedTargetSubElementId,
    },
    {
      where: {
        [Op.or]: [
          {
            sub_element_product_design_id: normalizedSourceSubElementId,
          },
          {
            conversation_scope: PRODUCT_DEVELOPMENT_SUB_ELEMENT_CONVERSATION_SCOPE,
            conversation_entity_id: normalizedSourceSubElementId,
          },
        ],
      },
      ...(options.transaction ? { transaction: options.transaction } : {}),
    },
  )
}

async function reconcileSamplesPrototypesSubElements(elements = [], options = {}) {
  const normalizedElements = (Array.isArray(elements) ? elements : []).filter(Boolean)

  if (normalizedElements.length === 0) {
    return
  }

  const targetElementIds = normalizedElements
    .filter((element) => getTrimmedText(element?.title).toLowerCase() === SAMPLES_PROTOTYPES_ELEMENT_TITLE)
    .map((element) => Number.parseInt(String(element?.id || ''), 10))
    .filter((elementId) => Number.isInteger(elementId) && elementId > 0)

  if (targetElementIds.length === 0) {
    return
  }

  const candidateSubElements = await SubElementProductDesign.findAll({
    where: {
      element_product_design_id: {
        [Op.in]: targetElementIds,
      },
    },
    include: [
      {
        model: ElementProductDesign,
        as: 'element',
        attributes: ['id', 'product_development_product_id'],
      },
    ],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })

  const subElementsByElementId = new Map()

  candidateSubElements.forEach((subElement) => {
    const normalizedTitle = getTrimmedText(subElement?.title).toLowerCase()
    const isMergedTitle =
      normalizedTitle === SAMPLES_PROTOTYPES_MERGED_SUB_ELEMENT_TITLE.toLowerCase()
    const isLegacyTitle = SAMPLES_PROTOTYPES_LEGACY_SUB_ELEMENT_TITLE_LOOKUP.has(normalizedTitle)

    if (!isMergedTitle && !isLegacyTitle) {
      return
    }

    const elementId = Number.parseInt(String(subElement?.element_product_design_id || ''), 10)

    if (!Number.isInteger(elementId) || elementId <= 0) {
      return
    }

    if (!subElementsByElementId.has(elementId)) {
      subElementsByElementId.set(elementId, [])
    }

    subElementsByElementId.get(elementId).push(subElement)
  })

  for (const groupedSubElements of subElementsByElementId.values()) {
    if (!Array.isArray(groupedSubElements) || groupedSubElements.length === 0) {
      continue
    }

    const orderedSubElements = [...groupedSubElements].sort((leftSubElement, rightSubElement) => {
      const leftOrder = getOptionalInteger(leftSubElement?.display_order) ?? Number.MAX_SAFE_INTEGER
      const rightOrder =
        getOptionalInteger(rightSubElement?.display_order) ?? Number.MAX_SAFE_INTEGER

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }

      return (leftSubElement?.id ?? Number.MAX_SAFE_INTEGER) - (rightSubElement?.id ?? Number.MAX_SAFE_INTEGER)
    })
    const mergedSubElement =
      orderedSubElements.find(
        (subElement) =>
          getTrimmedText(subElement?.title).toLowerCase() ===
          SAMPLES_PROTOTYPES_MERGED_SUB_ELEMENT_TITLE.toLowerCase(),
      ) || null
    const primarySubElement = mergedSubElement || orderedSubElements[0]
    const redundantSubElements = orderedSubElements.filter(
      (subElement) => Number(subElement?.id) !== Number(primarySubElement?.id),
    )

    if (!primarySubElement) {
      continue
    }

    const nextDisplayOrder = orderedSubElements.reduce((lowestOrder, subElement) => {
      const currentOrder = getOptionalInteger(subElement?.display_order)
      return currentOrder !== null ? Math.min(lowestOrder, currentOrder) : lowestOrder
    }, getOptionalInteger(primarySubElement?.display_order) ?? Number.MAX_SAFE_INTEGER)
    const mergedUpdateData = {
      title: SAMPLES_PROTOTYPES_MERGED_SUB_ELEMENT_TITLE,
    }

    if (Number.isInteger(nextDisplayOrder) && nextDisplayOrder !== primarySubElement.display_order) {
      mergedUpdateData.display_order = nextDisplayOrder
      mergedUpdateData.index = String(nextDisplayOrder).padStart(2, '0')
    }

    redundantSubElements.forEach((subElement) => {
      mergedUpdateData.owner = pickPreferredSubElementText(
        mergedUpdateData.owner ?? primarySubElement.owner,
        subElement.owner,
      )
      mergedUpdateData.validator = pickPreferredSubElementText(
        mergedUpdateData.validator ?? primarySubElement.validator,
        subElement.validator,
      )
      mergedUpdateData.schedule = pickPreferredSubElementText(
        mergedUpdateData.schedule ?? primarySubElement.schedule,
        subElement.schedule,
      )
      mergedUpdateData.input = pickPreferredSubElementText(
        mergedUpdateData.input ?? primarySubElement.input,
        subElement.input,
      )
      mergedUpdateData.output = pickPreferredSubElementText(
        mergedUpdateData.output ?? primarySubElement.output,
        subElement.output,
      )
      mergedUpdateData.comment_change_index = pickPreferredSubElementText(
        mergedUpdateData.comment_change_index ?? primarySubElement.comment_change_index,
        subElement.comment_change_index,
      )
      mergedUpdateData.two_d = pickPreferredSubElementBoolean(
        mergedUpdateData.two_d ?? primarySubElement.two_d,
        subElement.two_d,
      )
      mergedUpdateData.three_d = pickPreferredSubElementBoolean(
        mergedUpdateData.three_d ?? primarySubElement.three_d,
        subElement.three_d,
      )
      mergedUpdateData.number_hours = pickPreferredSubElementInteger(
        mergedUpdateData.number_hours ?? primarySubElement.number_hours,
        subElement.number_hours,
      )
      mergedUpdateData.two_d_status = pickPreferredSubElementStatus(
        mergedUpdateData.two_d_status ?? primarySubElement.two_d_status,
        subElement.two_d_status,
      )
      mergedUpdateData.status_element = pickPreferredSubElementStatus(
        mergedUpdateData.status_element ?? primarySubElement.status_element,
        subElement.status_element,
      )
      mergedUpdateData.validation = pickPreferredSubElementStatus(
        mergedUpdateData.validation ?? primarySubElement.validation,
        subElement.validation,
      )
      mergedUpdateData.shared_to = pickPreferredSubElementStatus(
        mergedUpdateData.shared_to ?? primarySubElement.shared_to,
        subElement.shared_to,
      )
    })

    await primarySubElement.update(mergedUpdateData, {
      ...(options.transaction ? { transaction: options.transaction } : {}),
    })

    for (const redundantSubElement of redundantSubElements) {
      await mergeSubElementConversationMessages(
        redundantSubElement.id,
        primarySubElement,
        options,
      )
      await redundantSubElement.destroy({
        ...(options.transaction ? { transaction: options.transaction } : {}),
      })
    }
  }
}

function getDeadlineStatus(deadline, referenceDate = getTodayDateOnly()) {
  const normalizedDeadline = getTrimmedText(deadline)

  if (!normalizedDeadline) {
    return 'no-deadline'
  }

  if (normalizedDeadline < referenceDate) {
    return 'overdue'
  }

  if (normalizedDeadline === referenceDate) {
    return 'due-today'
  }

  if (normalizedDeadline <= addDays(referenceDate, 7)) {
    return 'upcoming'
  }

  return 'scheduled'
}

function formatOptionalDateOnly(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const normalizedValue = getTrimmedText(value)

  if (!normalizedValue) {
    return null
  }

  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})/)

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  const parsedDate = new Date(normalizedValue)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString().slice(0, 10)
}

function getOptionalInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsedValue = Number.parseInt(String(value), 10)
  return Number.isInteger(parsedValue) ? parsedValue : null
}

function buildConversationMessageCountLookupKey(scope, entityId) {
  return `${getTrimmedText(scope)}:${Number(entityId) || 0}`
}

function getConversationMessageCountFromLookup(lookup, scope, entityId) {
  if (!(lookup instanceof Map)) {
    return 0
  }

  const count = lookup.get(buildConversationMessageCountLookupKey(scope, entityId))
  return Number.isInteger(count) && count >= 0 ? count : 0
}

async function getProductDevelopmentConversationMessageCountLookup({
  elementIds = [],
  subElementIds = [],
} = {}) {
  const normalizedElementIds = Array.from(
    new Set(
      (Array.isArray(elementIds) ? elementIds : [])
        .map((elementId) => Number.parseInt(String(elementId || ''), 10))
        .filter((elementId) => Number.isInteger(elementId) && elementId > 0),
    ),
  )
  const normalizedSubElementIds = Array.from(
    new Set(
      (Array.isArray(subElementIds) ? subElementIds : [])
        .map((subElementId) => Number.parseInt(String(subElementId || ''), 10))
        .filter((subElementId) => Number.isInteger(subElementId) && subElementId > 0),
    ),
  )

  if (normalizedElementIds.length === 0 && normalizedSubElementIds.length === 0) {
    return new Map()
  }

  const whereConditions = []

  if (normalizedElementIds.length > 0) {
    whereConditions.push({
      conversation_scope: PRODUCT_DEVELOPMENT_ELEMENT_CONVERSATION_SCOPE,
      conversation_entity_id: {
        [Op.in]: normalizedElementIds,
      },
    })
  }

  if (normalizedSubElementIds.length > 0) {
    whereConditions.push({
      conversation_scope: PRODUCT_DEVELOPMENT_SUB_ELEMENT_CONVERSATION_SCOPE,
      conversation_entity_id: {
        [Op.in]: normalizedSubElementIds,
      },
    })
  }

  const rows = await SubElementConversationMessage.findAll({
    attributes: [
      'conversation_scope',
      'conversation_entity_id',
      [
        SubElementConversationMessage.sequelize.fn(
          'COUNT',
          SubElementConversationMessage.sequelize.col('id'),
        ),
        'message_count',
      ],
    ],
    where: {
      [Op.or]: whereConditions,
    },
    group: ['conversation_scope', 'conversation_entity_id'],
    raw: true,
  })

  return rows.reduce((lookup, row) => {
    const entityId = Number.parseInt(String(row?.conversation_entity_id ?? '').trim(), 10)
    const messageCount = Number.parseInt(String(row?.message_count ?? '').trim(), 10)

    if (!Number.isInteger(entityId) || entityId <= 0) {
      return lookup
    }

    lookup.set(
      buildConversationMessageCountLookupKey(row?.conversation_scope, entityId),
      Number.isInteger(messageCount) && messageCount >= 0 ? messageCount : 0,
    )
    return lookup
  }, new Map())
}

function serializeSubElement(subElement, options = {}) {
  const rawSubElement =
    subElement && typeof subElement.toJSON === 'function' ? subElement.toJSON() : subElement || {}
  const displayOrder = getOptionalInteger(rawSubElement.display_order) ?? 0
  const conversationMessageCount = getConversationMessageCountFromLookup(
    options.conversationMessageCountsByKey,
    PRODUCT_DEVELOPMENT_SUB_ELEMENT_CONVERSATION_SCOPE,
    rawSubElement.id,
  )

  return {
    id: rawSubElement.id,
    element_product_design_id: rawSubElement.element_product_design_id ?? null,
    elementProductDesignId: rawSubElement.element_product_design_id ?? null,
    title: getTrimmedText(rawSubElement.title) || `Sub-element ${rawSubElement.id || ''}`.trim(),
    display_order: displayOrder,
    displayOrder,
    is_default: Boolean(rawSubElement.is_default),
    isDefault: Boolean(rawSubElement.is_default),
    index: getTrimmedText(rawSubElement.index) || String(displayOrder).padStart(2, '0'),
    owner: getTrimmedText(rawSubElement.owner) || null,
    two_d: typeof rawSubElement.two_d === 'boolean' ? rawSubElement.two_d : null,
    twoD: typeof rawSubElement.two_d === 'boolean' ? rawSubElement.two_d : null,
    three_d: typeof rawSubElement.three_d === 'boolean' ? rawSubElement.three_d : null,
    threeD: typeof rawSubElement.three_d === 'boolean' ? rawSubElement.three_d : null,
    two_d_status: getTrimmedText(rawSubElement.two_d_status) || 'Not requested',
    twoDStatus: getTrimmedText(rawSubElement.two_d_status) || 'Not requested',
    status_element: getTrimmedText(rawSubElement.status_element) || 'Not requested',
    statusElement: getTrimmedText(rawSubElement.status_element) || 'Not requested',
    schedule: getTrimmedText(rawSubElement.schedule) || null,
    validator: getTrimmedText(rawSubElement.validator) || null,
    validation: getTrimmedText(rawSubElement.validation) || 'Not requested',
    input: getTrimmedText(rawSubElement.input) || null,
    output: getTrimmedText(rawSubElement.output) || null,
    shared_to: getTrimmedText(rawSubElement.shared_to) || 'Not requested',
    sharedTo: getTrimmedText(rawSubElement.shared_to) || 'Not requested',
    comment_change_index: getTrimmedText(rawSubElement.comment_change_index) || null,
    commentChangeIndex: getTrimmedText(rawSubElement.comment_change_index) || null,
    number_hours: getOptionalInteger(rawSubElement.number_hours),
    numberHours: getOptionalInteger(rawSubElement.number_hours),
    conversation_message_count: conversationMessageCount,
    conversationMessageCount: conversationMessageCount,
    message_count: conversationMessageCount,
    messageCount: conversationMessageCount,
    createdAt: rawSubElement.createdAt ?? rawSubElement.created_at ?? null,
    updatedAt: rawSubElement.updatedAt ?? rawSubElement.updated_at ?? null,
  }
}

function sortSerializedSubElements(subElements = []) {
  return [...subElements].sort((leftSubElement, rightSubElement) => {
    const leftOrder = getOptionalInteger(
      leftSubElement?.displayOrder ?? leftSubElement?.display_order,
    )
    const rightOrder = getOptionalInteger(
      rightSubElement?.displayOrder ?? rightSubElement?.display_order,
    )

    if (leftOrder !== null || rightOrder !== null) {
      const normalizedLeftOrder = leftOrder ?? Number.MAX_SAFE_INTEGER
      const normalizedRightOrder = rightOrder ?? Number.MAX_SAFE_INTEGER

      if (normalizedLeftOrder !== normalizedRightOrder) {
        return normalizedLeftOrder - normalizedRightOrder
      }
    }

    return String(leftSubElement?.title || '').localeCompare(String(rightSubElement?.title || ''))
  })
}

function serializeElementWithSubElements(element, subElements = [], options = {}) {
  const serializedElement = serializeElement(element, options)
  const serializedSubElements = sortSerializedSubElements(
    subElements.map((subElement) =>
      subElement && Object.prototype.hasOwnProperty.call(subElement, 'elementProductDesignId')
        ? subElement
        : serializeSubElement(subElement, options),
    ),
  )

  return {
    ...serializedElement,
    sub_elements: serializedSubElements,
    subElements: serializedSubElements,
    sub_element_count: serializedSubElements.length,
    subElementCount: serializedSubElements.length,
  }
}

function serializeElement(element, options = {}) {
  const rawElement =
    element && typeof element.toJSON === 'function' ? element.toJSON() : element || {}
  const title = getTrimmedText(rawElement.title) || getTrimmedText(rawElement.formula)
  const displayOrder = getOptionalInteger(rawElement.display_order) ?? 0
  const dueDate = formatOptionalDateOnly(rawElement.due_date)
  const creationDate = formatOptionalDateOnly(rawElement.creation_date)
  const conversationMessageCount = getConversationMessageCountFromLookup(
    options.conversationMessageCountsByKey,
    PRODUCT_DEVELOPMENT_ELEMENT_CONVERSATION_SCOPE,
    rawElement.id,
  )

  return {
    id: rawElement.id,
    product_development_product_id: rawElement.product_development_product_id ?? null,
    productDevelopmentProductId: rawElement.product_development_product_id ?? null,
    title: title || `Element ${rawElement.id || ''}`.trim(),
    display_order: displayOrder,
    displayOrder,
    is_default: Boolean(rawElement.is_default),
    isDefault: Boolean(rawElement.is_default),
    due_date: dueDate,
    dueDate,
    ext_inter: getTrimmedText(rawElement.ext_inter) || null,
    extInter: getTrimmedText(rawElement.ext_inter) || null,
    creation_date: creationDate,
    creationDate,
    design_type: getTrimmedText(rawElement.design_type) || null,
    designType: getTrimmedText(rawElement.design_type) || null,
    formula: getTrimmedText(rawElement.formula) || null,
    status: getTrimmedText(rawElement.status) || 'Not requested',
    iteration_time: getTrimmedText(rawElement.iteration_time) || null,
    iterationTime: getTrimmedText(rawElement.iteration_time) || null,
    validation: getTrimmedText(rawElement.validation) || 'Not requested',
    development_time: getTrimmedText(rawElement.development_time) || 'Not requested',
    developmentTime: getTrimmedText(rawElement.development_time) || 'Not requested',
    designer: getTrimmedText(rawElement.designer) || null,
    iteration_goals: getOptionalInteger(rawElement.iteration_goals),
    iterationGoals: getOptionalInteger(rawElement.iteration_goals),
    leader: getTrimmedText(rawElement.leader) || null,
    design_review_accepted:
      typeof rawElement.design_review_accepted === 'boolean'
        ? rawElement.design_review_accepted
        : null,
    designReviewAccepted:
      typeof rawElement.design_review_accepted === 'boolean'
        ? rawElement.design_review_accepted
        : null,
    design_need_to_be_reviewed:
      typeof rawElement.design_need_to_be_reviewed === 'boolean'
        ? rawElement.design_need_to_be_reviewed
        : null,
    designNeedToBeReviewed:
      typeof rawElement.design_need_to_be_reviewed === 'boolean'
        ? rawElement.design_need_to_be_reviewed
        : null,
    iteration_note: getOptionalInteger(rawElement.iteration_note),
    iterationNote: getOptionalInteger(rawElement.iteration_note),
    status_note: getTrimmedText(rawElement.status_note) || null,
    statusNote: getTrimmedText(rawElement.status_note) || null,
    customer_due_date: getTrimmedText(rawElement.customer_due_date) || null,
    customerDueDate: getTrimmedText(rawElement.customer_due_date) || null,
    conversation_message_count: conversationMessageCount,
    conversationMessageCount: conversationMessageCount,
    message_count: conversationMessageCount,
    messageCount: conversationMessageCount,
    createdAt: rawElement.createdAt ?? rawElement.created_at ?? null,
    updatedAt: rawElement.updatedAt ?? rawElement.updated_at ?? null,
  }
}

function sortSerializedElements(elements = []) {
  return [...elements].sort((leftElement, rightElement) => {
    const leftOrder = getOptionalInteger(leftElement?.displayOrder ?? leftElement?.display_order)
    const rightOrder = getOptionalInteger(rightElement?.displayOrder ?? rightElement?.display_order)

    if (leftOrder !== null || rightOrder !== null) {
      const normalizedLeftOrder = leftOrder ?? Number.MAX_SAFE_INTEGER
      const normalizedRightOrder = rightOrder ?? Number.MAX_SAFE_INTEGER

      if (normalizedLeftOrder !== normalizedRightOrder) {
        return normalizedLeftOrder - normalizedRightOrder
      }
    }

    const leftTitle = getTrimmedText(leftElement?.title)
    const rightTitle = getTrimmedText(rightElement?.title)

    if (leftTitle && rightTitle && leftTitle !== rightTitle) {
      return leftTitle.localeCompare(rightTitle)
    }

    const leftCreatedAt = new Date(leftElement?.createdAt || 0).getTime()
    const rightCreatedAt = new Date(rightElement?.createdAt || 0).getTime()
    return leftCreatedAt - rightCreatedAt
  })
}

function serializeProduct(product) {
  const rawProduct =
    product && typeof product.toJSON === 'function' ? product.toJSON() : product || {}
  const normalizedDeadline = getTrimmedText(rawProduct.deadline) || null
  const deadlineStatus = getDeadlineStatus(normalizedDeadline)
  const normalizedRef = getTrimmedText(rawProduct.product_ref)
  const normalizedName = getTrimmedText(rawProduct.product_name)
  const normalizedCreatedByEmail = normalizeOptionalEmail(rawProduct.created_by_email)

  return {
    id: rawProduct.id,
    product_ref: normalizedRef,
    productRef: normalizedRef,
    product_name: normalizedName,
    productName: normalizedName,
    deadline: normalizedDeadline,
    deadline_status: deadlineStatus,
    deadlineStatus,
    created_by_email: normalizedCreatedByEmail,
    createdByEmail: normalizedCreatedByEmail,
    is_archived: Boolean(rawProduct.is_archived),
    isArchived: Boolean(rawProduct.is_archived),
    archived_at: rawProduct.archived_at ?? null,
    archivedAt: rawProduct.archived_at ?? null,
    createdAt: rawProduct.createdAt ?? rawProduct.created_at ?? null,
    updatedAt: rawProduct.updatedAt ?? rawProduct.updated_at ?? null,
  }
}

function serializeProductWithElements(product, elements = []) {
  const serializedProduct = serializeProduct(product)
  const serializedElements = sortSerializedElements(
    elements.map((element) =>
      element &&
      Object.prototype.hasOwnProperty.call(element, 'productDevelopmentProductId') &&
      Object.prototype.hasOwnProperty.call(element, 'subElements')
        ? element
        : serializeElementWithSubElements(element),
    ),
  )

  return {
    ...serializedProduct,
    elements: serializedElements,
    element_count: serializedElements.length,
    elementCount: serializedElements.length,
  }
}

function sortSerializedProducts(products = []) {
  return [...products].sort((leftProduct, rightProduct) => {
    const leftDeadline = getTrimmedText(leftProduct?.deadline)
    const rightDeadline = getTrimmedText(rightProduct?.deadline)

    if (leftDeadline && rightDeadline && leftDeadline !== rightDeadline) {
      return leftDeadline.localeCompare(rightDeadline)
    }

    if (leftDeadline && !rightDeadline) {
      return -1
    }

    if (!leftDeadline && rightDeadline) {
      return 1
    }

    const leftCreatedAt = new Date(leftProduct?.createdAt || 0).getTime()
    const rightCreatedAt = new Date(rightProduct?.createdAt || 0).getTime()
    return rightCreatedAt - leftCreatedAt
  })
}

function buildWhereClause(options = {}) {
  const searchTerm = getTrimmedText(options.search)
  const deadlineStatus = getTrimmedText(
    options.deadline_status ?? options.deadlineStatus,
  ).toLowerCase()
  const referenceDate = getTodayDateOnly()
  const queryConditions = []

  if (searchTerm) {
    queryConditions.push({
      [Op.or]: [
        {
          product_ref: {
            [Op.iLike]: `%${searchTerm}%`,
          },
        },
        {
          product_name: {
            [Op.iLike]: `%${searchTerm}%`,
          },
        },
      ],
    })
  }

  if (deadlineStatus === 'due-today') {
    queryConditions.push({
      deadline: referenceDate,
    })
  }

  if (deadlineStatus === 'upcoming') {
    queryConditions.push({
      deadline: {
        [Op.gt]: referenceDate,
        [Op.lte]: addDays(referenceDate, 7),
      },
    })
  }

  if (deadlineStatus === 'scheduled') {
    queryConditions.push({
      deadline: {
        [Op.gt]: addDays(referenceDate, 7),
      },
    })
  }

  if (deadlineStatus === 'overdue') {
    queryConditions.push({
      deadline: {
        [Op.lt]: referenceDate,
      },
    })
  }

  if (deadlineStatus === 'no-deadline') {
    queryConditions.push({
      deadline: {
        [Op.is]: null,
      },
    })
  }

  if (queryConditions.length === 0) {
    return {}
  }

  if (queryConditions.length === 1) {
    return queryConditions[0]
  }

  return {
    [Op.and]: queryConditions,
  }
}

function buildArchiveWhereClause(options = {}) {
  const archivedOnly = normalizeBooleanFlag(
    options.archivedOnly ?? options.archived_only,
    false,
  )
  const includeArchived = normalizeBooleanFlag(
    options.includeArchived ?? options.include_archived,
    false,
  )

  if (archivedOnly) {
    return {
      is_archived: {
        [Op.eq]: true,
      },
    }
  }

  if (includeArchived) {
    return {}
  }

  return {
    [Op.or]: [
      {
        is_archived: {
          [Op.eq]: false,
        },
      },
      {
        is_archived: {
          [Op.is]: null,
        },
      },
    ],
  }
}

function buildCombinedWhereClause(options = {}) {
  const contentWhereClause = buildWhereClause(options)
  const archiveWhereClause = buildArchiveWhereClause(options)
  const clauses = [contentWhereClause, archiveWhereClause].filter(
    (clause) => clause && Object.keys(clause).length > 0,
  )

  if (clauses.length === 0) {
    return {}
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return {
    [Op.and]: clauses,
  }
}

function normalizeProductIdentifier(value) {
  const parsedIdentifier = Number.parseInt(String(value || ''), 10)

  if (!Number.isInteger(parsedIdentifier) || parsedIdentifier <= 0) {
    throw createHttpError(400, 'Invalid product identifier.')
  }

  return parsedIdentifier
}

function normalizeElementTitle(value) {
  const normalizedTitle = getTrimmedText(value)

  if (!normalizedTitle) {
    throw createHttpError(400, 'Element title is required.')
  }

  return normalizedTitle
}

function hasOwnPayloadField(payload, fieldName) {
  return Object.prototype.hasOwnProperty.call(payload || {}, fieldName)
}

async function getSubElementsByElementIds(elementIds = [], options = {}) {
  const normalizedIds = Array.from(
    new Set(
      elementIds
        .map((elementId) => Number.parseInt(String(elementId || ''), 10))
        .filter((elementId) => Number.isInteger(elementId) && elementId > 0),
    ),
  )

  if (normalizedIds.length === 0) {
    return new Map()
  }

  const subElements = await SubElementProductDesign.findAll({
    where: {
      element_product_design_id: {
        [Op.in]: normalizedIds,
      },
    },
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })

  const subElementsByElementId = new Map()

  for (const subElement of subElements) {
    const serializedSubElement = serializeSubElement(subElement)
    const elementId = Number(serializedSubElement.elementProductDesignId)

    if (!subElementsByElementId.has(elementId)) {
      subElementsByElementId.set(elementId, [])
    }

    subElementsByElementId.get(elementId).push(serializedSubElement)
  }

  for (const [elementId, serializedSubElements] of subElementsByElementId.entries()) {
    subElementsByElementId.set(elementId, sortSerializedSubElements(serializedSubElements))
  }

  return subElementsByElementId
}

async function ensureDefaultSubElementsForElements(elements = [], options = {}) {
  const normalizedElements = (Array.isArray(elements) ? elements : []).filter(Boolean)

  if (normalizedElements.length === 0) {
    return
  }

  const targetElements = normalizedElements.filter((element) => {
    const rawElement = element && typeof element.toJSON === 'function' ? element.toJSON() : element
    return getDefaultSubElementTitlesForElementTitle(rawElement?.title).length > 0
  })

  if (targetElements.length === 0) {
    return
  }

  await reconcileSamplesPrototypesSubElements(targetElements, options)

  const targetElementIds = targetElements
    .map((element) => Number.parseInt(String(element?.id || ''), 10))
    .filter((elementId) => Number.isInteger(elementId) && elementId > 0)

  const existingSubElements = await SubElementProductDesign.findAll({
    where: {
      element_product_design_id: {
        [Op.in]: targetElementIds,
      },
    },
    attributes: ['element_product_design_id', 'title'],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })

  const existingSubElementTitlesByElementId = new Map()

  existingSubElements.forEach((subElement) => {
    const elementId = Number(subElement.element_product_design_id)
    const normalizedTitle = getTrimmedText(subElement.title).toLowerCase()

    if (!existingSubElementTitlesByElementId.has(elementId)) {
      existingSubElementTitlesByElementId.set(elementId, new Set())
    }

    existingSubElementTitlesByElementId.get(elementId).add(normalizedTitle)
  })

  const missingSubElementsPayload = targetElements.flatMap((element) => {
    const rawElement = element && typeof element.toJSON === 'function' ? element.toJSON() : element
    const elementId = Number.parseInt(String(rawElement?.id || ''), 10)
    const existingTitles = existingSubElementTitlesByElementId.get(elementId) || new Set()

    return buildDefaultSubElementsPayload(elementId, rawElement?.title).filter(
      (subElementPayload) => !existingTitles.has(getTrimmedText(subElementPayload.title).toLowerCase()),
    )
  })

  if (missingSubElementsPayload.length === 0) {
    return
  }

  await SubElementProductDesign.bulkCreate(missingSubElementsPayload, {
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })
}

async function getElementsByProductIds(productIds = [], options = {}) {
  const normalizedIds = Array.from(
    new Set(
      productIds
        .map((productId) => Number.parseInt(String(productId || ''), 10))
        .filter((productId) => Number.isInteger(productId) && productId > 0),
    ),
  )

  if (normalizedIds.length === 0) {
    return new Map()
  }

  const elements = await ElementProductDesign.findAll({
    where: {
      product_development_product_id: {
        [Op.in]: normalizedIds,
      },
    },
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })
  await ensureDefaultSubElementsForElements(elements, options)
  const subElementsByElementId = await getSubElementsByElementIds(
    elements.map((element) => element.id),
    options,
  )
  const conversationMessageCountsByKey = await getProductDevelopmentConversationMessageCountLookup({
    elementIds: elements.map((element) => element.id),
    subElementIds: Array.from(subElementsByElementId.values()).flat().map((subElement) => subElement.id),
  })

  const elementsByProductId = new Map()

  for (const element of elements) {
    const serializedElement = serializeElementWithSubElements(
      element,
      subElementsByElementId.get(Number(element.id)) || [],
      {
        conversationMessageCountsByKey,
      },
    )
    const productId = Number(serializedElement.productDevelopmentProductId)

    if (!elementsByProductId.has(productId)) {
      elementsByProductId.set(productId, [])
    }

    elementsByProductId.get(productId).push(serializedElement)
  }

  for (const [productId, serializedElements] of elementsByProductId.entries()) {
    elementsByProductId.set(productId, sortSerializedElements(serializedElements))
  }

  return elementsByProductId
}

async function getSerializedProductById(productId, options = {}) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId, {
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  await ensureDefaultElementsForProductIds([normalizedProductId], options)
  const elementsByProductId = await getElementsByProductIds([normalizedProductId], options)
  return serializeProductWithElements(product, elementsByProductId.get(normalizedProductId) || [])
}

function buildDefaultElementsPayload(productId) {
  return DEFAULT_PRODUCT_ELEMENT_TITLES.map((title, index) => ({
    product_development_product_id: productId,
    title,
    display_order: index + 1,
    is_default: true,
    status: 'Not requested',
    validation: 'Not requested',
    development_time: 'Not requested',
    ext_inter: 'Not requested',
    design_type: 'Not requested',
  }))
}

async function ensureDefaultElementsForProductIds(productIds = [], options = {}) {
  const normalizedIds = Array.from(
    new Set(
      productIds
        .map((productId) => Number.parseInt(String(productId || ''), 10))
        .filter((productId) => Number.isInteger(productId) && productId > 0),
    ),
  )

  if (normalizedIds.length === 0) {
    return
  }

  const existingElements = await ElementProductDesign.findAll({
    where: {
      product_development_product_id: {
        [Op.in]: normalizedIds,
      },
    },
    attributes: ['product_development_product_id'],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })
  const productIdsWithElements = new Set(
    existingElements
      .map((element) => Number(element.product_development_product_id))
      .filter((productId) => Number.isInteger(productId) && productId > 0),
  )
  const missingProductIds = normalizedIds.filter((productId) => !productIdsWithElements.has(productId))

  if (missingProductIds.length === 0) {
    return
  }

  await ElementProductDesign.bulkCreate(
    missingProductIds.flatMap((productId) => buildDefaultElementsPayload(productId)),
    {
      ...(options.transaction ? { transaction: options.transaction } : {}),
    },
  )
}

async function getAllProducts(options = {}) {
  const products = await ProductDevelopmentProduct.findAll({
    where: buildCombinedWhereClause(options),
  })
  await ensureDefaultElementsForProductIds(products.map((product) => product.id))
  const elementsByProductId = await getElementsByProductIds(products.map((product) => product.id))

  return sortSerializedProducts(
    products.map((product) =>
      serializeProductWithElements(product, elementsByProductId.get(Number(product.id)) || []),
    ),
  )
}

async function createProduct(payload) {
  const normalizedProductRef = getTrimmedText(payload?.product_ref ?? payload?.productRef)
  const normalizedProductName = getTrimmedText(payload?.product_name ?? payload?.productName)
  const normalizedDeadline = normalizeDeadline(payload?.deadline ?? payload?.due_date ?? payload?.dueDate)
  const normalizedCreatedByEmail = normalizeOptionalEmail(
    payload?.created_by_email ?? payload?.createdByEmail,
  )

  if (!normalizedProductRef) {
    throw createHttpError(400, 'Product reference is required.')
  }

  if (!normalizedProductName) {
    throw createHttpError(400, 'Product name is required.')
  }

  const conflictingProduct = await ProductDevelopmentProduct.findOne({
    where: {
      product_ref: {
        [Op.iLike]: normalizedProductRef,
      },
    },
  })

  if (conflictingProduct) {
    throw createHttpError(409, 'A product with this reference already exists.')
  }

  const transaction = await ProductDevelopmentProduct.sequelize.transaction()

  try {
    const product = await ProductDevelopmentProduct.create(
      {
        product_ref: normalizedProductRef,
        product_name: normalizedProductName,
        deadline: normalizedDeadline,
        created_by_email: normalizedCreatedByEmail,
        is_archived: false,
        archived_at: null,
      },
      { transaction },
    )

    const createdElements = await ElementProductDesign.bulkCreate(
      buildDefaultElementsPayload(product.id),
      { transaction, returning: true },
    )
    await ensureDefaultSubElementsForElements(createdElements, { transaction })

    await transaction.commit()
    return getSerializedProductById(product.id)
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

async function updateProduct(productId, payload) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  const nextProductRef =
    getTrimmedText(payload?.product_ref ?? payload?.productRef) ||
    getTrimmedText(product.product_ref)
  const nextProductName =
    getTrimmedText(payload?.product_name ?? payload?.productName) ||
    getTrimmedText(product.product_name)
  const nextDeadline =
    Object.prototype.hasOwnProperty.call(payload || {}, 'deadline') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'due_date') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'dueDate')
      ? normalizeDeadline(payload?.deadline ?? payload?.due_date ?? payload?.dueDate)
      : getTrimmedText(product.deadline)
  const nextCreatedByEmail =
    Object.prototype.hasOwnProperty.call(payload || {}, 'created_by_email') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'createdByEmail')
      ? normalizeOptionalEmail(payload?.created_by_email ?? payload?.createdByEmail)
      : normalizeOptionalEmail(product.created_by_email)

  if (!nextProductRef) {
    throw createHttpError(400, 'Product reference is required.')
  }

  if (!nextProductName) {
    throw createHttpError(400, 'Product name is required.')
  }

  const conflictingProduct = await ProductDevelopmentProduct.findOne({
    where: {
      id: {
        [Op.ne]: normalizedProductId,
      },
      product_ref: {
        [Op.iLike]: nextProductRef,
      },
    },
  })

  if (conflictingProduct) {
    throw createHttpError(409, 'A product with this reference already exists.')
  }

  await product.update({
    product_ref: nextProductRef,
    product_name: nextProductName,
    deadline: nextDeadline,
    created_by_email: nextCreatedByEmail,
  })

  return getSerializedProductById(normalizedProductId)
}

async function createProductElement(productId, payload) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  const title = normalizeElementTitle(payload?.title ?? payload?.name)
  const dueDate = normalizeOptionalDate(payload?.due_date ?? payload?.dueDate)
  const existingElements = await ElementProductDesign.findAll({
    where: {
      product_development_product_id: normalizedProductId,
    },
    attributes: ['display_order'],
  })
  const nextDisplayOrder =
    existingElements.reduce((highestOrder, element) => {
      const elementOrder = getOptionalInteger(element.display_order)
      return Math.max(highestOrder, elementOrder ?? 0)
    }, 0) + 1

  const createdElement = await ElementProductDesign.create({
    product_development_product_id: normalizedProductId,
    title,
    display_order: nextDisplayOrder,
    is_default: false,
    due_date: dueDate,
    status: 'Not requested',
    validation: 'Not requested',
    development_time: 'Not requested',
    ext_inter: 'Not requested',
    design_type: 'Not requested',
  })
  await ensureDefaultSubElementsForElements([createdElement])

  return getSerializedProductById(normalizedProductId)
}

async function createProductSubElement(productId, elementId, payload) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const normalizedElementId = normalizeProductIdentifier(elementId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  const element = await ElementProductDesign.findOne({
    where: {
      id: normalizedElementId,
      product_development_product_id: normalizedProductId,
    },
  })

  if (!element) {
    throw createHttpError(404, 'Element not found.')
  }

  const title = normalizeSubElementTitle(payload?.title ?? payload?.name)
  const existingSubElements = await SubElementProductDesign.findAll({
    where: {
      element_product_design_id: normalizedElementId,
    },
    attributes: ['display_order'],
  })
  const nextDisplayOrder =
    existingSubElements.reduce((highestOrder, subElement) => {
      const subElementOrder = getOptionalInteger(subElement.display_order)
      return Math.max(highestOrder, subElementOrder ?? 0)
    }, 0) + 1

  await SubElementProductDesign.create({
    element_product_design_id: normalizedElementId,
    title,
    display_order: nextDisplayOrder,
    is_default: false,
    index: String(nextDisplayOrder).padStart(2, '0'),
    owner: normalizeOptionalText(payload?.owner),
    two_d: normalizeNullableBoolean(payload?.two_d ?? payload?.twoD, '2D'),
    three_d: normalizeNullableBoolean(payload?.three_d ?? payload?.threeD, '3D'),
    two_d_status: normalizeEnumValue(
      getTrimmedText(payload?.two_d_status ?? payload?.twoDStatus) || 'Not requested',
      SubElementProductDesign.TWO_D_STATUS_VALUES,
      {
        fieldLabel: '2D status',
        allowNull: false,
      },
    ),
    status_element: normalizeEnumValue(
      getTrimmedText(payload?.status_element ?? payload?.statusElement) || 'Not requested',
      SubElementProductDesign.STATUS_ELEMENT_VALUES,
      {
        fieldLabel: 'Sub-element status',
        allowNull: false,
      },
    ),
    schedule: normalizeOptionalSubElementSchedule(payload?.schedule),
    validator: normalizeOptionalText(payload?.validator),
    validation: normalizeEnumValue(
      getTrimmedText(payload?.validation) || 'Not requested',
      SubElementProductDesign.VALIDATION_VALUES,
      {
        fieldLabel: 'Validation',
        allowNull: false,
      },
    ),
    input: normalizeOptionalText(payload?.input),
    output: normalizeOptionalText(payload?.output),
    shared_to: normalizeEnumValue(
      getTrimmedText(payload?.shared_to ?? payload?.sharedTo) || 'Not requested',
      SubElementProductDesign.SHARED_TO_VALUES,
      {
        fieldLabel: 'Shared to',
        allowNull: false,
      },
    ),
    comment_change_index: normalizeOptionalText(
      payload?.comment_change_index ?? payload?.commentChangeIndex,
    ),
    number_hours: normalizeOptionalInteger(payload?.number_hours ?? payload?.numberHours, {
      fieldLabel: 'Number of hours',
      min: 0,
    }),
  })

  return getSerializedProductById(normalizedProductId)
}

async function findElementForUpdate(productId, elementId) {
  const normalizedElementId = normalizeProductIdentifier(elementId)

  if (productId !== undefined && productId !== null && productId !== '') {
    const normalizedProductId = normalizeProductIdentifier(productId)
    const scopedElement = await ElementProductDesign.findOne({
      where: {
        id: normalizedElementId,
        product_development_product_id: normalizedProductId,
      },
    })

    if (scopedElement) {
      return {
        element: scopedElement,
        productId: normalizedProductId,
      }
    }
  }

  const element = await ElementProductDesign.findByPk(normalizedElementId)

  if (!element) {
    throw createHttpError(404, 'Element not found.')
  }

  return {
    element,
    productId: normalizeProductIdentifier(element.product_development_product_id),
  }
}

async function findSubElementForUpdate(productId, elementId, subElementId) {
  const normalizedSubElementId = normalizeProductIdentifier(subElementId)

  if (productId !== undefined && productId !== null && productId !== '') {
    const normalizedProductId = normalizeProductIdentifier(productId)
    const normalizedElementId = normalizeProductIdentifier(elementId)

    const scopedSubElement = await SubElementProductDesign.findOne({
      where: {
        id: normalizedSubElementId,
        element_product_design_id: normalizedElementId,
      },
      include: [
        {
          model: ElementProductDesign,
          as: 'element',
          where: {
            product_development_product_id: normalizedProductId,
          },
          attributes: ['id', 'product_development_product_id'],
        },
      ],
    })

    if (scopedSubElement) {
      return {
        subElement: scopedSubElement,
        productId: normalizedProductId,
        elementId: normalizedElementId,
      }
    }
  }

  const subElement = await SubElementProductDesign.findByPk(normalizedSubElementId, {
    include: [
      {
        model: ElementProductDesign,
        as: 'element',
        attributes: ['id', 'product_development_product_id'],
      },
    ],
  })

  if (!subElement || !subElement.element) {
    throw createHttpError(404, 'Sub-element not found.')
  }

  return {
    subElement,
    productId: normalizeProductIdentifier(subElement.element.product_development_product_id),
    elementId: normalizeProductIdentifier(subElement.element.id),
  }
}

async function updateProductElement(productId, elementId, payload) {
  const { element, productId: resolvedProductId } = await findElementForUpdate(
    productId,
    elementId,
  )

  const updateData = {}

  if (hasOwnPayloadField(payload, 'title') || hasOwnPayloadField(payload, 'name')) {
    updateData.title = normalizeRequiredText(payload?.title ?? payload?.name, 'Element title')
  }

  if (hasOwnPayloadField(payload, 'display_order') || hasOwnPayloadField(payload, 'displayOrder')) {
    const normalizedDisplayOrder = normalizeOptionalInteger(
      payload?.display_order ?? payload?.displayOrder,
      {
        fieldLabel: 'Display order',
        min: 0,
      },
    )
    updateData.display_order = normalizedDisplayOrder ?? 0
  }

  if (hasOwnPayloadField(payload, 'is_default') || hasOwnPayloadField(payload, 'isDefault')) {
    updateData.is_default = normalizeBooleanFlag(
      payload?.is_default ?? payload?.isDefault,
      false,
    )
  }

  if (hasOwnPayloadField(payload, 'due_date') || hasOwnPayloadField(payload, 'dueDate')) {
    updateData.due_date = normalizeOptionalDate(payload?.due_date ?? payload?.dueDate)
  }

  if (hasOwnPayloadField(payload, 'ext_inter') || hasOwnPayloadField(payload, 'extInter')) {
    updateData.ext_inter = normalizeEnumValue(
      payload?.ext_inter ?? payload?.extInter,
      ElementProductDesign.EXT_INTER_STATUS_VALUES,
      {
        fieldLabel: 'Ext / Inter',
        allowNull: true,
      },
    )
  }

  if (hasOwnPayloadField(payload, 'creation_date') || hasOwnPayloadField(payload, 'creationDate')) {
    updateData.creation_date = normalizeOptionalDate(
      payload?.creation_date ?? payload?.creationDate,
    )
  }

  if (hasOwnPayloadField(payload, 'design_type') || hasOwnPayloadField(payload, 'designType')) {
    updateData.design_type = normalizeEnumValue(
      payload?.design_type ?? payload?.designType,
      ElementProductDesign.DESIGN_TYPE_VALUES,
      {
        fieldLabel: 'Design type',
        allowNull: false,
      },
    )
  }

  if (hasOwnPayloadField(payload, 'designer')) {
    updateData.designer = normalizeOptionalText(payload?.designer)
  }

  if (hasOwnPayloadField(payload, 'status')) {
    updateData.status = normalizeEnumValue(payload?.status, ElementProductDesign.STATUS_VALUES, {
      fieldLabel: 'Status',
      allowNull: false,
    })
  }

  if (
    hasOwnPayloadField(payload, 'iteration_time') ||
    hasOwnPayloadField(payload, 'iterationTime') ||
    hasOwnPayloadField(payload, 'limit_date') ||
    hasOwnPayloadField(payload, 'limitDate') ||
    hasOwnPayloadField(payload, 'start_date') ||
    hasOwnPayloadField(payload, 'startDate') ||
    hasOwnPayloadField(payload, 'end_date') ||
    hasOwnPayloadField(payload, 'endDate') ||
    hasOwnPayloadField(payload, 'finish_date') ||
    hasOwnPayloadField(payload, 'finishDate')
  ) {
    updateData.iteration_time = normalizeOptionalIterationTime(
      payload?.iteration_time ??
        payload?.iterationTime ??
        {
          limitDate:
            payload?.limit_date ?? payload?.limitDate ?? payload?.start_date ?? payload?.startDate,
          endDate:
            payload?.end_date ?? payload?.endDate ?? payload?.finish_date ?? payload?.finishDate,
        },
    )
  }

  if (hasOwnPayloadField(payload, 'leader')) {
    updateData.leader = normalizeOptionalText(payload?.leader)
  }

  if (hasOwnPayloadField(payload, 'validation')) {
    updateData.validation = normalizeEnumValue(
      payload?.validation,
      ElementProductDesign.VALIDATION_STATUS_VALUES,
      {
        fieldLabel: 'Validation',
        allowNull: false,
      },
    )
  }

  if (
    hasOwnPayloadField(payload, 'development_time') ||
    hasOwnPayloadField(payload, 'developmentTime')
  ) {
    updateData.development_time = normalizeEnumValue(
      payload?.development_time ?? payload?.developmentTime,
      ElementProductDesign.DEVELOPMENT_TIME_VALUES,
      {
        fieldLabel: 'Development time',
        allowNull: false,
      },
    )
  }

  if (
    hasOwnPayloadField(payload, 'iteration_goals') ||
    hasOwnPayloadField(payload, 'iterationGoals')
  ) {
    updateData.iteration_goals = normalizeOptionalInteger(
      payload?.iteration_goals ?? payload?.iterationGoals,
      {
        fieldLabel: 'Iteration goals',
        min: 0,
      },
    )
  }

  if (
    hasOwnPayloadField(payload, 'design_review_accepted') ||
    hasOwnPayloadField(payload, 'designReviewAccepted')
  ) {
    updateData.design_review_accepted = normalizeNullableBoolean(
      payload?.design_review_accepted ?? payload?.designReviewAccepted,
      'Review accepted',
    )
  }

  if (
    hasOwnPayloadField(payload, 'design_need_to_be_reviewed') ||
    hasOwnPayloadField(payload, 'designNeedToBeReviewed')
  ) {
    updateData.design_need_to_be_reviewed = normalizeNullableBoolean(
      payload?.design_need_to_be_reviewed ?? payload?.designNeedToBeReviewed,
      'Need review',
    )
  }

  if (hasOwnPayloadField(payload, 'iteration_note') || hasOwnPayloadField(payload, 'iterationNote')) {
    updateData.iteration_note = normalizeOptionalInteger(
      payload?.iteration_note ?? payload?.iterationNote,
      {
        fieldLabel: 'Iteration note',
      },
    )
  }

  if (hasOwnPayloadField(payload, 'formula')) {
    updateData.formula = normalizeOptionalText(payload?.formula)
  }

  if (hasOwnPayloadField(payload, 'status_note') || hasOwnPayloadField(payload, 'statusNote')) {
    updateData.status_note = normalizeEnumValue(
      payload?.status_note ?? payload?.statusNote,
      ElementProductDesign.NOTE_STATUS_VALUES,
      {
        fieldLabel: 'Status note',
        allowNull: true,
      },
    )
  }

  if (
    hasOwnPayloadField(payload, 'customer_due_date') ||
    hasOwnPayloadField(payload, 'customerDueDate')
  ) {
    updateData.customer_due_date = normalizeEnumValue(
      payload?.customer_due_date ?? payload?.customerDueDate,
      ElementProductDesign.CUSTOMER_DUE_DATE_STATUS_VALUES,
      {
        fieldLabel: 'Customer due date',
        allowNull: true,
      },
    )
  }

  if (Object.keys(updateData).length === 0) {
    return getSerializedProductById(resolvedProductId)
  }

  await element.update(updateData)

  return getSerializedProductById(resolvedProductId)
}

async function updateElement(elementId, payload) {
  const { element, productId } = await findElementForUpdate(null, elementId)

  return updateProductElement(productId, element.id, payload)
}

async function updateProductSubElement(productId, elementId, subElementId, payload) {
  const {
    subElement,
    productId: resolvedProductId,
  } = await findSubElementForUpdate(productId, elementId, subElementId)
  const updateData = {}

  if (hasOwnPayloadField(payload, 'title') || hasOwnPayloadField(payload, 'name')) {
    updateData.title = normalizeSubElementTitle(payload?.title ?? payload?.name)
  }

  if (hasOwnPayloadField(payload, 'display_order') || hasOwnPayloadField(payload, 'displayOrder')) {
    updateData.display_order =
      normalizeOptionalInteger(payload?.display_order ?? payload?.displayOrder, {
        fieldLabel: 'Display order',
        min: 0,
      }) ?? 0
    updateData.index = String(updateData.display_order).padStart(2, '0')
  }

  if (hasOwnPayloadField(payload, 'is_default') || hasOwnPayloadField(payload, 'isDefault')) {
    updateData.is_default = normalizeBooleanFlag(payload?.is_default ?? payload?.isDefault, false)
  }

  if (hasOwnPayloadField(payload, 'index')) {
    updateData.index = normalizeOptionalText(payload?.index)
  }

  if (hasOwnPayloadField(payload, 'owner')) {
    updateData.owner = normalizeOptionalText(payload?.owner)
  }

  if (hasOwnPayloadField(payload, 'two_d') || hasOwnPayloadField(payload, 'twoD')) {
    updateData.two_d = normalizeNullableBoolean(payload?.two_d ?? payload?.twoD, '2D')
  }

  if (hasOwnPayloadField(payload, 'three_d') || hasOwnPayloadField(payload, 'threeD')) {
    updateData.three_d = normalizeNullableBoolean(payload?.three_d ?? payload?.threeD, '3D')
  }

  if (hasOwnPayloadField(payload, 'two_d_status') || hasOwnPayloadField(payload, 'twoDStatus')) {
    updateData.two_d_status = normalizeEnumValue(
      payload?.two_d_status ?? payload?.twoDStatus,
      SubElementProductDesign.TWO_D_STATUS_VALUES,
      {
        fieldLabel: '2D status',
        allowNull: true,
      },
    )
  }

  if (
    hasOwnPayloadField(payload, 'status_element') ||
    hasOwnPayloadField(payload, 'statusElement')
  ) {
    updateData.status_element = normalizeEnumValue(
      payload?.status_element ?? payload?.statusElement,
      SubElementProductDesign.STATUS_ELEMENT_VALUES,
      {
        fieldLabel: 'Sub-element status',
        allowNull: true,
      },
    )
  }

  if (hasOwnPayloadField(payload, 'schedule')) {
    updateData.schedule = normalizeOptionalSubElementSchedule(payload?.schedule)
  }

  if (hasOwnPayloadField(payload, 'validator')) {
    updateData.validator = normalizeOptionalText(payload?.validator)
  }

  if (hasOwnPayloadField(payload, 'validation')) {
    updateData.validation = normalizeEnumValue(
      payload?.validation,
      SubElementProductDesign.VALIDATION_VALUES,
      {
        fieldLabel: 'Validation',
        allowNull: true,
      },
    )
  }

  if (hasOwnPayloadField(payload, 'input')) {
    updateData.input = normalizeOptionalText(payload?.input)
  }

  if (hasOwnPayloadField(payload, 'output')) {
    updateData.output = normalizeOptionalText(payload?.output)
  }

  if (hasOwnPayloadField(payload, 'shared_to') || hasOwnPayloadField(payload, 'sharedTo')) {
    updateData.shared_to = normalizeEnumValue(
      payload?.shared_to ?? payload?.sharedTo,
      SubElementProductDesign.SHARED_TO_VALUES,
      {
        fieldLabel: 'Shared to',
        allowNull: true,
      },
    )
  }

  if (
    hasOwnPayloadField(payload, 'comment_change_index') ||
    hasOwnPayloadField(payload, 'commentChangeIndex')
  ) {
    updateData.comment_change_index = normalizeOptionalText(
      payload?.comment_change_index ?? payload?.commentChangeIndex,
    )
  }

  if (hasOwnPayloadField(payload, 'number_hours') || hasOwnPayloadField(payload, 'numberHours')) {
    updateData.number_hours = normalizeOptionalInteger(
      payload?.number_hours ?? payload?.numberHours,
      {
        fieldLabel: 'Number of hours',
        min: 0,
      },
    )
  }

  if (Object.keys(updateData).length === 0) {
    return getSerializedProductById(resolvedProductId)
  }

  await subElement.update(updateData)

  return getSerializedProductById(resolvedProductId)
}

async function updateSubElement(subElementId, payload) {
  const {
    subElement,
    productId,
    elementId,
  } = await findSubElementForUpdate(null, null, subElementId)

  return updateProductSubElement(productId, elementId, subElement.id, payload)
}

async function resequenceProductElements(productId, options = {}) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const elements = await ElementProductDesign.findAll({
    where: {
      product_development_product_id: normalizedProductId,
    },
    order: [
      ['display_order', 'ASC'],
      ['created_at', 'ASC'],
      ['id', 'ASC'],
    ],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })

  for (const [index, element] of elements.entries()) {
    const nextDisplayOrder = index + 1

    if (getOptionalInteger(element.display_order) === nextDisplayOrder) {
      continue
    }

    await element.update(
      {
        display_order: nextDisplayOrder,
      },
      {
        ...(options.transaction ? { transaction: options.transaction } : {}),
      },
    )
  }
}

async function resequenceElementSubElements(elementId, options = {}) {
  const normalizedElementId = normalizeProductIdentifier(elementId)
  const subElements = await SubElementProductDesign.findAll({
    where: {
      element_product_design_id: normalizedElementId,
    },
    order: [
      ['display_order', 'ASC'],
      ['created_at', 'ASC'],
      ['id', 'ASC'],
    ],
    ...(options.transaction ? { transaction: options.transaction } : {}),
  })

  for (const [index, subElement] of subElements.entries()) {
    const nextDisplayOrder = index + 1
    const nextIndex = String(nextDisplayOrder).padStart(2, '0')

    if (
      getOptionalInteger(subElement.display_order) === nextDisplayOrder &&
      getTrimmedText(subElement.index) === nextIndex
    ) {
      continue
    }

    await subElement.update(
      {
        display_order: nextDisplayOrder,
        index: nextIndex,
      },
      {
        ...(options.transaction ? { transaction: options.transaction } : {}),
      },
    )
  }
}

async function deleteProductElement(productId, elementId) {
  const { element, productId: resolvedProductId } = await findElementForUpdate(productId, elementId)
  const transaction = await ProductDevelopmentProduct.sequelize.transaction()

  try {
    await element.destroy({ transaction })
    await resequenceProductElements(resolvedProductId, { transaction })

    await transaction.commit()
    return getSerializedProductById(resolvedProductId)
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

async function deleteElement(elementId) {
  const { element, productId } = await findElementForUpdate(null, elementId)
  return deleteProductElement(productId, element.id)
}

async function deleteProductSubElement(productId, elementId, subElementId) {
  const {
    subElement,
    productId: resolvedProductId,
    elementId: resolvedElementId,
  } = await findSubElementForUpdate(productId, elementId, subElementId)
  const transaction = await ProductDevelopmentProduct.sequelize.transaction()

  try {
    await subElement.destroy({ transaction })
    await resequenceElementSubElements(resolvedElementId, { transaction })

    await transaction.commit()
    return getSerializedProductById(resolvedProductId)
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

async function deleteSubElement(subElementId) {
  const {
    subElement,
    productId,
    elementId,
  } = await findSubElementForUpdate(null, null, subElementId)

  return deleteProductSubElement(productId, elementId, subElement.id)
}

async function deleteProduct(productId) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const serializedProduct = await getSerializedProductById(normalizedProductId)
  const transaction = await ProductDevelopmentProduct.sequelize.transaction()

  try {
    await ElementProductDesign.destroy({
      where: {
        product_development_product_id: normalizedProductId,
      },
      transaction,
    })

    await ProductDevelopmentProduct.destroy({
      where: {
        id: normalizedProductId,
      },
      transaction,
    })

    await transaction.commit()
    return serializedProduct
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

async function archiveProduct(productId) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  await product.update({
    is_archived: true,
    archived_at: new Date(),
  })

  return getSerializedProductById(normalizedProductId)
}

async function restoreProduct(productId) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  await product.update({
    is_archived: false,
    archived_at: null,
  })

  return getSerializedProductById(normalizedProductId)
}

module.exports = {
  DEFAULT_PRODUCT_ELEMENT_TITLES,
  DEFAULT_PRODUCT_SUB_ELEMENT_TEMPLATES,
  getAllProducts,
  createProduct,
  updateProduct,
  createProductElement,
  createProductSubElement,
  updateProductElement,
  updateElement,
  updateProductSubElement,
  updateSubElement,
  deleteProductElement,
  deleteElement,
  deleteProductSubElement,
  deleteSubElement,
  deleteProduct,
  archiveProduct,
  restoreProduct,
}
