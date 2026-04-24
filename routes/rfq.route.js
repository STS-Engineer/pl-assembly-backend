const router = require('express').Router()
const { createRfq, createRfqCosting, getAllRfqs } = require('../controllers/rfq.controller')

router.get('/', getAllRfqs)
router.post('/', createRfq)
router.post('/:rfqId/costings', createRfqCosting)

module.exports = router
