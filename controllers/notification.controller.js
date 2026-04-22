const notificationService = require('../services/notification.service')
const userService = require('../services/user.service')

function handleControllerError(res, error) {
  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Une erreur interne est survenue.' : error.message

  res.status(statusCode).json({
    message,
  })
}

async function getAuthenticatedUser(req) {
  return userService.authenticateAccessTokenFromHeader(req.headers.authorization)
}

async function getNotifications(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const notifications = await notificationService.getNotificationsByUserId(
      authenticatedUser.id,
      req.query,
    )

    res.status(200).json(notifications)
  } catch (error) {
    handleControllerError(res, error)
  }
}

async function markAllNotificationsAsRead(req, res) {
  try {
    const authenticatedUser = await getAuthenticatedUser(req)
    const response = await notificationService.markAllNotificationsAsRead(authenticatedUser.id)
    res.status(200).json(response)
  } catch (error) {
    handleControllerError(res, error)
  }
}

module.exports = {
  getNotifications,
  markAllNotificationsAsRead,
}
