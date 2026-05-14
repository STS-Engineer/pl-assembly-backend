const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')
const ProductDevelopmentProduct = require('./product-development-product.model')

const EXT_INTER_STATUS_VALUES = ['Not requested', 'Customer', 'AVOCarbon', 'Not needed']
const DESIGN_TYPE_VALUES = [
  'Not requested',
  'For Test',
  'For Quotation',
  'For Prototype',
  'Envelop Design',
]
const STATUS_VALUES = [
  'Not requested',
  'In progress',
  'Blocked',
  'Done',
  'Need to be Validated',
  'Need to be Reworked',
]
const VALIDATION_STATUS_VALUES = [
  'Not requested',
  'In progress',
  'Validated',
  'Need to be Reworked',
  'Blocked',
]
const DEVELOPMENT_TIME_VALUES = ['Not requested', 'Respcted', 'Not Respected']
const NOTE_STATUS_VALUES = ['+', '-']
const CUSTOMER_DUE_DATE_STATUS_VALUES = ['Done', 'In progress', 'Blocked']

const ElementProductDesign = sequelize.define(
  'ElementProductDesign',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    product_development_product_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: ProductDevelopmentProduct.getTableName(),
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    due_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ext_inter: {
      type: DataTypes.ENUM(...EXT_INTER_STATUS_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    creation_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    design_type: {
      type: DataTypes.ENUM(...DESIGN_TYPE_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    designer: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...STATUS_VALUES),
      allowNull: false,
      defaultValue: 'Not requested',
    },
    iteration_time: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    leader: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    validation: {
      type: DataTypes.ENUM(...VALIDATION_STATUS_VALUES),
      allowNull: false,
      defaultValue: 'Not requested',
    },
    development_time: {
      type: DataTypes.ENUM(...DEVELOPMENT_TIME_VALUES),
      allowNull: false,
      defaultValue: 'Not requested',
    },
    iteration_goals: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    design_review_accepted: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    design_need_to_be_reviewed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    iteration_note: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    formula: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status_note: {
      type: DataTypes.ENUM(...NOTE_STATUS_VALUES),
      allowNull: true,
    },
    customer_due_date: {
      type: DataTypes.ENUM(...CUSTOMER_DUE_DATE_STATUS_VALUES),
      allowNull: true,
    },
  },
  {
    tableName: 'element-product-design',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_epd_product_id',
        fields: ['product_development_product_id'],
      },
      {
        name: 'idx_epd_product_order',
        fields: ['product_development_product_id', 'display_order'],
      },
    ],
  },
)

module.exports = ElementProductDesign
module.exports.EXT_INTER_STATUS_VALUES = EXT_INTER_STATUS_VALUES
module.exports.DESIGN_TYPE_VALUES = DESIGN_TYPE_VALUES
module.exports.STATUS_VALUES = STATUS_VALUES
module.exports.VALIDATION_STATUS_VALUES = VALIDATION_STATUS_VALUES
module.exports.DEVELOPMENT_TIME_VALUES = DEVELOPMENT_TIME_VALUES
module.exports.NOTE_STATUS_VALUES = NOTE_STATUS_VALUES
module.exports.CUSTOMER_DUE_DATE_STATUS_VALUES = CUSTOMER_DUE_DATE_STATUS_VALUES
