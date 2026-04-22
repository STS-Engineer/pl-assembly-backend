const router = require('express').Router()
const {
  getOptions,
  getSubElementsByCostingIds,
  getSubElementsByCostingId,
  getSubElementByKey,
  updateSubElementByKey,
  getSubElementByApprovalToken,
  approveSubElementByToken,
} = require('../controllers/rfq-costing-initial-sub-element.controller')

router.get('/options', getOptions)
router.get('/approval/:token', getSubElementByApprovalToken)
router.get('/costings', getSubElementsByCostingIds)
router.get('/costing/:costingId', getSubElementsByCostingId)
router.get('/costing/:costingId/:key', getSubElementByKey)
router.patch('/approval/:token', approveSubElementByToken)
router.patch('/costing/:costingId/:key', updateSubElementByKey)

module.exports = router
