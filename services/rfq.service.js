const { Op } = require('sequelize')
const Rfq = require('../models/rfq.model')
const RfqCosting = require('../models/rfq-costing.model')
const SalesRep = require('../models/sales_reps')

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

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value === 'boolean') {
    return value
  }

  const normalizedValue = String(value).trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalizedValue)
}

function getTrimmedText(value) {
  return String(value || '').trim()
}

function normalizeOptionalEmail(value) {
  return getTrimmedText(value).toLowerCase() || null
}

function serializeSalesRep(salesRep) {
  const rawSalesRep =
    salesRep && typeof salesRep.toJSON === 'function' ? salesRep.toJSON() : salesRep || {}

  return {
    id: rawSalesRep.id ?? null,
    full_name: getTrimmedText(rawSalesRep.full_name) || null,
    fullName: getTrimmedText(rawSalesRep.full_name) || null,
    email: normalizeOptionalEmail(rawSalesRep.email),
    dept: getTrimmedText(rawSalesRep.dept) || null,
    localisation: getTrimmedText(rawSalesRep.localisation) || null,
    region: getTrimmedText(rawSalesRep.region) || null,
    attached_plant: getTrimmedText(rawSalesRep.attached_plant) || null,
  }
}

function buildSalesRepLookupMap(salesReps = []) {
  return (Array.isArray(salesReps) ? salesReps : []).reduce((lookupMap, salesRep) => {
    const normalizedSalesRep = serializeSalesRep(salesRep)

    if (normalizedSalesRep.email) {
      lookupMap.set(normalizedSalesRep.email, normalizedSalesRep)
    }

    return lookupMap
  }, new Map())
}

function normalizeOptionalLink(value) {
  return getTrimmedText(value) || null
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

async function findRfqByIdentifier(rfqIdentifier) {
  const normalizedIdentifier = getTrimmedText(rfqIdentifier)

  if (!normalizedIdentifier) {
    return null
  }

  const rfqByPrimaryKey = await Rfq.findByPk(normalizedIdentifier)

  if (rfqByPrimaryKey) {
    return rfqByPrimaryKey
  }

  return Rfq.findOne({
    where: {
      rfq_data: {
        systematic_rfq_id: normalizedIdentifier,
      },
    },
  })
}

function supportsCostingLink(costingType) {
  return ['Initial Costing', 'Improved Costing', 'Last Call Costing'].includes(
    getTrimmedText(costingType),
  )
}

function normalizeRfqData(rfqId, value) {
  const rawValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalizedEntries = Object.entries(rawValue).map(([key, entryValue]) => [
    key,
    typeof entryValue === 'string' ? entryValue.trim() : entryValue,
  ])
  const normalizedData = Object.fromEntries(normalizedEntries)
  const normalizedReference = getTrimmedText(normalizedData.systematic_rfq_id) || rfqId

  return {
    ...normalizedData,
    systematic_rfq_id: normalizedReference,
  }
}

function serializeRfqCosting(costing) {
  const rawCosting =
    costing && typeof costing.toJSON === 'function' ? costing.toJSON() : costing || {}

  return {
    id: rawCosting.id,
    rfq_id: rawCosting.rfq_id,
    type: rawCosting.type,
    product_family: rawCosting.product_family,
    plant: rawCosting.plant,
    reference: rawCosting.reference,
    due_date: rawCosting.due_date ?? null,
    dueDate: rawCosting.due_date ?? null,
    link: rawCosting.link ?? null,
    createdAt: rawCosting.createdAt ?? rawCosting.created_at ?? null,
    updatedAt: rawCosting.updatedAt ?? rawCosting.updated_at ?? null,
  }
}

function serializeRfq(rfq, salesRepsByEmail = null) {
  const rawRfq = rfq && typeof rfq.toJSON === 'function' ? rfq.toJSON() : rfq || {}
  const normalizedCommercialEmail = normalizeOptionalEmail(rawRfq.created_by_email)
  const matchedSalesRep =
    salesRepsByEmail instanceof Map && normalizedCommercialEmail
      ? salesRepsByEmail.get(normalizedCommercialEmail) || null
      : null

  return {
    ...rawRfq,
    created_by_email: normalizedCommercialEmail,
    createdByEmail: normalizedCommercialEmail,
    commercial_name: matchedSalesRep?.full_name || null,
    commercialName: matchedSalesRep?.full_name || null,
    is_archived: Boolean(rawRfq.is_archived),
    isArchived: Boolean(rawRfq.is_archived),
    archived_at: rawRfq.archived_at ?? null,
    archivedAt: rawRfq.archived_at ?? null,
    costings: Array.isArray(rawRfq.costings) ? rawRfq.costings.map(serializeRfqCosting) : [],
  }
}

function buildRfqArchiveWhereClause(options = {}) {
  const archivedOnly = normalizeBooleanFlag(options.archivedOnly, false)
  const includeArchived = normalizeBooleanFlag(options.includeArchived, false)

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

async function getSalesRepOptions() {
  const salesReps = await SalesRep.findAll({
    attributes: ['id', 'dept', 'full_name', 'email', 'localisation', 'region', 'attached_plant'],
    where: {
      email: {
        [Op.not]: null,
      },
    },
    order: [
      ['full_name', 'ASC'],
      ['email', 'ASC'],
    ],
  })

  return salesReps
    .map((salesRep) => serializeSalesRep(salesRep))
    .filter((salesRep) => salesRep.email)
}

async function findSalesRepByEmail(normalizedCommercialEmail) {
  if (!normalizedCommercialEmail) {
    return null
  }

  return SalesRep.findOne({
    where: {
      email: {
        [Op.iLike]: normalizedCommercialEmail,
      },
    },
    attributes: ['id', 'email', 'full_name'],
  })
}

async function getAllRfqs(options = {}) {
  const [rfqs, salesReps] = await Promise.all([
    Rfq.findAll({
      where: buildRfqArchiveWhereClause(options),
      attributes: [
        'rfq_id',
        'rfq_data',
        'created_by_email',
        'is_archived',
        'archived_at',
        'createdAt',
        'updatedAt',
      ],
      include: [
        {
          model: RfqCosting,
          as: 'costings',
          required: false,
          attributes: [
            'id',
            'rfq_id',
            'type',
            'product_family',
            'plant',
            'reference',
            'due_date',
            'link',
            'createdAt',
            'updatedAt',
          ],
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['rfq_id', 'ASC'],
        [{ model: RfqCosting, as: 'costings' }, 'createdAt', 'ASC'],
        [{ model: RfqCosting, as: 'costings' }, 'id', 'ASC'],
      ],
    }),
    getSalesRepOptions(),
  ])
  const salesRepsByEmail = buildSalesRepLookupMap(salesReps)

  return rfqs.map((rfq) => serializeRfq(rfq, salesRepsByEmail))
}

async function createRfq(payload) {
  const normalizedRfqId = getTrimmedText(payload?.rfq_id)
  const normalizedCommercialEmail = normalizeOptionalEmail(
    payload?.created_by_email ??
      payload?.createdByEmail ??
      payload?.commercial ??
      payload?.rfq_data?.created_by_email ??
      payload?.rfq_data?.commercial,
  )

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  if (!normalizedCommercialEmail) {
    throw createHttpError(400, 'Commercial email is required.')
  }

  const matchingSalesRep = await findSalesRepByEmail(normalizedCommercialEmail)

  if (!matchingSalesRep) {
    throw createHttpError(400, 'Selected commercial was not found.')
  }

  const existingRfq = await Rfq.findByPk(normalizedRfqId)

  if (existingRfq) {
    throw createHttpError(409, 'RFQ already exists.')
  }

  const rfq = await Rfq.create({
    rfq_id: normalizedRfqId,
    rfq_data: normalizeRfqData(normalizedRfqId, payload?.rfq_data),
    created_by_email: normalizedCommercialEmail,
    is_archived: false,
    archived_at: null,
  })

  return serializeRfq({
    ...rfq.toJSON(),
    costings: [],
  }, buildSalesRepLookupMap([matchingSalesRep]))
}

async function updateRfq(rfqId, payload) {
  const normalizedRfqId = getTrimmedText(rfqId)

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  const rfq = await findRfqByIdentifier(normalizedRfqId)

  if (!rfq) {
    throw createHttpError(404, 'RFQ not found.')
  }

  const currentRfqData =
    rfq.rfq_data && typeof rfq.rfq_data === 'object' && !Array.isArray(rfq.rfq_data)
      ? rfq.rfq_data
      : {}
  const nextRfqId =
    getTrimmedText(payload?.rfq_id ?? payload?.reference ?? payload?.rfq_data?.systematic_rfq_id) ||
    getTrimmedText(rfq.rfq_id)
  const requestedCommercialEmail = normalizeOptionalEmail(
    payload?.created_by_email ??
      payload?.createdByEmail ??
      payload?.commercial ??
      payload?.rfq_data?.created_by_email ??
      payload?.rfq_data?.createdByEmail ??
      payload?.rfq_data?.commercial,
  )
  const normalizedCommercialEmail =
    requestedCommercialEmail || normalizeOptionalEmail(rfq.created_by_email)

  if (!nextRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  if (!normalizedCommercialEmail) {
    throw createHttpError(400, 'Commercial email is required.')
  }

  const matchingSalesRep = await findSalesRepByEmail(normalizedCommercialEmail)

  if (!matchingSalesRep) {
    throw createHttpError(400, 'Selected commercial was not found.')
  }

  if (nextRfqId !== getTrimmedText(rfq.rfq_id)) {
    const conflictingRfq = await Rfq.findByPk(nextRfqId)

    if (conflictingRfq && getTrimmedText(conflictingRfq.rfq_id) !== getTrimmedText(rfq.rfq_id)) {
      throw createHttpError(409, 'RFQ already exists.')
    }
  }

  const requestedRfqData =
    payload?.rfq_data && typeof payload.rfq_data === 'object' && !Array.isArray(payload.rfq_data)
      ? payload.rfq_data
      : {}
  const hasCustomerNameField =
    Object.prototype.hasOwnProperty.call(requestedRfqData, 'customer_name') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'customer_name') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'customerName')
  const hasProjectNameField =
    Object.prototype.hasOwnProperty.call(requestedRfqData, 'project_name') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'project_name') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'projectName')
  const hasCurrencyField =
    Object.prototype.hasOwnProperty.call(requestedRfqData, 'target_price_currency') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'target_price_currency') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'targetPriceCurrency') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'currency')

  const nextCustomerName = getTrimmedText(
    requestedRfqData.customer_name ?? payload?.customer_name ?? payload?.customerName,
  )
  const nextProjectName = getTrimmedText(
    requestedRfqData.project_name ?? payload?.project_name ?? payload?.projectName,
  )
  const nextCurrency = getTrimmedText(
    requestedRfqData.target_price_currency ??
      payload?.target_price_currency ??
      payload?.targetPriceCurrency ??
      payload?.currency,
  )

  const nextRfqData = normalizeRfqData(nextRfqId, {
    ...currentRfqData,
    ...requestedRfqData,
    systematic_rfq_id: nextRfqId,
    commercial: normalizedCommercialEmail,
    ...(hasCustomerNameField ? { customer_name: nextCustomerName } : {}),
    ...(hasProjectNameField ? { project_name: nextProjectName } : {}),
    ...(hasCurrencyField ? { target_price_currency: nextCurrency || 'EUR' } : {}),
  })

  await rfq.update({
    rfq_id: nextRfqId,
    rfq_data: nextRfqData,
    created_by_email: normalizedCommercialEmail,
  })

  const updatedRfq = await Rfq.findByPk(nextRfqId, {
    include: [
      {
        model: RfqCosting,
        as: 'costings',
        required: false,
      },
    ],
  })

  return serializeRfq(updatedRfq || rfq, buildSalesRepLookupMap([matchingSalesRep]))
}

async function createRfqCosting(rfqId, payload) {
  const normalizedRfqId = getTrimmedText(rfqId)
  const normalizedType = getTrimmedText(payload?.type)
  const normalizedReference = getTrimmedText(payload?.reference)
  const normalizedProductFamily = getTrimmedText(payload?.product_family)
  const normalizedPlant = getTrimmedText(payload?.plant)
  const normalizedDueDate = normalizeOptionalDate(
    payload?.due_date ?? payload?.dueDate ?? payload?.echeance ?? payload?.echeances,
  )
  const normalizedLink = normalizeOptionalLink(payload?.link ?? payload?.url ?? payload?.lien)

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  if (!RfqCosting.COSTING_TYPE_VALUES.includes(normalizedType)) {
    throw createHttpError(400, 'Invalid costing stage.')
  }

  if (!normalizedReference) {
    throw createHttpError(400, 'Reference is required.')
  }

  if (!RfqCosting.PRODUCT_FAMILY_VALUES.includes(normalizedProductFamily)) {
    throw createHttpError(400, 'Invalid product family.')
  }

  if (!PLANT_VALUES.includes(normalizedPlant)) {
    throw createHttpError(400, 'Invalid plant.')
  }

  const rfq = await findRfqByIdentifier(normalizedRfqId)

  if (!rfq) {
    throw createHttpError(404, 'RFQ not found.')
  }

  if (rfq.is_archived) {
    throw createHttpError(409, 'This RFQ is archived. Restore it before adding a costing.')
  }

  const costing = await RfqCosting.create({
    rfq_id: normalizedRfqId,
    type: normalizedType,
    reference: normalizedReference,
    product_family: normalizedProductFamily,
    plant: normalizedPlant,
    due_date: normalizedDueDate,
    link: supportsCostingLink(normalizedType) ? normalizedLink : null,
  })

  return serializeRfqCosting(costing)
}

async function archiveRfq(rfqId) {
  const normalizedRfqId = getTrimmedText(rfqId)

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  const rfq = await findRfqByIdentifier(normalizedRfqId)

  if (!rfq) {
    throw createHttpError(404, 'RFQ not found.')
  }

  await rfq.update({
    is_archived: true,
    archived_at: rfq.archived_at || new Date(),
  })

  const salesRepsByEmail = buildSalesRepLookupMap(await getSalesRepOptions())
  return serializeRfq(rfq, salesRepsByEmail)
}

async function restoreRfq(rfqId) {
  const normalizedRfqId = getTrimmedText(rfqId)

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  const rfq = await findRfqByIdentifier(normalizedRfqId)

  if (!rfq) {
    throw createHttpError(404, 'RFQ not found.')
  }

  await rfq.update({
    is_archived: false,
    archived_at: null,
  })

  const salesRepsByEmail = buildSalesRepLookupMap(await getSalesRepOptions())
  return serializeRfq(rfq, salesRepsByEmail)
}

module.exports = {
  getAllRfqs,
  getSalesRepOptions,
  createRfq,
  updateRfq,
  createRfqCosting,
  archiveRfq,
  restoreRfq,
}
