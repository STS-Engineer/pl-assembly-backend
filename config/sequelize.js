const { Sequelize } = require('sequelize')

function shouldUseSsl() {
  if (process.env.DB_SSL === 'true') {
    return true
  }

  if (process.env.DB_SSL === 'false') {
    return false
  }

  return Boolean(process.env.DATABASE_URL)
}

function shouldRejectUnauthorized() {
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true') {
    return true
  }

  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    return false
  }

  return false
}

function createDialectOptions() {
  if (!shouldUseSsl()) {
    return undefined
  }

  return {
    ssl: {
      require: true,
      rejectUnauthorized: shouldRejectUnauthorized(),
    },
  }
}

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: createDialectOptions(),
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        dialect: 'postgres',
        logging: false,
        dialectOptions: createDialectOptions(),
      }
    )

module.exports = sequelize
