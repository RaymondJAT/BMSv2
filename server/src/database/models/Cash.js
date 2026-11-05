/**
 * ⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 */

/**
 * @typedef {Object} RequestCols
 * @property {'cr_id'} id
 * @property {'cr_reference_id'} reference_id
 * @property {'cr_cv_number'} cv_number
 * @property {'cr_purpose'} purpose
 * @property {'cr_project'} project
 * @property {'cr_amount'} amount
 * @property {'cr_revolving_fund_id'} revolving_fund_id
 * @property {'cr_employee_id'} employee_id
 * @property {'cr_department_id'} department_id
 * @property {'cr_team_lead'} team_lead
 * @property {'cr_request_date'} request_date
 * @property {'cr_request_type'} request_type
 * @property {'cr_status'} status
 * @property {'cr_createdAt'} createdAt
 * @property {'cr_updated_at'} updated_at
 */

/**
 * @typedef {Object} DisbursementCols
 * @property {'cd_id'} id
 * @property {'cd_cash_request_id'} cash_request_id
 * @property {'cd_date_issued'} date_issued
 * @property {'cd_received_by'} received_by
 * @property {'cd_revolving_fund_id'} revolving_fund_id
 * @property {'cd_department_id'} department_id
 * @property {'cd_purpose'} purpose
 * @property {'cd_amount_issued'} amount_issued
 * @property {'cd_cash_voucher'} cash_voucher
 * @property {'cd_amount_returned'} amount_returned
 * @property {'cd_outstanding_amount'} outstanding_amount
 * @property {'cd_amount_expended'} amount_expended
 * @property {'cd_status'} status
 * @property {'cd_createdAt'} createdAt
 */

/**
 * @typedef {Object} DisbursementFileCols
 * @property {'cdf_id'} id
 * @property {'cdf_cash_disbursement_id'} cash_disbursement_id
 * @property {'cdf_image'} image
 * @property {'cdf_createdAt'} createdAt
 */

/**
 * @typedef {Object} DisbursementActivityCols
 * @property {'cda_id'} id
 * @property {'cda_cash_disbursement_id'} cash_disbursement_id
 * @property {'cda_amount'} amount
 * @property {'cda_remarks'} remarks
 * @property {'cda_purpose'} purpose
 * @property {'cda_createdAt'} createdAt
 */

/**
 * @typedef {Object} RequestActivityCols
 * @property {'cra_id'} id
 * @property {'cra_user_id'} user_id
 * @property {'cra_cash_request_id'} cash_request_id
 * @property {'cra_action'} action
 * @property {'cra_remarks'} remarks
 * @property {'cra_createdAt'} createdAt
 * @property {'cra_updatedAt'} updatedAt
 */

const Cash = {
  Request: {
    table: 'cash_request',
    pk: 'cr_id',
    prefix: 'cr',
    /** @type {RequestCols} */
    cols: {
      id: 'cr_id',
      reference_id: 'cr_reference_id',
      cv_number: 'cr_cv_number',
      purpose: 'cr_purpose',
      project: 'cr_project',
      amount: 'cr_amount',
      revolving_fund_id: 'cr_revolving_fund_id',
      employee_id: 'cr_employee_id',
      department_id: 'cr_department_id',
      team_lead: 'cr_team_lead',
      request_date: 'cr_request_date',
      request_type: 'cr_request_type',
      status: 'cr_status',
      createdAt: 'cr_createdAt',
      updated_at: 'cr_updated_at',
    },
    select: ['cr_id', 'cr_reference_id', 'cr_cv_number', 'cr_purpose', 'cr_project', 'cr_amount', 'cr_revolving_fund_id', 'cr_employee_id', 'cr_department_id', 'cr_team_lead', 'cr_request_date', 'cr_request_type', 'cr_status', 'cr_createdAt', 'cr_updated_at'],
    insert: ['cr_reference_id', 'cr_cv_number', 'cr_purpose', 'cr_project', 'cr_amount', 'cr_revolving_fund_id', 'cr_employee_id', 'cr_department_id', 'cr_team_lead', 'cr_request_type', 'cr_status'],
  },
  Disbursement: {
    table: 'cash_disbursement',
    pk: 'cd_id',
    prefix: 'cd',
    /** @type {DisbursementCols} */
    cols: {
      id: 'cd_id',
      cash_request_id: 'cd_cash_request_id',
      date_issued: 'cd_date_issued',
      received_by: 'cd_received_by',
      revolving_fund_id: 'cd_revolving_fund_id',
      department_id: 'cd_department_id',
      purpose: 'cd_purpose',
      amount_issued: 'cd_amount_issued',
      cash_voucher: 'cd_cash_voucher',
      amount_returned: 'cd_amount_returned',
      outstanding_amount: 'cd_outstanding_amount',
      amount_expended: 'cd_amount_expended',
      status: 'cd_status',
      createdAt: 'cd_createdAt',
    },
    select: ['cd_id', 'cd_cash_request_id', 'cd_date_issued', 'cd_received_by', 'cd_revolving_fund_id', 'cd_department_id', 'cd_purpose', 'cd_amount_issued', 'cd_cash_voucher', 'cd_amount_returned', 'cd_outstanding_amount', 'cd_amount_expended', 'cd_status', 'cd_createdAt'],
    insert: ['cd_cash_request_id', 'cd_received_by', 'cd_revolving_fund_id', 'cd_department_id', 'cd_purpose', 'cd_amount_issued', 'cd_cash_voucher', 'cd_amount_returned', 'cd_outstanding_amount', 'cd_amount_expended', 'cd_status'],
  },
  DisbursementFile: {
    table: 'cash_disbursement_file',
    pk: 'cdf_id',
    prefix: 'cdf',
    /** @type {DisbursementFileCols} */
    cols: {
      id: 'cdf_id',
      cash_disbursement_id: 'cdf_cash_disbursement_id',
      image: 'cdf_image',
      createdAt: 'cdf_createdAt',
    },
    select: ['cdf_id', 'cdf_cash_disbursement_id', 'cdf_image', 'cdf_createdAt'],
    insert: ['cdf_cash_disbursement_id', 'cdf_image'],
  },
  DisbursementActivity: {
    table: 'cash_disbursement_activity',
    pk: 'cda_id',
    prefix: 'cda',
    /** @type {DisbursementActivityCols} */
    cols: {
      id: 'cda_id',
      cash_disbursement_id: 'cda_cash_disbursement_id',
      amount: 'cda_amount',
      remarks: 'cda_remarks',
      purpose: 'cda_purpose',
      createdAt: 'cda_createdAt',
    },
    select: ['cda_id', 'cda_cash_disbursement_id', 'cda_amount', 'cda_remarks', 'cda_purpose', 'cda_createdAt'],
    insert: ['cda_cash_disbursement_id', 'cda_amount', 'cda_remarks', 'cda_purpose'],
  },
  RequestActivity: {
    table: 'cash_request_activity',
    pk: 'cra_id',
    prefix: 'cra',
    /** @type {RequestActivityCols} */
    cols: {
      id: 'cra_id',
      user_id: 'cra_user_id',
      cash_request_id: 'cra_cash_request_id',
      action: 'cra_action',
      remarks: 'cra_remarks',
      createdAt: 'cra_createdAt',
      updatedAt: 'cra_updatedAt',
    },
    select: ['cra_id', 'cra_user_id', 'cra_cash_request_id', 'cra_action', 'cra_remarks', 'cra_createdAt', 'cra_updatedAt'],
    insert: ['cra_user_id', 'cra_cash_request_id', 'cra_action', 'cra_remarks'],
  },
};

exports.Cash = Cash;