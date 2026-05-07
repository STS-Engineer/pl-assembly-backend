const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')
const { STATUS_VALUES } = require('./rfq-costing-initial-sub-element.model')

const Rfq = sequelize.define(
  'sub_element-product-design',
  {
    id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    },
    index:{
      type: DataTypes.STRING,
      allowNull: true,
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    two_d: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    three_d: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    two_d_status: {
      type: DataTypes.ENUM(...TWO_D_STATUS_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    status_element: {
      type: DataTypes.ENUM(...STATUS_ELEMENT_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    schedule: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    validator:{
      type: DataTypes.STRING,
      allowNull: true,
    },
    validation:{
      type: DataTypes.ENUM(...VALIDATION_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    input:{
      type: DataTypes.TEXT,
      allowNull: true,
    },
    output:{
      type: DataTypes.TEXT,
      allowNull: true,
    },
    shared_to:{
      type: DataTypes.ENUM(...SHARED_TO_VALUES),
      allowNull: true,
    },
    comment_change_index:{
      type: DataTypes.TEXT,
      allowNull: true,
    },
    number_hours:{
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'element-product-design',
    timestamps: true,
    underscored: true,
  }
)

module.exports = element-product-design

const TWO_D_STATUS_VALUES = [
  'Execution',
  'Prototype/RFQ',
  'Concept/RFI'
]
const STATUS_ELEMENT_VALUES = [
  'Working on it',
  'Approved',  
  'Blocked',
  'to be done',
  'Need to b reworked',
  'Need to be validated',
  'Closed',
  'Done',
]
const VALIDATION_VALUES = [
  'Customer validation in progress',
  'Done', 
  'Blocked',
  'Need to be reworked',
]
const SHARED_TO_VALUES = [
  'Supplier',
  'Customer',
  'AVO Teams',
]
