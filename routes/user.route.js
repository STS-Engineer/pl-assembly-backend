const router = require('express').Router()
const {
  approveUserAccount,
  signUp,
  signIn,
  getAllUsers,
  getUserById,
  changePassword,
  forgotPassword,
  verifyResetPasswordToken,
  resetPasswordWithToken,
} = require('../controllers/user.controller')

router.post('/signup', signUp)
router.post('/signin', signIn)
router.get('/approve-account/:token', approveUserAccount)
router.post('/forgot-password', forgotPassword)
router.get('/reset-password/:token', verifyResetPasswordToken)
router.patch('/reset-password/:token', resetPasswordWithToken)
router.get('/', getAllUsers)
router.get('/:id', getUserById)
router.patch('/:id/change-password', changePassword)

module.exports = router
