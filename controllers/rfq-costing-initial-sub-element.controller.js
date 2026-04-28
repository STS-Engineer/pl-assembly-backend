const rfqCostingInitialSubElementService = require('../services/rfq-costing-initial-sub-element.service')
const subElementConversationService = require('../services/sub-element-conversation.service')
const userService = require('../services/user.service')

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
}

function shouldLogControllerError(error) {
  return !error?.statusCode || error.statusCode >= 500
}

async function getAuthenticatedUser(req) {
  return userService.authenticateAccessTokenFromHeader(req.headers.authorization)
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

async function getSubElementConversation(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result = await subElementConversationService.getConversation(
      req.params.costingId,
      req.params.key,
      authenticatedUser,
    )
    res.status(200).json(result)
  } catch (error) {
    if (shouldLogControllerError(error)) {
      console.error('[getSubElementConversation] Error:', {
        message: error.message,
        statusCode: error.statusCode,
        costingId: req.params.costingId,
        key: req.params.key,
        stack: error.stack,
      })
    }
    handleControllerError(res, error)
  }
}

async function createSubElementConversationMessage(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result = await subElementConversationService.createConversationMessage(
      req.params.costingId,
      req.params.key,
      req.body,
      authenticatedUser,
    )
    res.status(201).json(result)
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
  getSubElementConversation,
  createSubElementConversationMessage,
}
