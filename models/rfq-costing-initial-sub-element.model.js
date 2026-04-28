const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')

const INITIAL_SUB_ELEMENT_STATUS_VALUES = [
  'To be planned',
  'Not requested',
  'Ready to start',
  'Escalation level 1',
  'In progress',
  'Late!',
  'Done',
  'Question to PM',
  'Question to sales',
  'Question to PL',
  'Help!!!',
]

const INITIAL_SUB_ELEMENT_APPROVAL_STATUS_VALUES = [
  'Not requested',
  'Approved',
  'Not approved',
  'To be approved',
  'Ready for app',
  'Need to be reworked',
]

const INITIAL_SUB_ELEMENT_ROLE_VALUES = ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user']
const INITIAL_SUB_ELEMENT_DESIGN_TYPE_VALUES = ['Customer Design', 'AVO Design']

const INITIAL_SUB_ELEMENT_TEMPLATES = [
  {
    key: 'needed-data-understood',
    title: 'All needed data are available and understood',
    pilotLabel: 'Pilot',
    approverLabel: 'Esc level 1 / Approver',
    approverRole: 'manager',
    fillRoles: ['pilot', 'manager', 'admin'],
    viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
    defaultStatus: 'To be planned',
    defaultApprovalStatus: 'Not requested',
  },
  {
    key: 'technical-feasibility-assessment',
    title: 'Technical feasibility assessment is available for customer communication',
    pilotLabel: 'Pilot',
    approverLabel: 'Esc level 1 / Approver',
    approverRole: 'manager',
    fillRoles: ['pilot', 'manager', 'admin'],
    viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
    defaultStatus: 'To be planned',
    defaultApprovalStatus: 'Not requested',
  },
  {
    key: 'bom-spec-completed',
    title: 'BoM and spec are correctly completed inside the costing file',
    pilotLabel: 'Pilot',
    approverLabel: 'Esc level 1 / Approver',
    approverRole: 'manager',
    fillRoles: ['pilot', 'manager', 'admin'],
    viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
    defaultStatus: 'To be planned',
    defaultApprovalStatus: 'Not requested',
  },
  {
    key: 'avo-design-assembly-2d',
    title: 'AVO Design owner : assembly 2D is available for customer communication',
    pilotLabel: 'Pilot',
    approverLabel: 'Esc level 1 / Approver',
    approverRole: 'manager',
    fillRoles: ['pilot', 'manager', 'admin'],
    viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
    defaultStatus: 'To be planned',
    defaultApprovalStatus: 'Not requested',
  },
  {
    key: 'bom-cost-ready',
    title: 'BoM cost is ready for costing calculation (estimated at 60% max)',
    pilotLabel: 'Pilot',
    approverLabel: 'Esc level 1 / Approver',
    approverRole: 'manager',
    fillRoles: ['pilot', 'manager', 'admin'],
    viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
    defaultStatus: 'To be planned',
    defaultApprovalStatus: 'Not requested',
  },
  {
    key: 'assembly-cost-line',
    title: 'Assembly cost and line are available inside the costing file (estimated at max 60%)',
    pilotLabel: 'Pilot',
    approverLabel: 'Esc level 1 / Approver',
    approverRole: 'manager',
    fillRoles: ['pilot', 'manager', 'admin'],
    viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
    defaultStatus: 'To be planned',
    defaultApprovalStatus: 'Not requested',
  },
  {
    key: 'costing-file-reviewed',
    title: 'Costing file is reviewed and approved with N+1',
    pilotLabel: 'Pilot',
    approverLabel: 'Esc level 1 / Approver',
    approverRole: 'manager',
    fillRoles: ['pilot', 'manager', 'admin'],
    viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
    defaultStatus: 'To be planned',
    defaultApprovalStatus: 'Not requested',
  },
]

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
      type: DataTypes.ENUM(...INITIAL_SUB_ELEMENT_STATUS_VALUES),
      allowNull: false,
      defaultValue: 'To be planned',
    },
    approval_status: {
      type: DataTypes.ENUM(...INITIAL_SUB_ELEMENT_APPROVAL_STATUS_VALUES),
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
      type: DataTypes.ENUM(...INITIAL_SUB_ELEMENT_DESIGN_TYPE_VALUES),
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

RfqCostingInitialSubElement.STATUS_VALUES = INITIAL_SUB_ELEMENT_STATUS_VALUES
RfqCostingInitialSubElement.APPROVAL_STATUS_VALUES = INITIAL_SUB_ELEMENT_APPROVAL_STATUS_VALUES
RfqCostingInitialSubElement.ROLE_VALUES = INITIAL_SUB_ELEMENT_ROLE_VALUES
RfqCostingInitialSubElement.DESIGN_TYPE_VALUES = INITIAL_SUB_ELEMENT_DESIGN_TYPE_VALUES
RfqCostingInitialSubElement.TEMPLATES = INITIAL_SUB_ELEMENT_TEMPLATES

module.exports = RfqCostingInitialSubElement
