const router = require('express').Router()
const {
  getNotifications,
  markAllNotificationsAsRead,
} = require('../controllers/notification.controller')

router.get('/', getNotifications)
router.patch('/read-all', markAllNotificationsAsRead)

module.exports = router
