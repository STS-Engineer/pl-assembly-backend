const Rfq = require('../models/rfq.model')
const RfqCosting = require('../models/rfq-costing.model')

const PLANT_VALUES = [
  'Monterry',
  'Amiens',
  'Chennai',
  'Daegu',
  'ElFahs',
  'Frankfurt',
  'Poitiers',
  'Tianjin',
]

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getTrimmedText(value) {
  return String(value || '').trim()
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
    createdAt: rawCosting.createdAt ?? rawCosting.created_at ?? null,
    updatedAt: rawCosting.updatedAt ?? rawCosting.updated_at ?? null,
  }
}

function serializeRfq(rfq) {
  const rawRfq = rfq && typeof rfq.toJSON === 'function' ? rfq.toJSON() : rfq || {}

  return {
    ...rawRfq,
    costings: Array.isArray(rawRfq.costings) ? rawRfq.costings.map(serializeRfqCosting) : [],
  }
}

async function getAllRfqs() {
  const rfqs = await Rfq.findAll({
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
  })

  return rfqs.map(serializeRfq)
}

async function createRfq(payload) {
  const normalizedRfqId = getTrimmedText(payload?.rfq_id)

  if (!normalizedRfqId) {
    throw createHttpError(400, 'RFQ identifier is required.')
  }

  const existingRfq = await Rfq.findByPk(normalizedRfqId)

  if (existingRfq) {
    throw createHttpError(409, 'RFQ already exists.')
  }

  const rfq = await Rfq.create({
    rfq_id: normalizedRfqId,
    rfq_data: normalizeRfqData(normalizedRfqId, payload?.rfq_data),
  })

  return serializeRfq({
    ...rfq.toJSON(),
    costings: [],
  })
}

async function createRfqCosting(rfqId, payload) {
  const normalizedRfqId = getTrimmedText(rfqId)
  const normalizedType = getTrimmedText(payload?.type)
  const normalizedReference = getTrimmedText(payload?.reference)
  const normalizedProductFamily = getTrimmedText(payload?.product_family)
  const normalizedPlant = getTrimmedText(payload?.plant)

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

  const rfq = await Rfq.findByPk(normalizedRfqId)

  if (!rfq) {
    throw createHttpError(404, 'RFQ not found.')
  }

  const costing = await RfqCosting.create({
    rfq_id: normalizedRfqId,
    type: normalizedType,
    reference: normalizedReference,
    product_family: normalizedProductFamily,
    plant: normalizedPlant,
  })

  return serializeRfqCosting(costing)
}

module.exports = {
  getAllRfqs,
  createRfq,
  createRfqCosting,
}
