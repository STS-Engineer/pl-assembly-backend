require('dotenv').config()

const express = require('express')
const cors = require('cors')
const cron = require('node-cron')
const sequelize = require('./config/sequelize')
const User = require('./models/user.model')
const Notification = require('./models/notification.model')
const Rfq = require('./models/rfq.model')
const RfqCosting = require('./models/rfq-costing.model')
const RfqCostingInitialSubElement = require('./models/rfq-costing-initial-sub-element.model')
const emailService = require('./emails/email.service')
const rfqCostingInitialSubElementService = require('./services/rfq-costing-initial-sub-element.service')

const RFQCosting = require('./routes/rfq-costing.route')
const notificationRoutes = require('./routes/notification.route')
const rfqCostingInitialSubElementRoutes = require('./routes/rfq-costing-initial-sub-element.route')
const userRoutes = require('./routes/user.route')
const rfqRoutes = require('./routes/rfq.route')

User.hasMany(Notification, {
  foreignKey: 'user_id',
  as: 'notifications',
})

Notification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
})

Rfq.hasMany(RfqCosting, {
  foreignKey: 'rfq_id',
  sourceKey: 'rfq_id',
  as: 'costings',
})

RfqCosting.belongsTo(Rfq, {
  foreignKey: 'rfq_id',
  targetKey: 'rfq_id',
  as: 'rfq',
})

RfqCosting.hasMany(RfqCostingInitialSubElement, {
  foreignKey: 'rfq_costing_id',
  as: 'initial_sub_elements',
})

RfqCostingInitialSubElement.belongsTo(RfqCosting, {
  foreignKey: 'rfq_costing_id',
  as: 'costing',
})

const app = express()
let httpServer = null
let shutdownHandlersRegistered = false

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.use('/api/users', userRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/rfqs', rfqRoutes)
app.use('/api/rfq-costing', RFQCosting)
app.use('/api/rfq-costing-initial-sub-elements', rfqCostingInitialSubElementRoutes)
app.use('/api/rfqc-sub-element', rfqCostingInitialSubElementRoutes)

app.get('/', (req, res) => {
  res.send('API is running')
})

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello from backend' })
})

app.post('/api/test-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body

    if (!to) {
      return res.status(400).json({ message: 'Recipient email (to) is required' })
    }

    await emailService.sendMail({
      to,
      subject: subject || 'Test Email from PL Assembly',
      text: message || 'This is a test email to verify SMTP configuration.',
      html: `<p>${message || 'This is a test email to verify SMTP configuration.'}</p>`,
    })

    return res.status(200).json({
      message: 'Test email sent successfully',
      recipient: to,
    })
  } catch (error) {
    console.error('Test email error:', error)
    return res.status(500).json({
      message: 'Failed to send test email',
      error: error.message,
    })
  }
})

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    res.status(400).json({ message: 'Le corps de la requete doit etre un JSON valide.' })
    return
  }

  next(error)
})

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' })
})

const PORT = Number(process.env.PORT || 3000)

function closeServer() {
  if (!httpServer) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error)
        return
      }

      httpServer = null
      resolve()
    })
  })
}

function registerProcessHandlers() {
  if (shutdownHandlersRegistered) {
    return
  }

  shutdownHandlersRegistered = true

  process.on('SIGINT', async () => {
    console.log('SIGINT received. Closing server...')

    try {
      await closeServer()
      process.exit(0)
    } catch (error) {
      console.error('Error while closing server after SIGINT:', error.message)
      process.exit(1)
    }
  })

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Closing server...')

    try {
      await closeServer()
      process.exit(0)
    } catch (error) {
      console.error('Error while closing server after SIGTERM:', error.message)
      process.exit(1)
    }
  })

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason)
  })

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
  })
}

async function startServer() {
  await sequelize.authenticate()
  console.log('PostgreSQL connected successfully')

  await sequelize.sync({ alter: true })
  console.log('Models synchronized successfully')

  await User.ensureApprovalState()
  registerProcessHandlers()

  // Configurer le cron job pour mettre à jour les statuts Late! à chaque minuit
  cron.schedule('0 0 * * *', async () => {
    console.log('📅 Running midnight late status update...')
    try {
      await rfqCostingInitialSubElementService.updateLateStatuses()
    } catch (error) {
      console.error('❌ Error in midnight late status update:', error.message)
    }
  })
  console.log('📅 Cron job scheduled: updateLateStatuses will run every midnight')

  if (httpServer) {
    return httpServer
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT)

    const handleListening = () => {
      server.off('error', handleError)
      httpServer = server

      httpServer.on('error', (error) => {
        console.error('HTTP server error:', error.message)
      })

      httpServer.on('close', () => {
        console.log('HTTP server closed.')
      })

      console.log(`Server running on port ${PORT}`)
      resolve(httpServer)
    }

    const handleError = (error) => {
      server.off('listening', handleListening)
      httpServer = null
      reject(error)
    }

    server.once('listening', handleListening)
    server.once('error', handleError)
  })
}

if (require.main === module) {
  startServer().catch((error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`)
      process.exit(1)
      return
    }

    console.error('Unable to connect to PostgreSQL:', error.message)
    process.exit(1)
  })
}

module.exports = {
  app,
  PORT,
  closeServer,
  startServer,
}
