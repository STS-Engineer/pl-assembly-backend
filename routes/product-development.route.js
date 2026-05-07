const router = require('express').Router()
const {
  archiveProduct,
  createProduct,
  deleteProduct,
  getAllProducts,
  restoreProduct,
  updateProduct,
} = require('../controllers/product-development.controller')

router.get('/products', getAllProducts)
router.post('/products', createProduct)
router.patch('/products/:id', updateProduct)
router.post('/products/:id/archive', archiveProduct)
router.patch('/products/:id/archive', archiveProduct)
router.post('/products/:id/restore', restoreProduct)
router.patch('/products/:id/restore', restoreProduct)
router.delete('/products/:id', deleteProduct)

module.exports = router
