const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')

const PRODUCT_FAMILY_VALUES = [
  'Brush Holder',
  'Slip Ring',
  'Insert Molding',
  'Wire Harness',
  'Antenna',
  'Simple Injection',
  'Other',
  'TBD',
  'Assy Electronics',
]

const COSTING_TYPE_VALUES = [
  'Initial Costing',
  'Improved Costing',
  'Last Call Costing',
]

const RfqCosting = sequelize.define(
  'RfqCosting',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    rfq_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'rfq',
        key: 'rfq_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    type: {
      type: DataTypes.ENUM(...COSTING_TYPE_VALUES),
      allowNull: false,
    },
    product_family: {
      type: DataTypes.ENUM(...PRODUCT_FAMILY_VALUES),
      allowNull: false,
      defaultValue: 'TBD',
    },
    plant: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    link: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'rfq_costing',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['rfq_id'],
      },
      {
        fields: ['type'],
      },
    ],
  }
)

RfqCosting.PRODUCT_FAMILY_VALUES = PRODUCT_FAMILY_VALUES
RfqCosting.COSTING_TYPE_VALUES = COSTING_TYPE_VALUES

module.exports = RfqCosting
