const productDevelopmentService = require('../services/product-development.service')
const subElementConversationService = require('../services/sub-element-conversation.service')
const userService = require('../services/user.service')

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
}

async function getAuthenticatedUser(req) {
  return userService.authenticateAccessTokenFromHeader(req.headers.authorization)
}

async function getAllProducts(req, res) {
  try {
    const products = await productDevelopmentService.getAllProducts({
      search: req.query.search,
      deadline_status: req.query.deadline_status ?? req.query.deadlineStatus,
      include_archived: req.query.include_archived ?? req.query.includeArchived,
      archived_only: req.query.archived_only ?? req.query.archivedOnly,
    })
    res.status(200).json(products)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function createProduct(req, res) {
  try {
    const product = await productDevelopmentService.createProduct(req.body)
    res.status(201).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function createProductElement(req, res) {
  try {
    const product = await productDevelopmentService.createProductElement(req.params.id, req.body)
    res.status(201).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function createProductSubElement(req, res) {
  try {
    const product = await productDevelopmentService.createProductSubElement(
      req.params.id,
      req.params.elementId,
      req.body,
    )
    res.status(201).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateProductElement(req, res) {
  try {
    const product = await productDevelopmentService.updateProductElement(
      req.params.id,
      req.params.elementId,
      req.body,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateElement(req, res) {
  try {
    const product = await productDevelopmentService.updateElement(
      req.params.elementId,
      req.body,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateProductSubElement(req, res) {
  try {
    const product = await productDevelopmentService.updateProductSubElement(
      req.params.id,
      req.params.elementId,
      req.params.subElementId,
      req.body,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateSubElement(req, res) {
  try {
    const product = await productDevelopmentService.updateSubElement(
      req.params.subElementId,
      req.body,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateProduct(req, res) {
  try {
    const product = await productDevelopmentService.updateProduct(req.params.id, req.body)
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function deleteProduct(req, res) {
  try {
    const product = await productDevelopmentService.deleteProduct(req.params.id)
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function archiveProduct(req, res) {
  try {
    const product = await productDevelopmentService.archiveProduct(req.params.id)
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function restoreProduct(req, res) {
  try {
    const product = await productDevelopmentService.restoreProduct(req.params.id)
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getElementConversation(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result = await subElementConversationService.getProductDevelopmentElementConversation(
      req.params.elementId,
      authenticatedUser,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function createElementConversationMessage(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result =
      await subElementConversationService.createProductDevelopmentElementConversationMessage(
        req.params.elementId,
        req.body,
        authenticatedUser,
      )
    res.status(201).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateElementConversationMessage(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result =
      await subElementConversationService.updateProductDevelopmentElementConversationMessage(
        req.params.elementId,
        req.params.messageId,
        req.body,
        authenticatedUser,
      )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function toggleElementConversationChecklistItem(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result =
      await subElementConversationService.toggleProductDevelopmentElementConversationChecklistItem(
        req.params.elementId,
        req.params.messageId,
        req.body,
        authenticatedUser,
      )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getSubElementConversation(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result = await subElementConversationService.getProductDevelopmentSubElementConversation(
      req.params.subElementId,
      authenticatedUser,
    )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function createSubElementConversationMessage(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result =
      await subElementConversationService.createProductDevelopmentSubElementConversationMessage(
        req.params.subElementId,
        req.body,
        authenticatedUser,
      )
    res.status(201).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateSubElementConversationMessage(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result =
      await subElementConversationService.updateProductDevelopmentSubElementConversationMessage(
        req.params.subElementId,
        req.params.messageId,
        req.body,
        authenticatedUser,
      )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function toggleSubElementConversationChecklistItem(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const result =
      await subElementConversationService.toggleProductDevelopmentSubElementConversationChecklistItem(
        req.params.subElementId,
        req.params.messageId,
        req.body,
        authenticatedUser,
      )
    res.status(200).json(result)
  } catch (error) {
    handleControllerError(res, error)
  }
}

module.exports = {
  getAllProducts,
  createProduct,
  createProductElement,
  createProductSubElement,
  updateProductElement,
  updateElement,
  updateProductSubElement,
  updateSubElement,
  updateProduct,
  deleteProduct,
  archiveProduct,
  restoreProduct,
  getElementConversation,
  createElementConversationMessage,
  updateElementConversationMessage,
  toggleElementConversationChecklistItem,
  getSubElementConversation,
  createSubElementConversationMessage,
  updateSubElementConversationMessage,
  toggleSubElementConversationChecklistItem,
}
