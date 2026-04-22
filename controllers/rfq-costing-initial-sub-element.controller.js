const rfqCostingInitialSubElementService = require('../services/rfq-costing-initial-sub-element.service')

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
}

async function getOptions(req, res) {
  try {
    const options = await rfqCostingInitialSubElementService.getOptions()
    res.status(200).json(options)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getSubElementsByCostingId(req, res) {
  try {
    const result = await rfqCostingInitialSubElementService.getSubElementsByCostingId(
      req.params.costingId,
      req.query,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getSubElementsByCostingIds(req, res) {
  try {
    const rawCostingIds = String(
      req.query.costing_ids ?? req.query.costingIds ?? '',
    ).trim()
    const costingIds = rawCostingIds
      ? rawCostingIds.split(',').map((costingId) => costingId.trim()).filter(Boolean)
      : []
    const result = await rfqCostingInitialSubElementService.getSubElementsByCostingIds(
      costingIds,
      req.query,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getSubElementByKey(req, res) {
  try {
    const result = await rfqCostingInitialSubElementService.getSubElementByKey(
      req.params.costingId,
      req.params.key,
      req.query,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateSubElementByKey(req, res) {
  try {
    console.log(req.params.costingId)
    console.log(req.params.key)
    console.log(req.body)
    const result = await rfqCostingInitialSubElementService.updateSubElementByKey(
      req.params.costingId,
      req.params.key,
      req.body,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getSubElementByApprovalToken(req, res) {
  try {
    const result = await rfqCostingInitialSubElementService.getSubElementByApprovalToken(
      req.params.token,
      req.query,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function approveSubElementByToken(req, res) {
  try {
    const result = await rfqCostingInitialSubElementService.approveSubElementByToken(
      req.params.token,
      req.body,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
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
}
