const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')

const Rfq = sequelize.define(
  'Rfq',
  {
    rfq_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    rfq_data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    is_archived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'rfq',
    timestamps: true,
    underscored: true,
  }
)

module.exports = Rfq
