const { Query, Transaction, SQLQueryBuilder } = require('../database/utilities/queries.util')
const { resolveDateRange, addDateCondition } = require('../utilities/dateRange.util')
const { Cash } = require('../database/models/Cash')
const { Revolving } = require('../database/models/Revolving')
const { hasOutstandingLiquidation } = require('./liquidation-liquidation.controller')
const SQL = new SQLQueryBuilder()

// ==========================================
// CONSTANTS
// ==========================================

const CR_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
}

// Statuses a Requester may still edit — PENDING (untouched) or REJECTED
// (returned for correction). APPROVED/COMPLETED are owned by later stages.
const EDITABLE_CR_STATUSES = [CR_STATUS.PENDING, CR_STATUS.REJECTED]

// PENDING = still with the Team Leader. APPROVED = Team-Lead-approved, now
// with the Fund Custodian. Either can still be rejected; COMPLETED cannot.
const REJECTABLE_CR_STATUSES = [CR_STATUS.PENDING, CR_STATUS.APPROVED]

/**
 * Fund statuses that can never accept NEW cash leaving them. Identical to
 * cashDisbursementController.js's NON_ISSUABLE_RF_STATUSES — a Cash
 * Request being completed pulls cash out of its fund exactly like a fresh
 * issue does, so the same guard applies.
 */
const NON_ISSUABLE_RF_STATUSES = ['CLOSED', 'CLEARED', 'RETURN']

/**
 * Purposes that make a request TRAVEL EXPENSES (-> Travel liquidation
 * form on the frontend). Everything else is BUDGET (-> Miscellaneous
 * form). Case-insensitive so dropdown values like "Travel Allowance" and
 * "Maintenance" match. 'rotation' and 'pick-?up' cover "Rotation/Pick-up".
 */
const TRAVEL_REGEX =
  /travel expenses|travel|new store|renovation|installation|maintenance|cable pulling|transportation allowance|travel allowance|cable pulling allowance|transportation expenses|deployment|deploy|deployed|transporation|transpo|preventive maintenance|rotation|pick-?up/i

// Rotation/Pick-up is always travel, regardless of what the client sends.
const FORCED_TRAVEL_REGEX = /rotation|pick-?up/i

const REQUEST_TYPES = {
  TRAVEL: 'TRAVEL EXPENSES',
  BUDGET: 'BUDGET',
}

const isTravelPurpose = (purpose) => typeof purpose === 'string' && TRAVEL_REGEX.test(purpose)

/**
 * Resolution order:
 *   1. Rotation/Pick-up purposes -> always TRAVEL EXPENSES
 *   2. A valid request_type sent by the client (derived from Slink) wins
 *   3. Otherwise fall back to the purpose regex
 */
const resolveRequestType = (purpose, requestType) => {
  if (typeof purpose === 'string' && FORCED_TRAVEL_REGEX.test(purpose)) {
    return REQUEST_TYPES.TRAVEL
  }

  const sentType = typeof requestType === 'string' ? requestType.trim().toUpperCase() : ''
  if (Object.values(REQUEST_TYPES).includes(sentType)) return sentType

  return isTravelPurpose(purpose) ? REQUEST_TYPES.TRAVEL : REQUEST_TYPES.BUDGET
}

// ==========================================
// SHARED HELPERS
// (duplicated rather than imported from cashDisbursementController.js /
// revolvingFundController.js — matches this codebase's existing
// per-controller pattern.)
// ==========================================

const wrapRow = (row, model) => {
  if (!row || !model?.cols) return row
  const reverse = {}
  for (const [key, dbCol] of Object.entries(model.cols)) {
    if (dbCol !== key) reverse[dbCol] = key
  }
  return new Proxy(row, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver)
      if (typeof prop === 'string' && reverse[prop] !== undefined) return target[reverse[prop]]
      return undefined
    },
  })
}

const parseNum = (val, defaultVal = 0) => {
  if (val === null || val === undefined) return defaultVal
  const parsed = parseFloat(val)
  return isNaN(parsed) ? defaultVal : parsed
}

/**
 * Transaction() expects an array of { sql, values }, but the query builder's
 * .build() returns { sql, bindings }. This adapts one to the other.
 */
const toTxQuery = ({ sql, bindings }) => ({ sql, values: bindings })

/**
 * TEMP: no real RBAC wired up yet, matching the `req.userId || req.user?.id
 * || 1` fallback used everywhere else in this codebase. Until auth lands,
 * this ENFORCES the check whenever a role is actually present on the
 * request, and only WARNS (never silently passes without a trace) when
 * it's missing. Replace the `if (!role)` branch with a hard 401/403 once
 * auth is wired up.
 */
const getRequestUserId = (req) => req.userId || req.user?.id || 1

const requireRole = (req, res, allowedRoles) => {
  const role = req.userRole || req.user?.role
  if (!role) {
    console.warn(
      `WARNING: role check skipped (no auth wired up yet) — endpoint requires one of [${allowedRoles.join(', ')}]`,
    )
    return true
  }
  if (!allowedRoles.includes(role)) {
    res.status(403).json({
      message: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
    })
    return false
  }
  return true
}

// Thin wrappers around res.status(...).json(...) so every handler below
// reads as "what happened" instead of repeating the same status/json
// boilerplate. Behavior/messages are unchanged from before this refactor.
const respond = {
  badRequest: (res, message, extra) => res.status(400).json({ message, ...extra }),
  notFound: (res, message) => res.status(404).json({ message }),
  ok: (res, payload) => res.status(200).json(payload),
  created: (res, payload) => res.status(201).json(payload),
  serverError: (res, message, extra) => res.status(500).json({ message, ...extra }),
}

/**
 * Logs `Error in <context>:` (same format every handler used before) and
 * sends the 500 response. Pass includeErrorDetail: true only where the
 * original endpoint exposed error.message to the client
 * (completeCashRequest was the only one that did).
 */
const handleServerError = (res, context, error, userMessage, includeErrorDetail = false) => {
  console.error(`Error in ${context}:`, error)
  return respond.serverError(
    res,
    userMessage,
    includeErrorDetail ? { error: error.message } : undefined,
  )
}

/**
 * Guard clause for "this status transition isn't allowed". Returns true
 * (and has already sent the 400 response) when the request should stop;
 * false when the caller should keep going. Message is passed in verbatim
 * so each handler keeps its own exact wording.
 */
const rejectIfStatusNotIn = (res, currentStatus, allowedStatuses, message) => {
  if (allowedStatuses.includes(currentStatus)) return false
  respond.badRequest(res, message)
  return true
}

// ==========================================
// DOMAIN READ HELPERS
// ==========================================

const getCashRequestById = async (id) => {
  const { sql, bindings } = SQL.model(Cash.Request)
    .select(Cash.Request.select)
    .where(Cash.Request.pk, id)
    .build()
  const [row] = await Query(sql, bindings)
  return wrapRow(row, Cash.Request)
}

/**
 * Fetches a Cash Request and sends a 404 (returning null) if it doesn't
 * exist, so every handler can do:
 *   const cr = await getCashRequestOrRespond(id, res)
 *   if (!cr) return
 * instead of repeating the not-found check five times.
 */
const getCashRequestOrRespond = async (id, res) => {
  const cr = await getCashRequestById(id)
  if (!cr) {
    respond.notFound(res, 'Cash request not found')
    return null
  }
  return cr
}

const getRevolvingFundById = async (id) => {
  const { sql, bindings } = SQL.model(Revolving.Fund)
    .select(Revolving.Fund.select)
    .where(Revolving.Fund.pk, id)
    .build()
  const [row] = await Query(sql, bindings)
  return wrapRow(row, Revolving.Fund)
}

/** Duplicate-disbursement guard: at most one cash_disbursement may ever
 * reference a given cash_request_id. */
const getDisbursementForCashRequest = async (cashRequestId) => {
  const { sql, bindings } = SQL.model(Cash.Disbursement)
    .select([Cash.Disbursement.cols.id])
    .where(Cash.Disbursement.cols.cash_request_id, cashRequestId)
    .build()
  const rows = await Query(sql, bindings)
  return rows[0] || null
}

// ==========================================
// ID / VOUCHER GENERATORS
// ==========================================

/**
 * Reference IDs follow the same CR-YYMMDD-#### scheme as BMS V1
 * (createcash_request in the V1 router), just recomputed here rather than
 * shared, per this file's stated no-cross-controller-imports convention.
 */
const generateReferenceId = async () => {
  const rows = await Query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(cr_reference_id, '-', -1) AS UNSIGNED)) AS max_sequence
     FROM cash_request
     WHERE cr_reference_id LIKE CONCAT('CR-', DATE_FORMAT(NOW(), '%y%m%d'), '-%')`,
  )
  const maxSequence = rows[0]?.max_sequence || 0
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const sequence = String(maxSequence + 1).padStart(4, '0')
  return `CR-${year}${month}${day}-${sequence}`
}

/**
 * Cash voucher numbers are a single ascending sequence, unlike the
 * date-scoped Cash Request reference id (generateReferenceId) — auditors
 * expect gaps/duplicates in a voucher sequence to be visible, which a
 * per-day reset would hide. Scanned against cash_disbursement (not
 * cash_request) since cd_cash_voucher is the field actually reused/
 * limited against elsewhere (see checkCashVoucherLimit in
 * cashDisbursementController.js).
 *
 * NOTE: this read isn't inside a transaction, so two Fund Custodians
 * completing two different requests near-simultaneously could generate
 * the same voucher number. If that's a real risk in your deployment, add
 * a UNIQUE constraint on cd_cash_voucher and retry-on-collision, or
 * switch to a DB sequence — same caveat applies to generateReferenceId.
 */
const generateCashVoucher = async () => {
  const rows = await Query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(cd_cash_voucher, '-', -1) AS UNSIGNED)) AS max_sequence
     FROM cash_disbursement
     WHERE cd_cash_voucher LIKE 'CV-%'`,
  )
  const maxSequence = rows[0]?.max_sequence || 0
  return `CV-${String(maxSequence + 1).padStart(6, '0')}`
}

/**
 * Builds (but doesn't run) an INSERT into cash_request_activity. Every
 * workflow step below logs one of these — factored out so the five call
 * sites don't each repeat the same column mapping.
 */
const buildActivityInsert = ({ userId, cashRequestId, action, remarks }) =>
  SQL.model(Cash.RequestActivity)
    .insert({
      [Cash.RequestActivity.cols.user_id]: userId,
      [Cash.RequestActivity.cols.cash_request_id]: cashRequestId,
      [Cash.RequestActivity.cols.action]: action,
      [Cash.RequestActivity.cols.remarks]: remarks,
    })
    .build()

// ==========================================
// WORKFLOW: CREATE (Requester) -> PENDING
// ==========================================

/**
 * @name createCashRequest
 * @description Requester creates a Cash Request. Status is always PENDING
 *              on creation — no Cash Disbursement, no Revolving Fund
 *              deduction, no Budget utilization happens at this stage; the
 *              request is purely a request until Team Lead approval and
 *              Fund Custodian completion (see completeCashRequest).
 *
 *              The target Revolving Fund is NOT collected here at all —
 *              revolving_fund_id is only ever assigned at completion time
 *              by the Fund Custodian (see completeCashRequest).
 */
const createCashRequest = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = 'Requester creates a Cash Request. Always starts PENDING — no financial effect yet.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['project'] = { in: 'formData', type: 'string', required: true, description: 'Project this request is charged against' }
    #swagger.parameters['purpose'] = { in: 'formData', type: 'string', required: true, description: 'Purpose of the request' }
    #swagger.parameters['amount'] = { in: 'formData', type: 'number', required: true, description: 'Requested amount' }
    #swagger.parameters['employee_id'] = { in: 'formData', type: 'integer', required: true, description: 'Requesting employee id (master_employee.me_id)' }
    #swagger.parameters['department_id'] = { in: 'formData', type: 'integer', required: true, description: 'Department id (master_department.md_id)' }
    #swagger.parameters['team_lead'] = { in: 'formData', type: 'string', required: true, description: 'Team lead name/identifier responsible for approval' }
    #swagger.parameters['request_date'] = { in: 'formData', type: 'string', required: false, description: 'Request date, defaults to now' }
  */

  const userId = getRequestUserId(req)
  const {
    project,
    purpose,
    amount,
    employee_id,
    department_id,
    team_lead,
    request_date,
    request_type,
  } = req.body

  if (
    !project ||
    !purpose ||
    amount === undefined ||
    !employee_id ||
    !department_id ||
    !team_lead
  ) {
    return respond.badRequest(
      res,
      'Missing required fields: project, purpose, amount, employee_id, department_id, team_lead',
    )
  }

  const requestAmount = parseNum(amount)
  if (requestAmount <= 0) {
    return respond.badRequest(res, 'amount must be greater than zero')
  }

  const blocked = await hasOutstandingLiquidation(employee_id)
  if (blocked) {
    return respond.badRequest(
      res,
      'You cannot create a new Cash Request until your previous Cash Request has been fully liquidated.',
    )
  }

  // Request type decides which liquidation form is used later
  // (TRAVEL EXPENSES -> Travel form, BUDGET -> Miscellaneous form).
  const finalRequestType = resolveRequestType(purpose, request_type)

  try {
    const referenceId = await generateReferenceId()

    const insertQuery = SQL.model(Cash.Request)
      .insert({
        [Cash.Request.cols.reference_id]: referenceId,
        [Cash.Request.cols.cv_number]: '',
        [Cash.Request.cols.purpose]: purpose,
        [Cash.Request.cols.project]: project,
        [Cash.Request.cols.amount]: requestAmount,
        [Cash.Request.cols.request_type]: finalRequestType,
        [Cash.Request.cols.revolving_fund_id]: null,
        [Cash.Request.cols.employee_id]: employee_id,
        [Cash.Request.cols.department_id]: department_id,
        [Cash.Request.cols.team_lead]: team_lead,
        [Cash.Request.cols.request_date]: request_date || new Date(),
        [Cash.Request.cols.status]: CR_STATUS.PENDING,
      })
      .build()

    const insertResult = await Query(insertQuery.sql, insertQuery.bindings)
    const newRequestId = insertResult.insertId

    try {
      const activityQuery = buildActivityInsert({
        userId,
        cashRequestId: newRequestId,
        action: 'REQUESTED',
        remarks: `Cash request ${referenceId} created for ₱${requestAmount.toFixed(2)}.`,
      })
      await Transaction([toTxQuery(activityQuery)])
    } catch (txError) {
      try {
        const { sql: delSql, bindings: delBindings } = SQL.model(Cash.Request)
          .delete()
          .where(Cash.Request.pk, newRequestId)
          .build()
        await Query(delSql, delBindings)
      } catch (compensationError) {
        console.error(
          `CRITICAL: failed to compensate orphaned cash_request id ${newRequestId} after transaction failure:`,
          compensationError,
        )
      }
      throw txError
    }

    return respond.created(res, {
      message: 'Cash request created successfully',
      id: newRequestId,
      reference_id: referenceId,
      request_type: finalRequestType,
    })
  } catch (error) {
    return handleServerError(res, 'createCashRequest', error, 'Error creating cash request')
  }
}

// ==========================================
// WORKFLOW: APPROVE (Team Lead) -> APPROVED
// ==========================================

/**
 * @name approveCashRequest
 * @description Team Lead approves a PENDING Cash Request. Only flips
 *              status to APPROVED — no Cash Disbursement, no financial
 *              effect. Only PENDING requests can be approved.
 */
const approveCashRequest = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = 'Team Lead approves a PENDING Cash Request. No financial effect — see completeCashRequest for that.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: true, description: 'Cash request id' }
    #swagger.parameters['remarks'] = { in: 'formData', type: 'string', required: false, description: 'Optional approval remarks' }
  */

  const userId = getRequestUserId(req)
  const { id, remarks } = req.body

  if (!id) return respond.badRequest(res, 'Missing required field: id')
  if (!requireRole(req, res, ['TEAM LEADER', 'ADMINISTRATOR'])) return

  try {
    const cr = await getCashRequestOrRespond(id, res)
    if (!cr) return

    const currentStatus = cr[Cash.Request.cols.status]
    if (
      rejectIfStatusNotIn(
        res,
        currentStatus,
        [CR_STATUS.PENDING],
        `Cannot approve a cash request with status ${currentStatus}. Only PENDING requests can be approved.`,
      )
    ) {
      return
    }

    const updateQuery = SQL.model(Cash.Request)
      .update({ [Cash.Request.cols.status]: CR_STATUS.APPROVED })
      .where(Cash.Request.pk, id)
      .build()

    const activityQuery = buildActivityInsert({
      userId,
      cashRequestId: id,
      action: 'APPROVED',
      remarks: remarks || 'Approved by team lead.',
    })

    await Transaction([toTxQuery(updateQuery), toTxQuery(activityQuery)])

    return respond.ok(res, { message: 'Cash request approved successfully' })
  } catch (error) {
    return handleServerError(res, 'approveCashRequest', error, 'Error approving cash request')
  }
}

// ==========================================
// WORKFLOW: REJECT -> REJECTED
// ==========================================

/**
 * @name rejectCashRequest
 * @description Reject a Cash Request that hasn't been completed yet.
 *              Allowed from PENDING (Team Lead declining) or APPROVED
 *              (Fund Custodian declining before releasing cash) — never
 *              from COMPLETED, which is terminal.
 */
const rejectCashRequest = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = 'Reject a PENDING or APPROVED Cash Request. No financial effect.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: true, description: 'Cash request id' }
    #swagger.parameters['remarks'] = { in: 'formData', type: 'string', required: true, description: 'Reason for rejection' }
  */

  const userId = getRequestUserId(req)
  const { id, remarks } = req.body

  if (!id) return respond.badRequest(res, 'Missing required field: id')
  if (!remarks)
    return respond.badRequest(res, 'Missing required field: remarks (reason for rejection)')
  if (!requireRole(req, res, ['TEAM LEADER', 'FUND CUSTODIAN', 'ADMINISTRATOR'])) return

  try {
    const cr = await getCashRequestOrRespond(id, res)
    if (!cr) return

    const currentStatus = cr[Cash.Request.cols.status]
    if (
      rejectIfStatusNotIn(
        res,
        currentStatus,
        REJECTABLE_CR_STATUSES,
        `Cannot reject a cash request with status ${currentStatus}.`,
      )
    ) {
      return
    }

    // This is the only reliable, no-migration way to know who was
    // rejecting, since cr_status doesn't retain it after the flip to
    // REJECTED.
    const rejectingStage = currentStatus === CR_STATUS.PENDING ? 'Team Leader' : 'Fund Custodian'
    const prefixedRemarks = `Rejected by ${rejectingStage}: ${remarks}`

    const updateQuery = SQL.model(Cash.Request)
      .update({ [Cash.Request.cols.status]: CR_STATUS.REJECTED })
      .where(Cash.Request.pk, id)
      .build()

    const activityQuery = buildActivityInsert({
      userId,
      cashRequestId: id,
      action: 'REJECTED',
      remarks: prefixedRemarks,
    })

    await Transaction([toTxQuery(updateQuery), toTxQuery(activityQuery)])
    return respond.ok(res, { message: 'Cash request rejected successfully' })
  } catch (error) {
    return handleServerError(res, 'rejectCashRequest', error, 'Error rejecting cash request')
  }
}

// ==========================================
// WORKFLOW: UPDATE (Requester, PENDING/REJECTED only)
// ==========================================

/**
 * @name updateCashRequest
 * @description Requester edits their own Cash Request. Only allowed while
 *              status is PENDING (not yet Team-Lead-acted-on) or REJECTED
 *              (returned for correction). Saving always resets status to
 *              PENDING and logs a REQUESTED activity entry — a resubmit is
 *              modeled as re-entering the Team Leader queue. Never touches
 *              revolving_fund_id, cv_number, or status fields beyond the
 *              reset above — those are owned by the approval stages, not
 *              by an edit. Changing the purpose re-derives request_type so
 *              the liquidation form stays in sync with the purpose.
 */
const updateCashRequest = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = 'Requester edits their own PENDING or REJECTED Cash Request. Always resets status to PENDING and re-enters the Team Leader queue.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: true, description: 'Cash request id' }
    #swagger.parameters['project'] = { in: 'formData', type: 'string', required: false, description: 'Project this request is charged against' }
    #swagger.parameters['purpose'] = { in: 'formData', type: 'string', required: false, description: 'Purpose of the request' }
    #swagger.parameters['amount'] = { in: 'formData', type: 'number', required: false, description: 'Requested amount' }
    #swagger.parameters['employee_id'] = { in: 'formData', type: 'integer', required: false, description: 'Requesting employee id (master_employee.me_id)' }
    #swagger.parameters['department_id'] = { in: 'formData', type: 'integer', required: false, description: 'Department id (master_department.md_id)' }
    #swagger.parameters['team_lead'] = { in: 'formData', type: 'string', required: false, description: 'Team lead name/identifier responsible for approval' }
    #swagger.parameters['request_date'] = { in: 'formData', type: 'string', required: false, description: 'Request date' }
  */

  const userId = getRequestUserId(req)
  const {
    id,
    project,
    purpose,
    amount,
    employee_id,
    department_id,
    team_lead,
    request_date,
    request_type,
  } = req.body

  if (!id) return respond.badRequest(res, 'Missing required field: id')

  try {
    const cr = await getCashRequestOrRespond(id, res)
    if (!cr) return

    const currentStatus = cr[Cash.Request.cols.status]
    if (
      rejectIfStatusNotIn(
        res,
        currentStatus,
        EDITABLE_CR_STATUSES,
        `Cannot edit a cash request with status ${currentStatus}. Only PENDING or REJECTED requests can be edited.`,
      )
    ) {
      return
    }

    const updateData = { [Cash.Request.cols.status]: CR_STATUS.PENDING }
    if (project !== undefined) updateData[Cash.Request.cols.project] = project
    if (purpose !== undefined) {
      updateData[Cash.Request.cols.purpose] = purpose

      // Rotation/Pick-up is always travel. Otherwise only change the stored type
      // when the client sent one (the frontend omits it when Slink is unreachable).
      const nextType = FORCED_TRAVEL_REGEX.test(purpose)
        ? REQUEST_TYPES.TRAVEL
        : request_type
          ? resolveRequestType(purpose, request_type)
          : undefined
      if (nextType) updateData[Cash.Request.cols.request_type] = nextType
    }
    if (amount !== undefined) {
      const newAmount = parseNum(amount)
      if (newAmount <= 0) {
        return respond.badRequest(res, 'amount must be greater than zero')
      }
      updateData[Cash.Request.cols.amount] = newAmount
    }
    if (employee_id !== undefined) updateData[Cash.Request.cols.employee_id] = employee_id
    if (department_id !== undefined) updateData[Cash.Request.cols.department_id] = department_id
    if (team_lead !== undefined) updateData[Cash.Request.cols.team_lead] = team_lead
    if (request_date !== undefined) updateData[Cash.Request.cols.request_date] = request_date

    const updateQuery = SQL.model(Cash.Request)
      .update(updateData)
      .where(Cash.Request.pk, id)
      .build()

    const activityQuery = buildActivityInsert({
      userId,
      cashRequestId: id,
      action: 'REQUESTED',
      remarks:
        currentStatus === CR_STATUS.REJECTED
          ? 'Edited and resubmitted after rejection — back in the Team Leader queue.'
          : 'Edited while pending Team Leader approval.',
    })

    await Transaction([toTxQuery(updateQuery), toTxQuery(activityQuery)])

    return respond.ok(res, { message: 'Cash request updated and resubmitted successfully' })
  } catch (error) {
    return handleServerError(res, 'updateCashRequest', error, 'Error updating cash request')
  }
}

// ==========================================
// WORKFLOW: COMPLETE (Fund Custodian) -> COMPLETED
// Creates the Cash Disbursement (the actual financial transaction).
// ==========================================

/**
 * Copied from cashDisbursementController.js. Moves a fund into ON REVIEW
 * the moment it has activity; never touches CLOSED/CLEARED/RETURN.
 */
const computeRfStatus = (currentStatus, hasActivity) => {
  if (currentStatus === 'CLOSED' || currentStatus === 'CLEARED' || currentStatus === 'RETURN') {
    return currentStatus
  }
  return hasActivity ? 'ON REVIEW' : currentStatus
}

/**
 * Recomputes a freshly-created cash_disbursement row's outstanding/status.
 * For a Cash-Request-generated disbursement this always resolves to
 * (outstanding = amount, status = UNLIQUIDATED) since returned/expended
 * start at 0.
 */
const computeCdStatus = (issued, returned, expended) => {
  const raw = parseNum(issued) - parseNum(returned) - parseNum(expended)
  const outstanding = Math.max(0, Math.round(raw * 100) / 100)
  const status = outstanding === 0 ? 'LIQUIDATED' : 'UNLIQUIDATED'
  return { outstanding, status }
}

/**
 * Pure math: what a Revolving Fund's issued/outstanding/balance/status
 * become after `requestAmount` is disbursed out of it. Split out from
 * completeCashRequest so the cascade arithmetic can be read (and tested)
 * on its own, separate from the DB/transaction plumbing around it.
 */
const computeFundCascadeAfterIssue = (rf, requestAmount) => {
  const issued = parseNum(rf[Revolving.Fund.cols.issued]) + requestAmount
  const outstanding = parseNum(rf[Revolving.Fund.cols.outstanding]) + requestAmount
  const balance = parseNum(rf[Revolving.Fund.cols.balance]) - requestAmount
  const status = computeRfStatus(rf[Revolving.Fund.cols.status], issued > 0)
  return { issued, outstanding, balance, status }
}

/**
 * Everything that must be true for an APPROVED Cash Request to be
 * completed, beyond the status check itself: it needs a project/purpose,
 * a positive amount, and no disbursement already generated for it. Returns
 * a { message, extra? } object describing the problem, or null if clear
 * to proceed.
 */
const findCompletionBlocker = async (cr, cashRequestId) => {
  const project = cr[Cash.Request.cols.project]
  const purpose = cr[Cash.Request.cols.purpose]
  if (!project || !purpose) {
    return { message: 'Cash request is missing project/purpose and cannot be completed.' }
  }

  const requestAmount = parseNum(cr[Cash.Request.cols.amount])
  if (requestAmount <= 0) {
    return { message: 'Cash request has an invalid amount and cannot be completed.' }
  }

  // Belt-and-suspenders duplicate guard — the status check in the caller
  // already makes this practically unreachable, but this catches any row
  // that nonetheless already has a linked disbursement, e.g. from a
  // retried request after a partial failure elsewhere.
  const existingCd = await getDisbursementForCashRequest(cashRequestId)
  if (existingCd) {
    return {
      message: 'A cash disbursement has already been generated for this cash request.',
      extra: { cash_disbursement_id: existingCd.id },
    }
  }

  return null
}

/**
 * Builds (but doesn't run) the five queries that must commit together once
 * the Cash Disbursement row itself already exists: its own activity log,
 * the Revolving Fund's cascade update + activity log, and the Cash
 * Request's flip to COMPLETED + activity log.
 */
const buildCompletionCascadeQueries = ({
  cr,
  id,
  fundId,
  newCdId,
  requestAmount,
  finalCashVoucher,
  project,
  purpose,
  fundCascade,
  userId,
  remarks,
}) => {
  const cdActivityQuery = SQL.model(Cash.DisbursementActivity)
    .insert({
      [Cash.DisbursementActivity.cols.cash_disbursement_id]: newCdId,
      [Cash.DisbursementActivity.cols.amount]: requestAmount,
      [Cash.DisbursementActivity.cols.remarks]:
        `Issued via Cash Request ${cr[Cash.Request.cols.reference_id]} — ${project} / ${purpose}: ₱${requestAmount.toFixed(2)}`,
      [Cash.DisbursementActivity.cols.purpose]: purpose,
    })
    .build()

  const rfUpdateQuery = SQL.model(Revolving.Fund)
    .update({
      [Revolving.Fund.cols.issued]: fundCascade.issued,
      [Revolving.Fund.cols.outstanding]: fundCascade.outstanding,
      [Revolving.Fund.cols.balance]: fundCascade.balance,
      [Revolving.Fund.cols.status]: fundCascade.status,
    })
    .where(Revolving.Fund.pk, fundId)
    .build()

  const rfActivityQuery = SQL.model(Revolving.FundActivity)
    .insert({
      [Revolving.FundActivity.cols.revolving_fund_id]: fundId,
      [Revolving.FundActivity.cols.remarks]:
        `Cash Request ${cr[Cash.Request.cols.reference_id]} completed and issued ₱${requestAmount.toFixed(2)} (Voucher ${finalCashVoucher}) — issued (${fundCascade.issued}), outstanding (${fundCascade.outstanding}), balance (${fundCascade.balance}), status: ${fundCascade.status}.`,
      [Revolving.FundActivity.cols.user_id]: userId,
    })
    .build()

  const crUpdateQuery = SQL.model(Cash.Request)
    .update({
      [Cash.Request.cols.status]: CR_STATUS.COMPLETED,
      [Cash.Request.cols.cv_number]: finalCashVoucher,
      [Cash.Request.cols.revolving_fund_id]: fundId,
    })
    .where(Cash.Request.pk, id)
    .build()

  // action: 'RECEIVED' — matches the existing cra_action ENUM (which has
  // no COMPLETED value).
  const crActivityQuery = buildActivityInsert({
    userId,
    cashRequestId: id,
    action: 'RECEIVED',
    remarks:
      remarks ||
      `Completed by fund custodian — cash disbursement #${newCdId} created (Voucher ${finalCashVoucher}, ₱${requestAmount.toFixed(2)}).`,
  })

  return [cdActivityQuery, rfUpdateQuery, rfActivityQuery, crUpdateQuery, crActivityQuery]
}

/**
 * @name completeCashRequest
 * @description Fund Custodian completes an APPROVED Cash Request. Only
 *              input needed from the custodian is which Revolving Fund to
 *              draw from. cd_purpose is copied straight from the request's
 *              own purpose (no separate categorization step here — that
 *              happens at Liquidation, via master_particulars on each
 *              liquidation_item, not here). cd_cash_voucher is generated
 *              server-side (see generateCashVoucher) as CV-###### the
 *              moment this call succeeds.
 *
 *              Generates exactly one cash_disbursement row (status
 *              UNLIQUIDATED) against the request's Revolving Fund and
 *              cascades to that fund's issued/outstanding/balance/status —
 *              identical to issueCashDisbursement's cascade in
 *              cashDisbursementController.js, since completing a request
 *              IS a fresh cash issuance in every way that matters
 *              financially. It does NOT touch Budget directly, for the
 *              same reason issueCashDisbursement doesn't: the Budget was
 *              already debited when this fund was funded/topped-up, and
 *              the Budget's Deployed/Remaining figures are derived live
 *              from the fund's own balance+outstanding.
 *
 *              The Cash Request itself is a workflow/approval record, not
 *              a financial one — its ₱ amount is never separately added to
 *              any utilization total. Only the resulting Cash Disbursement
 *              is the financial source of truth.
 *
 *              Idempotent: a request that's already COMPLETED, or that
 *              already has a linked cash_disbursement row for any reason,
 *              is rejected outright — at most one disbursement is ever
 *              created per request.
 *
 *              Project/Purpose traceability: the generated disbursement
 *              does NOT copy project onto itself, only purpose. It stores
 *              cd_cash_request_id, and Project is read by joining back to
 *              the source cash_request.
 */
const completeCashRequest = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = "Fund Custodian completes an APPROVED Cash Request by selecting a Revolving Fund. Purpose is copied from the request; cash voucher is generated automatically. Generates exactly one UNLIQUIDATED Cash Disbursement. Idempotent — rejects if already COMPLETED or already linked to a disbursement."
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: true, description: 'Cash request id' }
    #swagger.parameters['revolving_fund_id'] = { in: 'formData', type: 'integer', required: true, description: 'Revolving Fund to disburse from' }
    #swagger.parameters['remarks'] = { in: 'formData', type: 'string', required: false, description: 'Optional completion remarks' }
  */

  const userId = getRequestUserId(req)
  const { id, revolving_fund_id: fundId, remarks } = req.body

  if (!id) return respond.badRequest(res, 'Missing required field: id')
  if (!fundId) {
    return respond.badRequest(
      res,
      'Missing required field: revolving_fund_id — the Fund Custodian must select a fund before approving.',
    )
  }
  if (!requireRole(req, res, ['FUND CUSTODIAN', 'ADMINISTRATOR'])) return

  try {
    const cr = await getCashRequestOrRespond(id, res)
    if (!cr) return

    const currentStatus = cr[Cash.Request.cols.status]
    if (currentStatus === CR_STATUS.COMPLETED) {
      return respond.badRequest(res, 'This cash request has already been completed.')
    }
    if (
      rejectIfStatusNotIn(
        res,
        currentStatus,
        [CR_STATUS.APPROVED],
        `Cannot complete a cash request with status ${currentStatus}. Only APPROVED (Team-Lead-approved) requests can be completed.`,
      )
    ) {
      return
    }

    const blocker = await findCompletionBlocker(cr, id)
    if (blocker) return respond.badRequest(res, blocker.message, blocker.extra)

    const project = cr[Cash.Request.cols.project]
    const purpose = cr[Cash.Request.cols.purpose]
    const requestAmount = parseNum(cr[Cash.Request.cols.amount])

    const rf = await getRevolvingFundById(fundId)
    if (!rf) return respond.notFound(res, 'Selected revolving fund not found')

    const rfStatus = rf[Revolving.Fund.cols.status]
    if (NON_ISSUABLE_RF_STATUSES.includes(rfStatus)) {
      return respond.badRequest(
        res,
        `Cannot complete — selected revolving fund has status ${rfStatus}.`,
      )
    }

    const currentBalance = parseNum(rf[Revolving.Fund.cols.balance])
    if (currentBalance < requestAmount) {
      return respond.badRequest(
        res,
        'Insufficient revolving fund balance to complete this cash request.',
      )
    }

    const finalCashVoucher = await generateCashVoucher()
    const { outstanding, status: cdStatus } = computeCdStatus(requestAmount, 0, 0)

    // Step 1: insert the CD row on its own — its generated id is needed by
    // the activity log below, and Transaction() can't return generated ids
    // mid-batch (identical constraint to issueCashDisbursement).
    const insertCdQuery = SQL.model(Cash.Disbursement)
      .insert({
        [Cash.Disbursement.cols.cash_request_id]: id,
        [Cash.Disbursement.cols.date_issued]: new Date(),
        [Cash.Disbursement.cols.received_by]: cr[Cash.Request.cols.employee_id],
        [Cash.Disbursement.cols.revolving_fund_id]: fundId,
        [Cash.Disbursement.cols.department_id]: cr[Cash.Request.cols.department_id],
        [Cash.Disbursement.cols.purpose]: purpose,
        [Cash.Disbursement.cols.amount_issued]: requestAmount,
        [Cash.Disbursement.cols.cash_voucher]: finalCashVoucher,
        [Cash.Disbursement.cols.amount_returned]: 0,
        [Cash.Disbursement.cols.outstanding_amount]: outstanding,
        [Cash.Disbursement.cols.amount_expended]: 0,
        [Cash.Disbursement.cols.status]: cdStatus,
      })
      .build()

    const cdResult = await Query(insertCdQuery.sql, insertCdQuery.bindings)
    const newCdId = cdResult.insertId

    // Step 2: batch everything downstream into one real transaction — CD
    // activity log, RF update + activity, and the cash_request's own
    // status flip + activity log all commit together or not at all.
    try {
      const fundCascade = computeFundCascadeAfterIssue(rf, requestAmount)
      const cascadeQueries = buildCompletionCascadeQueries({
        cr,
        id,
        fundId,
        newCdId,
        requestAmount,
        finalCashVoucher,
        project,
        purpose,
        fundCascade,
        userId,
        remarks,
      })
      await Transaction(cascadeQueries.map(toTxQuery))
    } catch (txError) {
      // Compensate: the CD row committed above, but the downstream batch
      // (RF cascade + cash_request completion) failed — remove the
      // orphaned CD row so the cash request is never left APPROVED while a
      // disbursement silently exists against it with no matching RF effect
      // or completion record.
      try {
        const { sql: delSql, bindings: delBindings } = SQL.model(Cash.Disbursement)
          .delete()
          .where(Cash.Disbursement.pk, newCdId)
          .build()
        await Query(delSql, delBindings)
      } catch (compensationError) {
        console.error(
          `CRITICAL: failed to compensate orphaned cash_disbursement id ${newCdId} after transaction failure:`,
          compensationError,
        )
      }
      throw txError
    }

    return respond.ok(res, {
      message: 'Cash request completed successfully — cash disbursement created.',
      cash_request_id: id,
      cash_disbursement_id: newCdId,
      cash_voucher: finalCashVoucher,
    })
  } catch (error) {
    return handleServerError(
      res,
      'completeCashRequest',
      error,
      'Error completing cash request',
      true,
    )
  }
}

// ==========================================
// ELIGIBILITY CHECK
// ==========================================

/**
 * @name checkCashRequestEligibility
 * @description Whether an employee is currently eligible to create a new
 *              Cash Request — false while they have a prior request whose
 *              Liquidation isn't yet fully resolved (see
 *              hasOutstandingLiquidation, also enforced server-side inside
 *              createCashRequest, so this is purely an advisory pre-check
 *              for the UI, not the actual gate).
 */
const checkCashRequestEligibility = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = 'Check whether an employee is eligible to create a new Cash Request.'
  /*
    #swagger.parameters['employee_id'] = { in: 'query', type: 'integer', required: true, description: 'Employee id to check' }
  */

  const { employee_id } = req.query
  if (!employee_id) {
    return respond.badRequest(res, 'Missing required query param: employee_id')
  }

  try {
    const blocked = await hasOutstandingLiquidation(employee_id)
    return respond.ok(res, {
      eligible: !blocked,
      message: blocked
        ? 'You cannot create a new Cash Request until your previous Cash Request has been fully liquidated.'
        : null,
    })
  } catch (error) {
    return handleServerError(
      res,
      'checkCashRequestEligibility',
      error,
      'Error checking cash request eligibility',
    )
  }
}

// ==========================================
// READ ENDPOINTS
// ==========================================

/**
 * @name getCashRequest
 * @description Daily view: defaults to TODAY's Cash Requests (by
 *              request_date). Pass date_from / date_to to look back.
 *              Enriched with LEFT-JOINed Cash
 *              Disbursement and Liquidation info so the frontend can
 *              decide, without a second round-trip:
 *                - disbursement_amount / cash_disbursement_id: what a
 *                  COMPLETED request actually disbursed (needed to show
 *                  "Cash Received" on the Liquidate flow).
 *                - liquidation_id / liquidation_status: whether a
 *                  Liquidation already exists for this request, and its
 *                  current stage — drives the Liquidate button's
 *                  visibility on the Cash Request page.
 *                - request_type: TRAVEL EXPENSES or BUDGET — decides
 *                  which liquidation form the frontend shows.
 *              Stays raw SQL rather than the query builder for the same
 *              reason getBudgetBudget does — aliased derived joins the
 *              builder doesn't support.
 */
const getCashRequest = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = 'Get Cash Request records. Defaults to TODAY (by request_date); pass date_from/date_to to look back. Includes joined disbursement and liquidation info.'
  /*
    #swagger.parameters['status'] = { in: 'query', type: 'string', required: false, description: 'Filter by cash request status (PENDING, APPROVED, REJECTED, COMPLETED)' }
    #swagger.parameters['employee_id'] = { in: 'query', type: 'integer', required: false, description: 'Filter by requesting employee id' }
    #swagger.parameters['date_from'] = { in: 'query', type: 'string', required: false, description: 'Start date (YYYY-MM-DD, inclusive). Defaults to today.' }
    #swagger.parameters['date_to'] = { in: 'query', type: 'string', required: false, description: 'End date (YYYY-MM-DD, inclusive). Defaults to today.' }
  */

  const { status, employee_id } = req.query

  const range = resolveDateRange(req.query)
  if (range.error) return respond.badRequest(res, range.error)

  try {
    const conditions = []
    const params = []
    if (status) {
      conditions.push('cr.cr_status = ?')
      params.push(status)
    }
    if (employee_id) {
      conditions.push('cr.cr_employee_id = ?')
      params.push(employee_id)
    }
    addDateCondition('cr.cr_request_date', range, conditions, params)
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await Query(
      `SELECT
         cr.cr_id AS id,
         cr.cr_reference_id AS reference_id,
         cr.cr_cv_number AS cv_number,
         cr.cr_purpose AS purpose,
         cr.cr_project AS project,
         cr.cr_amount AS amount,
         cr.cr_request_type AS request_type,
         cr.cr_revolving_fund_id AS revolving_fund_id,
         cr.cr_employee_id AS employee_id,
         cr.cr_department_id AS department_id,
         cr.cr_team_lead AS team_lead,
         cr.cr_request_date AS request_date,
         cr.cr_status AS status,
         cr.cr_createdAt AS createdAt,
         cd.cd_id AS cash_disbursement_id,
         cd.cd_amount_issued AS disbursement_amount,
         cd.cd_status AS disbursement_status,
         lq.l_id AS liquidation_id,
         lq.l_status AS liquidation_status
       FROM cash_request cr
       LEFT JOIN cash_disbursement cd ON cd.cd_cash_request_id = cr.cr_id
       LEFT JOIN liquidation lq ON lq.l_cash_request_id = cr.cr_id
       ${whereClause}
       ORDER BY cr.cr_id DESC`,
      params,
    )

    return respond.ok(res, rows)
  } catch (error) {
    return handleServerError(res, 'getCashRequest', error, 'Error retrieving Cash Request records')
  }
}

/**
 * @name getCashRequestActivity
 * @description Get Cash Request activity/audit records, optionally
 *              filtered by cash_request_id.
 */
const getCashRequestActivity = async (req, res) => {
  // #swagger.tags = ['Cash Request']
  // #swagger.description = 'Get Cash Request activity records'
  /*
    #swagger.parameters['cash_request_id'] = { in: 'query', type: 'integer', required: false, description: 'Filter by cash request id' }
  */

  const { cash_request_id } = req.query

  try {
    let queryBuilder = SQL.model(Cash.RequestActivity).select(Cash.RequestActivity.select)

    if (cash_request_id) {
      queryBuilder = queryBuilder.where(Cash.RequestActivity.cols.cash_request_id, cash_request_id)
    }

    const { sql, bindings } = queryBuilder.build()
    const result = await Query(sql, bindings)

    return respond.ok(res, result)
  } catch (error) {
    return handleServerError(
      res,
      'getCashRequestActivity',
      error,
      'Error retrieving Cash Request Activity records',
    )
  }
}

module.exports = {
  getCashRequest,
  createCashRequest,
  approveCashRequest,
  rejectCashRequest,
  updateCashRequest,
  completeCashRequest,
  getCashRequestActivity,
  checkCashRequestEligibility,
}
