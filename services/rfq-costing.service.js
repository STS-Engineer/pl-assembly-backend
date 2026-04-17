const RfqCosting = require('../models/rfq-costing.model')
const Rfq = require('../models/rfq.model')

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

async function getAllRfqCostings() {
  return RfqCosting.findAll({
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

  return costing
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

  return RfqCosting.findAll({
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
}

async function createRfqCosting(payload) {
  const normalizedRfqId = getTrimmedText(payload?.rfq_id)
  const normalizedType = getTrimmedText(payload?.type)
  const normalizedReference = getTrimmedText(payload?.reference)
  const normalizedProductFamily = getTrimmedText(payload?.product_family)
  const normalizedPlant = getTrimmedText(payload?.plant)

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

  return RfqCosting.create({
    rfq_id: normalizedRfqId,
    type: normalizedType,
    reference: normalizedReference,
    product_family: normalizedProductFamily || 'TBD',
    plant: normalizedPlant,
  })
}

async function updateRfqCosting(id, payload) {
  const costing = await RfqCosting.findByPk(id)

  if (!costing) {
    throw createHttpError(404, 'RFQ Costing not found.')
  }

  const normalizedType = getTrimmedText(payload?.type)
  const normalizedReference = getTrimmedText(payload?.reference)
  const normalizedProductFamily = getTrimmedText(payload?.product_family)
  const normalizedPlant = getTrimmedText(payload?.plant)

  if (payload.type && !RfqCosting.COSTING_TYPE_VALUES.includes(normalizedType)) {
    throw createHttpError(400, 'Invalid costing type.')
  }

  if (payload.product_family && !RfqCosting.PRODUCT_FAMILY_VALUES.includes(normalizedProductFamily)) {
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
        id: { [require('sequelize').Op.ne]: id },
      },
    })

    if (existingCosting) {
      throw createHttpError(409, 'This costing type already exists for the selected RFQ.')
    }
  }

  const updateData = {}
  if (payload.type !== undefined) updateData.type = normalizedType
  if (payload.reference !== undefined) updateData.reference = normalizedReference
  if (payload.product_family !== undefined) updateData.product_family = normalizedProductFamily
  if (payload.plant !== undefined) updateData.plant = normalizedPlant

  await costing.update(updateData)
  return costing.reload()
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
