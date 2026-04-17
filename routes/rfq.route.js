const router = require('express').Router()
const { createRfqCosting, getAllRfqs } = require('../controllers/rfq.controller')

router.get('/', getAllRfqs)
router.post('/:rfqId/costings', createRfqCosting)

module.exports = router
