const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')
const {
  APPROVAL_STATUS_VALUES,
  DESIGN_TYPE_VALUES,
  ROLE_VALUES,
  STATUS_VALUES,
  SUPPORTED_COSTING_TYPES,
  TEMPLATES_BY_COSTING_TYPE,
  getAllTemplates,
  getTemplateByKey,
  getTemplatesForCostingType,
} = require('./rfq-costing-sub-element.config')

const RfqCostingInitialSubElement = sequelize.define(
  'RfqCostingInitialSubElement',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    rfq_costing_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'rfq_costing',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pilot: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    approver: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...STATUS_VALUES),
      allowNull: false,
      defaultValue: 'To be planned',
    },
    approval_status: {
      type: DataTypes.ENUM(...APPROVAL_STATUS_VALUES),
      allowNull: false,
      defaultValue: 'Not requested',
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    link: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    approval_token: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    approval_token_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    design_type: {
      type: DataTypes.ENUM(...DESIGN_TYPE_VALUES),
      allowNull: true,
    },
  },
  {
    tableName: 'rfq_costing_initial_sub_elements',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['rfq_costing_id'],
      },
      {
        fields: ['key'],
      },
      {
        unique: true,
        fields: ['rfq_costing_id', 'key'],
      },
    ],
  },
)

RfqCostingInitialSubElement.STATUS_VALUES = STATUS_VALUES
RfqCostingInitialSubElement.APPROVAL_STATUS_VALUES = APPROVAL_STATUS_VALUES
RfqCostingInitialSubElement.ROLE_VALUES = ROLE_VALUES
RfqCostingInitialSubElement.DESIGN_TYPE_VALUES = DESIGN_TYPE_VALUES
RfqCostingInitialSubElement.SUPPORTED_COSTING_TYPES = SUPPORTED_COSTING_TYPES
RfqCostingInitialSubElement.TEMPLATES_BY_COSTING_TYPE = TEMPLATES_BY_COSTING_TYPE
RfqCostingInitialSubElement.TEMPLATES = getAllTemplates()
RfqCostingInitialSubElement.getTemplateByKey = getTemplateByKey
RfqCostingInitialSubElement.getTemplatesForCostingType = getTemplatesForCostingType

module.exports = RfqCostingInitialSubElement
