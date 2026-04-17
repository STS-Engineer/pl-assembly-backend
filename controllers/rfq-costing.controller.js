const rfqCostingService = require('../services/rfq-costing.service')

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
}

async function getAllRfqCostings(req, res) {
  try {
    const costings = await rfqCostingService.getAllRfqCostings()
    res.status(200).json(costings)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getRfqCostingById(req, res) {
  try {
    const costing = await rfqCostingService.getRfqCostingById(req.params.id)
    res.status(200).json(costing)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getRfqCostingsByRfqId(req, res) {
  try {
    const costings = await rfqCostingService.getRfqCostingsByRfqId(req.params.rfqId)
    res.status(200).json(costings)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function createRfqCosting(req, res) {
  try {
    const costing = await rfqCostingService.createRfqCosting(req.body)
    res.status(201).json(costing)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateRfqCosting(req, res) {
  try {
    const costing = await rfqCostingService.updateRfqCosting(req.params.id, req.body)
    res.status(200).json(costing)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function deleteRfqCosting(req, res) {
  try {
    const result = await rfqCostingService.deleteRfqCosting(req.params.id)
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getCostingTypes(req, res) {
  try {
    const types = await rfqCostingService.getCostingTypes()
    res.status(200).json(types)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getProductFamilies(req, res) {
  try {
    const families = await rfqCostingService.getProductFamilies()
    res.status(200).json(families)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getPlants(req, res) {
  try {
    const plants = await rfqCostingService.getPlants()
    res.status(200).json(plants)
  } catch (error) {
    handleControllerError(res, error)
  }
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
