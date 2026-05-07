const productDevelopmentService = require('../services/product-development.service')

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
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

module.exports = {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  archiveProduct,
  restoreProduct,
}
