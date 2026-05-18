const router = require('express').Router()
const {
  archiveProduct,
  createProduct,
  createElementConversationMessage,
  createProductElement,
  createProductSubElement,
  createSubElementConversationMessage,
  deleteElement,
  deleteProduct,
  deleteProductElement,
  deleteProductSubElement,
  deleteSubElement,
  getElementConversation,
  getAllProducts,
  getSubElementConversation,
  restoreProduct,
  toggleElementConversationChecklistItem,
  toggleSubElementConversationChecklistItem,
  updateElementConversationMessage,
  updateElement,
  updateProduct,
  updateProductElement,
  updateSubElementConversationMessage,
  updateProductSubElement,
  updateSubElement,
} = require('../controllers/product-development.controller')

router.get('/products', getAllProducts)
router.post('/products', createProduct)
router.delete('/elements/:elementId', deleteElement)
router.patch('/elements/:elementId', updateElement)
router.get('/elements/:elementId/conversation', getElementConversation)
router.post('/elements/:elementId/conversation', createElementConversationMessage)
router.patch('/elements/:elementId/conversation/:messageId', updateElementConversationMessage)
router.patch(
  '/elements/:elementId/conversation/:messageId/checklist',
  toggleElementConversationChecklistItem,
)
router.patch('/sub-elements/:subElementId', updateSubElement)
router.get('/sub-elements/:subElementId/conversation', getSubElementConversation)
router.post('/sub-elements/:subElementId/conversation', createSubElementConversationMessage)
router.patch(
  '/sub-elements/:subElementId/conversation/:messageId',
  updateSubElementConversationMessage,
)
router.patch(
  '/sub-elements/:subElementId/conversation/:messageId/checklist',
  toggleSubElementConversationChecklistItem,
)
router.delete('/sub-elements/:subElementId', deleteSubElement)
router.post('/products/:id/elements', createProductElement)
router.post('/products/:id/elements/:elementId/sub-elements', createProductSubElement)
router.delete('/products/:id/elements/:elementId/sub-elements/:subElementId', deleteProductSubElement)
router.patch('/products/:id/elements/:elementId/sub-elements/:subElementId', updateProductSubElement)
router.delete('/products/:id/elements/:elementId', deleteProductElement)
router.patch('/products/:id/elements/:elementId', updateProductElement)
router.patch('/products/:id', updateProduct)
router.post('/products/:id/archive', archiveProduct)
router.patch('/products/:id/archive', archiveProduct)
router.post('/products/:id/restore', restoreProduct)
router.patch('/products/:id/restore', restoreProduct)
router.delete('/products/:id', deleteProduct)

module.exports = router
