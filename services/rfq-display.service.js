const Rfq = require('../models/rfq.model')

function getOptionalText(value) {
  const normalizedValue = String(value ?? '').trim()
  return normalizedValue || null
}

function buildProjectDisplayName({ customerName, projectSubject, reference }) {
  const nameParts = [customerName, projectSubject, reference].filter(Boolean)

  if (nameParts.length > 0) {
    return nameParts.join(' - ')
  }

  if (reference) {
    return `Project - ${reference}`
  }

  return 'Project'
}

function extractRfqDisplayData(rfq = {}) {
  const rawRfq = rfq && typeof rfq.toJSON === 'function' ? rfq.toJSON() : rfq || {}
  const rfqData =
    rawRfq.rfq_data && typeof rawRfq.rfq_data === 'object' ? rawRfq.rfq_data : {}
  const rfqId = getOptionalText(rawRfq.rfq_id)
  const reference = getOptionalText(rfqData.systematic_rfq_id) || rfqId
  const customerName = getOptionalText(rfqData.customer_name)
  const projectSubject =
    getOptionalText(rfqData.project_name) || getOptionalText(rfqData.product_name) || 'Project'

  return {
    rfq_id: rfqId,
    reference,
    customer_name: customerName,
    project_subject: projectSubject,
    project_display_name: buildProjectDisplayName({
      customerName,
      projectSubject,
      reference,
    }),
    rfq_data: rfqData,
  }
}

async function getRfqDisplayDataById(rfqId) {
  const normalizedRfqId = getOptionalText(rfqId)

  if (!normalizedRfqId) {
    return extractRfqDisplayData({})
  }

  const rfq = await Rfq.findByPk(normalizedRfqId, {
    attributes: ['rfq_id', 'rfq_data'],
  })

  if (!rfq) {
    return extractRfqDisplayData({ rfq_id: normalizedRfqId })
  }

  return extractRfqDisplayData(rfq)
}

async function getRfqDisplayDataMapByIds(rfqIds = []) {
  const normalizedRfqIds = Array.from(
    new Set(
      (Array.isArray(rfqIds) ? rfqIds : [])
        .map((rfqId) => getOptionalText(rfqId))
        .filter(Boolean),
    ),
  )

  if (normalizedRfqIds.length === 0) {
    return new Map()
  }

  const rfqs = await Rfq.findAll({
    where: {
      rfq_id: normalizedRfqIds,
    },
    attributes: ['rfq_id', 'rfq_data'],
  })

  const displayDataById = rfqs.reduce((lookup, rfq) => {
    const displayData = extractRfqDisplayData(rfq)
    const rfqId = getOptionalText(displayData.rfq_id)

    if (rfqId) {
      lookup.set(rfqId, displayData)
    }

    return lookup
  }, new Map())

  normalizedRfqIds.forEach((rfqId) => {
    if (!displayDataById.has(rfqId)) {
      displayDataById.set(rfqId, extractRfqDisplayData({ rfq_id: rfqId }))
    }
  })

  return displayDataById
}

async function getCostingDisplayData(costing = {}) {
  const rawCosting =
    costing && typeof costing.toJSON === 'function' ? costing.toJSON() : costing || {}

  const rfqDisplayData = await getRfqDisplayDataById(rawCosting.rfq_id)

  return {
    ...rfqDisplayData,
    costing_id: rawCosting.id ?? null,
    costing_type: rawCosting.type ?? null,
  }
}

async function getCostingDisplayDataMap(costings = []) {
  const rawCostings = (Array.isArray(costings) ? costings : []).map((costing) =>
    costing && typeof costing.toJSON === 'function' ? costing.toJSON() : costing || {},
  )

  const rfqDisplayDataById = await getRfqDisplayDataMapByIds(
    rawCostings.map((costing) => costing.rfq_id),
  )

  return rawCostings.reduce((lookup, rawCosting) => {
    const costingId =
      rawCosting.id === undefined || rawCosting.id === null ? null : String(rawCosting.id)
    const normalizedRfqId = getOptionalText(rawCosting.rfq_id)
    const rfqDisplayData = normalizedRfqId
      ? rfqDisplayDataById.get(normalizedRfqId) || extractRfqDisplayData({ rfq_id: normalizedRfqId })
      : extractRfqDisplayData({})

    if (costingId) {
      lookup.set(costingId, {
        ...rfqDisplayData,
        costing_id: rawCosting.id ?? null,
        costing_type: rawCosting.type ?? null,
      })
    }

    return lookup
  }, new Map())
}

module.exports = {
  buildProjectDisplayName,
  extractRfqDisplayData,
  getRfqDisplayDataById,
  getCostingDisplayData,
  getRfqDisplayDataMapByIds,
  getCostingDisplayDataMap,
}
