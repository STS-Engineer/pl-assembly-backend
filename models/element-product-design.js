const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')

const element_product_design = sequelize.define(
  'element-product-design',
  {
    id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    },
    due_date: {
      type: DataTypes.Date,
      allowNull: true,
    },
    ext_inter: {
      type: DataTypes.ENUM(...EXT_INTER_STATUS_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    creation_date: {
      type: DataTypes.Date,
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
      type: DataTypes.INTEGER,
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
      type: DataTypes.ENUM(...DEVELOPMENT_TIME_VALUES), //relier à itération tim est ce que le temps de développement a été respecté ou pas
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
    iteration_note:{
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
  }
)

module.exports = element_product_design

const EXT_INTER_STATUS_VALUES = [
  'Customer',
  'AVOCarbon',
  'Not needed',
 ]
const DESIGN_TYPE_VALUES = [
  'For Test',
  'For Quotation',
  'For Prototype',
  'Envelop Design',
]
const STATUS_VALUES = [
  'In progress',
  'Blocked',
  'Done', 
  'Need to be Validated',
  'Need to be Reworked',
]
const VALIDATION_STATUS_VALUES = [
  'In progress',
  'Validated',
  'Need to be Reworked',
  'Blocked',
]
const DEVELOPMENT_TIME_VALUES = [ 
  'Respcted',
  'Not Respected',
]
const NOTE_STATUS_VALUES = [
  '+',
  '-',
]
const CUSTOMER_DUE_DATE_STATUS_VALUES = [
  'Done',
  'In progress',
  'Blocked',
]