const STATUS_VALUES = [
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

const APPROVAL_STATUS_VALUES = [
  'Not requested',
  'Approved',
  'Not approved',
  'To be approved',
  'Ready for app',
  'Need to be reworked',
]

const ROLE_VALUES = ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user']
const DESIGN_TYPE_VALUES = ['Customer Design', 'AVO Design']

const SHARED_TEMPLATE_FIELDS = {
  pilotLabel: 'Pilot',
  approverLabel: 'Esc level 1 / Approver',
  approverRole: 'manager',
  fillRoles: ['pilot', 'manager', 'admin'],
  viewRoles: ['pilot', 'manager', 'admin', 'pm', 'sales', 'pl', 'user'],
  defaultStatus: 'To be planned',
  defaultApprovalStatus: 'Not requested',
}

const INITIAL_COSTING_TEMPLATES = [
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'needed-data-understood',
    title: 'All needed data are available and understood',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'technical-feasibility-assessment',
    title: 'Technical feasibility assessment is available for customer communication',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'bom-spec-completed',
    title: 'BoM and spec are correctly completed inside the costing file',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'avo-design-assembly-2d',
    title: 'AVO Design owner : assembly 2D is available for customer communication',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'bom-cost-ready',
    title: 'BoM cost is ready for costing calculation (estimated at 60% max)',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'assembly-cost-line',
    title: 'Assembly cost and line are available inside the costing file (estimated at max 60%)',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'costing-file-reviewed',
    title: 'Costing file is reviewed and approved with N+1',
  },
]

const IMPROVED_COSTING_TEMPLATES = [
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'needed-data-understood',
    title: 'Customer feedback is available and understood',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'technical-feasibility-assessment',
    title:
      'Technical feasibility assessment is reviewed by minimum 2 team members and available for customer communication',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'bom-spec-completed',
    title: 'BoM and spec are correctly completed inside the costing file',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'avo-design-assembly-2d',
    title: 'AVO Design owner : assembly and components are available',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'bom-cost-ready',
    title: 'BoM cost is ready for costing calculation (all components are quoted by supplier)',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'assembly-cost-line',
    title:
      'Assembly cost and line are available inside the costing file and validated with costing leader',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'costing-file-reviewed',
    title: 'Costing file is reviewed and approved with N+1',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'project-risks-opportunities-ebit-bridge',
    title: 'Project risks and opportunities are listed and quoted (EBIT Bridge)',
  },
]

const LAST_CALL_COSTING_TEMPLATES = [
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'needed-data-understood',
    title: 'Customer feedback is available and understood',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'technical-feasibility-assessment',
    title: 'Technical feasibility assessment is ready for project kick off',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'bom-spec-completed',
    title: 'BoM and spec are correctly completed inside the costing file',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'avo-design-assembly-2d',
    title: 'AVO Design owner : assembly and components are ready for project kick off',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'bom-cost-ready',
    title: 'BoM cost is validated with purchasing department',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'assembly-cost-line',
    title: 'Assembly cost and line are ready for project kick off',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'costing-file-reviewed',
    title: 'Costing file is reviewed and approved with N+1',
  },
  {
    ...SHARED_TEMPLATE_FIELDS,
    key: 'project-risks-opportunities-ebit-bridge',
    title: 'Project risks and opportunities are listed and quoted (EBIT Bridge)',
  },
]

const TEMPLATES_BY_COSTING_TYPE = {
  'Initial Costing': INITIAL_COSTING_TEMPLATES,
  'Improved Costing': IMPROVED_COSTING_TEMPLATES,
  'Last Call Costing': LAST_CALL_COSTING_TEMPLATES,
}

const SUPPORTED_COSTING_TYPES = Object.keys(TEMPLATES_BY_COSTING_TYPE)

function getTrimmedText(value) {
  return String(value || '').trim()
}

function getTemplatesForCostingType(costingType) {
  return TEMPLATES_BY_COSTING_TYPE[getTrimmedText(costingType)] || []
}

function getTemplateByKey(costingType, key) {
  const normalizedKey = getTrimmedText(key)
  return (
    getTemplatesForCostingType(costingType).find((template) => template.key === normalizedKey) ||
    null
  )
}

function getAllTemplates() {
  return Object.values(TEMPLATES_BY_COSTING_TYPE).flatMap((templates) => templates)
}

module.exports = {
  APPROVAL_STATUS_VALUES,
  DESIGN_TYPE_VALUES,
  ROLE_VALUES,
  STATUS_VALUES,
  SUPPORTED_COSTING_TYPES,
  TEMPLATES_BY_COSTING_TYPE,
  getAllTemplates,
  getTemplateByKey,
  getTemplatesForCostingType,
}
