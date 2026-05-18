const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')
const ElementProductDesign = require('./element-product-design')

const TWO_D_STATUS_VALUES = ['Not requested', 'Execution', 'Prototype/RFQ', 'Concept/RFI']
const STATUS_ELEMENT_VALUES = [
  'Not requested',
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
  'Not requested',
  'Customer validation in progress',
  'Done',
  'Blocked',
  'Need to be reworked',
]
const SHARED_TO_VALUES = ['Not requested', 'Supplier', 'Customer', 'AVO Teams']

const SubElementProductDesign = sequelize.define(
  'SubElementProductDesign',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    element_product_design_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: ElementProductDesign.getTableName(),
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
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
    index: {
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
      type: DataTypes.STRING,
      allowNull: true,
    },
    validator: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    validation: {
      type: DataTypes.ENUM(...VALIDATION_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    input: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    output: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    shared_to: {
      type: DataTypes.ENUM(...SHARED_TO_VALUES),
      allowNull: true,
      defaultValue: 'Not requested',
    },
    date_of_sharing: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    comment_change_index: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    number_hours: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
  },
  {
    tableName: 'sub-element-product-design',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_spd_element_id',
        fields: ['element_product_design_id'],
      },
      {
        name: 'idx_spd_element_order',
        fields: ['element_product_design_id', 'display_order'],
      },
    ],
  },
)

module.exports = SubElementProductDesign
module.exports.TWO_D_STATUS_VALUES = TWO_D_STATUS_VALUES
module.exports.STATUS_ELEMENT_VALUES = STATUS_ELEMENT_VALUES
module.exports.VALIDATION_VALUES = VALIDATION_VALUES
module.exports.SHARED_TO_VALUES = SHARED_TO_VALUES
