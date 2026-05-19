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

async function getOptionalAuthenticatedUser(req) {
  if (!req?.headers?.authorization) {
    return null
  }

  return getAuthenticatedUser(req)
}

function sendValidationActionHtml(res, options = {}) {
  const statusCode = options.statusCode || 200
  const title = options.title || 'Validation completed'
  const eyebrow = options.eyebrow || 'Product Design'
  const message = options.message || ''
  const variant = options.variant === 'error' ? 'error' : 'success'
  const actionLabel = options.actionLabel || ''
  const actionUrl = options.actionUrl || ''

  res.status(statusCode).type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:32px 16px;background:#f6f2ea;font-family:'Segoe UI',Calibri,Arial,sans-serif;color:#162231;">
        <div style="max-width:640px;margin:0 auto;">
          <section style="border-radius:24px;background:#ffffff;border:1px solid rgba(14,78,120,0.08);box-shadow:0 18px 44px rgba(8,31,49,0.10);padding:28px;">
            <span style="display:inline-flex;padding:8px 12px;border-radius:999px;background:${variant === 'success' ? 'rgba(29,93,54,0.10)' : 'rgba(156,47,28,0.10)'};color:${variant === 'success' ? '#1d5d36' : '#9c2f1c'};font-size:0.76rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${eyebrow}</span>
            <h1 style="margin:18px 0 12px;font-size:2rem;line-height:1.1;color:#081e2f;">${title}</h1>
            <p style="margin:0;font-size:1rem;line-height:1.7;color:#53697b;">${message}</p>
            ${
              actionLabel && actionUrl
                ? `<div style="margin-top:24px;"><a href="${actionUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#ef7807;color:#fff;text-decoration:none;font-weight:800;">${actionLabel}</a></div>`
                : ''
            }
          </section>
        </div>
      </body>
    </html>
  `)
}

async function getAllProducts(req, res) {
  try {
    const products = await productDevelopmentService.getAllProducts({
      search: req.query.search,
      project_status: req.query.project_status ?? req.query.projectStatus,
      include_archived: req.query.include_archived ?? req.query.includeArchived,
      archived_only: req.query.archived_only ?? req.query.archivedOnly,
    })
    res.status(200).json(products)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function getProductById(req, res) {
  try {
    const product = await productDevelopmentService.getProductById(req.params.id)
    res.status(200).json(product)
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
    const authenticatedUser = await getOptionalAuthenticatedUser(req)
    const product = await productDevelopmentService.updateProductElement(
      req.params.id,
      req.params.elementId,
      req.body,
      authenticatedUser,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function updateElement(req, res) {
  try {
    const authenticatedUser = await getOptionalAuthenticatedUser(req)
    const product = await productDevelopmentService.updateElement(
      req.params.elementId,
      req.body,
      authenticatedUser,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function approveElementValidationByToken(req, res) {
  try {
    const response = await productDevelopmentService.approveElementValidationByToken(req.params.token)
    const acceptHeader = String(req.headers.accept || '')
    const workspaceUrl = process.env.FRONTEND_URL
      ? `${String(process.env.FRONTEND_URL).replace(/\/+$/, '')}/workspace/product-development`
      : ''

    if (acceptHeader.includes('text/html')) {
      sendValidationActionHtml(res, {
        statusCode: 200,
        title: 'Task validated',
        eyebrow: 'Validation completed',
        message: response.message,
        variant: 'success',
        actionLabel: workspaceUrl ? 'Open Product Design' : '',
        actionUrl: workspaceUrl,
      })
      return
    }

    res.status(200).json(response)
  } catch (error) {
    const acceptHeader = String(req.headers.accept || '')
    const workspaceUrl = process.env.FRONTEND_URL
      ? `${String(process.env.FRONTEND_URL).replace(/\/+$/, '')}/workspace/product-development`
      : ''

    if (acceptHeader.includes('text/html')) {
      sendValidationActionHtml(res, {
        statusCode: error.statusCode || 500,
        title: 'Validation failed',
        eyebrow: 'Validation error',
        message:
          (error.statusCode || 500) === 500
            ? 'Une erreur interne est survenue.'
            : error.message,
        variant: 'error',
        actionLabel: workspaceUrl ? 'Open Product Design' : '',
        actionUrl: workspaceUrl,
      })
      return
    }

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

async function deleteProductElement(req, res) {
  try {
    const product = await productDevelopmentService.deleteProductElement(
      req.params.id,
      req.params.elementId,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function deleteElement(req, res) {
  try {
    const product = await productDevelopmentService.deleteElement(req.params.elementId)
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function deleteProductSubElement(req, res) {
  try {
    const product = await productDevelopmentService.deleteProductSubElement(
      req.params.id,
      req.params.elementId,
      req.params.subElementId,
    )
    res.status(200).json(product)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function deleteSubElement(req, res) {
  try {
    const product = await productDevelopmentService.deleteSubElement(req.params.subElementId)
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
  getProductById,
  createProduct,
  createProductElement,
  createProductSubElement,
  approveElementValidationByToken,
  updateProductElement,
  updateElement,
  updateProductSubElement,
  updateSubElement,
  deleteProductElement,
  deleteElement,
  deleteProductSubElement,
  deleteSubElement,
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
