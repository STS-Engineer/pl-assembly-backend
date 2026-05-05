const router = require('express').Router()
const {
  archiveRfq,
  createRfq,
  createRfqCosting,
  getAllRfqs,
  getSalesRepOptions,
  restoreRfq,
} = require('../controllers/rfq.controller')

router.get('/', getAllRfqs)
router.get('/sales-reps', getSalesRepOptions)
router.post('/', createRfq)
router.post('/:rfqId/costings', createRfqCosting)
router.post('/:rfqId/archive', archiveRfq)
router.patch('/:rfqId/archive', archiveRfq)
router.post('/:rfqId/restore', restoreRfq)
router.patch('/:rfqId/restore', restoreRfq)

module.exports = router
