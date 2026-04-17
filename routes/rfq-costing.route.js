const router = require('express').Router()
const {
  getAllRfqCostings,
  getRfqCostingById,
  getRfqCostingsByRfqId,
  createRfqCosting,
  updateRfqCosting,
  deleteRfqCosting,
  getCostingTypes,
  getProductFamilies,
  getPlants,
} = require('../controllers/rfq-costing.controller')

router.get('/', getAllRfqCostings)
router.get('/types', getCostingTypes)
router.get('/product-families', getProductFamilies)
router.get('/plants', getPlants)
router.get('/rfq/:rfqId', getRfqCostingsByRfqId)
router.get('/:id', getRfqCostingById)
router.post('/', createRfqCosting)
router.put('/:id', updateRfqCosting)
router.delete('/:id', deleteRfqCosting)

module.exports = router
