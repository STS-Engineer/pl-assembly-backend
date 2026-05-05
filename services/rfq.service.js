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

async function getAllRfqs(options = {}) {
  const [rfqs, salesReps] = await Promise.all([
    Rfq.findAll({
      where: buildRfqArchiveWhereClause(options),
      include: [
        {
          model: RfqCosting,
          as: 'costings',
          required: false,
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

  const matchingSalesRep = await SalesRep.findOne({
    where: {
      email: {
        [Op.iLike]: normalizedCommercialEmail,
      },
    },
    attributes: ['id', 'email', 'full_name'],
  })

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

async function createRfqCosting(rfqId, payload) {
  const normalizedRfqId = getTrimmedText(rfqId)
  const normalizedType = getTrimmedText(payload?.type)
  const normalizedReference = getTrimmedText(payload?.reference)
  const normalizedProductFamily = getTrimmedText(payload?.product_family)
  const normalizedPlant = getTrimmedText(payload?.plant)
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
  createRfqCosting,
  archiveRfq,
  restoreRfq,
}
