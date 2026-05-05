const router = require('express').Router()
const {
  getOptions,
  getSubElementsByCostingIds,
  getSubElementsByCostingId,
  getSubElementByKey,
  updateSubElementByKey,
  getSubElementByApprovalToken,
  approveSubElementByToken,
  getSubElementConversation,
  createSubElementConversationMessage,
  updateSubElementConversationMessage,
} = require('../controllers/rfq-costing-initial-sub-element.controller')

router.get('/options', getOptions)
router.get('/approval/:token', getSubElementByApprovalToken)
router.get('/costings', getSubElementsByCostingIds)
router.get('/costing/:costingId', getSubElementsByCostingId)
router.get('/costing/:costingId/:key/conversation', getSubElementConversation)
router.get('/costing/:costingId/:key', getSubElementByKey)
router.post('/costing/:costingId/:key/conversation', createSubElementConversationMessage)
router.patch('/costing/:costingId/:key/conversation', updateSubElementConversationMessage)
router.patch(
  '/costing/:costingId/:key/conversation/:messageId',
  updateSubElementConversationMessage,
)
router.patch('/approval/:token', approveSubElementByToken)
router.patch('/costing/:costingId/:key', updateSubElementByKey)

module.exports = router
