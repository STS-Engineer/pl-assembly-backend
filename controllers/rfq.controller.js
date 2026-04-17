const rfqService = require('../services/rfq.service')

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
}

async function getAllRfqs(req, res) {
  try {
    const rfqs = await rfqService.getAllRfqs()
    res.status(200).json(rfqs)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function createRfqCosting(req, res) {
  try {
    const costing = await rfqService.createRfqCosting(req.params.rfqId, req.body)
    res.status(201).json(costing)
  } catch (error) {
    handleControllerError(res, error)
  }
}

module.exports = {
  getAllRfqs,
  createRfqCosting,
}
