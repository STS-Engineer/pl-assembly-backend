const router = require('express').Router()
const {
  archiveProduct,
  createProduct,
  createElementConversationMessage,
  createProductElement,
  createProductSubElement,
  createSubElementConversationMessage,
  deleteProduct,
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
router.post('/products/:id/elements', createProductElement)
router.post('/products/:id/elements/:elementId/sub-elements', createProductSubElement)
router.patch('/products/:id/elements/:elementId/sub-elements/:subElementId', updateProductSubElement)
router.patch('/products/:id/elements/:elementId', updateProductElement)
router.patch('/products/:id', updateProduct)
router.post('/products/:id/archive', archiveProduct)
router.patch('/products/:id/archive', archiveProduct)
router.post('/products/:id/restore', restoreProduct)
router.patch('/products/:id/restore', restoreProduct)
router.delete('/products/:id', deleteProduct)

module.exports = router
