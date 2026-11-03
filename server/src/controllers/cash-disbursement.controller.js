const { Query, Transaction, SQLQueryBuilder } = require('../database/utilities/queries.util')
const { resolveDateRange, filterRowsByDate } = require('../utilities/dateRange.util')
const { Cash } = require('../database/models/Cash')
const { Revolving } = require('../database/models/Revolving')
const SQL = new SQLQueryBuilder()

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

// ==========================================
// HELPER UTILITIES
// ==========================================

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
 * A cash voucher may back at most 2 cash_disbursement rows
 * (e.g. an issue row + one reimbursement row). Prevents runaway
 * duplicate rows against the same voucher number.
 */
const checkCashVoucherLimit = async (cashVoucher) => {
  const { sql, bindings } = SQL.model(Cash.Disbursement)
    .select([Cash.Disbursement.cols.id])
    .where(Cash.Disbursement.cols.cash_voucher, cashVoucher)
    .build()
  const rows = await Query(sql, bindings)
  return rows.length
}

const getCashDisbursementById = async (id) => {
  const { sql, bindings } = SQL.model(Cash.Disbursement)
    .select(Cash.Disbursement.select)
    .where(Cash.Disbursement.pk, id)
    .build()
  const [row] = await Query(sql, bindings)
  return wrapRow(row, Cash.Disbursement)
}

const getRevolvingFundById = async (id) => {
  const { sql, bindings } = SQL.model(Revolving.Fund)
    .select(Revolving.Fund.select)
    .where(Revolving.Fund.pk, id)
    .build()
  const [row] = await Query(sql, bindings)
  return wrapRow(row, Revolving.Fund)
}

/**
 * Recomputes a cash_disbursement row's outstanding amount and status
 * from its issued/returned/expended totals.
 */
const computeCdStatus = (issued, returned, expended) => {
  const raw = parseNum(issued) - parseNum(returned) - parseNum(expended)
  const outstanding = Math.max(0, Math.round(raw * 100) / 100)
  const status = outstanding === 0 ? 'LIQUIDATED' : 'UNLIQUIDATED'
  return { outstanding, status }
}

/**
 * Manages ONLY the fund's ACTIVE states (OPEN -> ON REVIEW once the fund has
 * seen activity — cash issued out OR cash returned in). CLOSED, CLEARED,
 * and RETURN are all FINALIZED statuses and are never changed by THIS
 * function — CLOSED and CLEARED are otherwise set exclusively by the
 * explicit Submit/Report flow (upsertClosedRevolvingFund in
 * revolvingFundController.js).
 *
 * The ONE exception — a CLOSED fund auto-advancing to CLEARED once its
 * last outstanding disbursement is settled — is NOT handled here. That
 * transition is decided by resolveClosedFundStatus() below, which callers
 * use INSTEAD of this function whenever the fund they're updating is
 * currently CLOSED. This function is only ever called for funds that are
 * OPEN / ON REVIEW / CLEARED / RETURN.
 *
 * @param {string} currentStatus
 * @param {boolean} hasActivity - true if this action gives the fund a
 *   reason to move into review (e.g. newIssued > 0, or — for a fund that's
 *   only ever RECEIVED a return/reimbursement — newReturned > 0). Callers
 *   pass an already-evaluated boolean rather than a raw total so a fund
 *   with issued === 0 but a nonzero incoming return still transitions.
 */
const computeRfStatus = (currentStatus, hasActivity) => {
  if (currentStatus === 'CLOSED' || currentStatus === 'CLEARED' || currentStatus === 'RETURN') {
    return currentStatus
  }
  return hasActivity ? 'ON REVIEW' : currentStatus
}

/**
 * True if the given fund has any UNLIQUIDATED cash_disbursement rows
 * OTHER than the one currently being settled. Checked directly against
 * cash_disbursement rather than trusting the fund's own rf_outstanding
 * aggregate, so a drifted/stale aggregate can never wrongly flip a fund
 * to CLEARED while a real disbursement against it is still open.
 *
 * NOTE: the query builder's .select([Cash.Disbursement.cols.id]) aliases
 * the result as `id` (e.g. `cd_id AS id`), not the raw db column name —
 * so rows must be read via `r.id`, never `r[Cash.Disbursement.cols.id]`
 * (that would look up a key that doesn't exist on the row and silently
 * break this whole check).
 *
 * @param {number|string} fundId
 * @param {number|string} excludeCdId - the disbursement being settled in
 *   this same call; its OLD (pre-update) status may still read
 *   UNLIQUIDATED in the DB at the moment this query runs, so it must be
 *   excluded explicitly rather than relying on a fresh row read.
 */
const hasOtherUnliquidatedDisbursements = async (fundId, excludeCdId) => {
  const { sql, bindings } = SQL.model(Cash.Disbursement)
    .select([Cash.Disbursement.cols.id])
    .where(Cash.Disbursement.cols.revolving_fund_id, fundId)
    .where(Cash.Disbursement.cols.status, 'UNLIQUIDATED')
    .build()
  const rows = await Query(sql, bindings)
  return rows.some((r) => String(r.id) !== String(excludeCdId))
}

/**
 * Decides whether a CLOSED fund should auto-transition to CLEARED as part
 * of a settlement (return, expended, or a decreasing amount edit) landing
 * on it. This is the ONLY place a CLOSED fund can become CLEARED outside
 * the manual Submit/Report flow (upsertClosedRevolvingFund) — and it only
 * ever fires CLOSED -> CLEARED, never any other transition. Callers must
 * only invoke this when the fund's CURRENT status is already CLOSED; for
 * any other status, use computeRfStatus instead.
 *
 * Requires ALL of:
 *   1. This settlement brought the fund's own rf_outstanding to 0, AND
 *   2. The disbursement being settled right now is itself fully
 *      LIQUIDATED by this action (a partial settlement that leaves it
 *      UNLIQUIDATED can't clear the fund), AND
 *   3. No OTHER cash_disbursement row against this fund is still
 *      UNLIQUIDATED — checked directly against the table (see
 *      hasOtherUnliquidatedDisbursements) rather than trusting
 *      rf_outstanding alone.
 *
 * @param {string} currentStatus - must be 'CLOSED' (asserted by caller)
 * @param {number} newOutstanding - fund's rf_outstanding AFTER this action
 * @param {number|string} fundId
 * @param {number|string} settlingCdId - the cash_disbursement.id being settled
 * @param {string} settlingCdNewStatus - that disbursement's status AFTER this action
 */
const resolveClosedFundStatus = async (
  currentStatus,
  newOutstanding,
  fundId,
  settlingCdId,
  settlingCdNewStatus,
) => {
  if (currentStatus !== 'CLOSED') return currentStatus

  if (newOutstanding > 0 || settlingCdNewStatus !== 'LIQUIDATED') {
    return 'CLOSED'
  }

  const stillUnliquidated = await hasOtherUnliquidatedDisbursements(fundId, settlingCdId)
  return stillUnliquidated ? 'CLOSED' : 'CLEARED'
}

/**
 * Fund statuses that should never accept a NEW cash issuance (issue), a
 * NEW reimbursement (which is modeled as a fresh issuance), or an INCREASE
 * to an existing disbursement's amount (which pulls additional cash out of
 * the fund the same way a fresh issue would). OPEN and ON REVIEW are the
 * only "active" states a fund can issue NEW/ADDITIONAL cash from.
 *
 * This deliberately does NOT apply to settling an EXISTING disbursement's
 * amount_expended (recordExpendedCashDisbursement) or DECREASING an
 * existing disbursement's amount (editCashDisbursementAmount) — those
 * release money back rather than pulling new money out, so they're allowed
 * against a CLOSED fund on purpose. See those functions' docstrings.
 */
const NON_ISSUABLE_RF_STATUSES = ['CLOSED', 'CLEARED', 'RETURN']

/** Inserts a cash_disbursement_activity row. `purpose` is free text —
 * copied straight from the disbursement's own cd_purpose, no lookup. */
const buildCdActivityInsert = (cashDisbursementId, amount, remarks, purpose) => {
  const query = SQL.model(Cash.DisbursementActivity)
    .insert({
      [Cash.DisbursementActivity.cols.cash_disbursement_id]: cashDisbursementId,
      [Cash.DisbursementActivity.cols.amount]: amount,
      [Cash.DisbursementActivity.cols.remarks]: remarks,
      [Cash.DisbursementActivity.cols.purpose]: purpose,
    })
    .build()
  return toTxQuery(query)
}

const buildRfActivityInsert = (revolvingFundId, remarks, userId) => {
  const query = SQL.model(Revolving.FundActivity)
    .insert({
      [Revolving.FundActivity.cols.revolving_fund_id]: revolvingFundId,
      [Revolving.FundActivity.cols.remarks]: remarks,
      [Revolving.FundActivity.cols.user_id]: userId,
    })
    .build()
  return toTxQuery(query)
}

const buildRfUpdate = (revolvingFundId, updateData) => {
  const query = SQL.model(Revolving.Fund)
    .update(updateData)
    .where(Revolving.Fund.pk, revolvingFundId)
    .build()
  return toTxQuery(query)
}

const buildCdUpdate = (cashDisbursementId, updateData) => {
  const query = SQL.model(Cash.Disbursement)
    .update(updateData)
    .where(Cash.Disbursement.pk, cashDisbursementId)
    .build()
  return toTxQuery(query)
}

// ==========================================
// METADATA-ONLY UPSERT
// ==========================================

/**
 * @name upsertCashDisbursement
 * @description Create or update a cash disbursement's METADATA only
 *              (received_by, revolving_fund_id, department_id, purpose,
 *              cash_voucher). Amount and status fields are intentionally
 *              not editable here — use editCashDisbursementAmount /
 *              issueCashDisbursement / returnCashDisbursement /
 *              recordExpendedCashDisbursement / reimburseCashDisbursement
 *              instead, so cash_disbursement never drifts out of sync
 *              with revolving_fund/budget.
 */
const upsertCashDisbursement = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Upsert Disbursement metadata (no amount/status fields — use editCashDisbursementAmount or the action endpoints for those)'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['id'] = {
      in: 'formData',
      type: 'string',
      required: false,
      description: 'Disbursement id (update if present, create if blank — create still requires an initial issue via issueCashDisbursement)'
    }
    #swagger.parameters['received_by'] = {
      in: 'formData',
      type: 'integer',
      required: false,
      description: 'Employee id (master_employee.me_id) who received the disbursement'
    }
    #swagger.parameters['department_id'] = {
      in: 'formData',
      type: 'integer',
      required: false,
      description: 'Department id (master_department.md_id)'
    }
    #swagger.parameters['purpose'] = {
      in: 'formData',
      type: 'string',
      required: false,
      description: 'Free-text purpose for this disbursement'
    }
    #swagger.parameters['cash_voucher'] = {
      in: 'formData',
      type: 'string',
      required: false,
      description: 'Cash voucher number'
    }
  */

  const { id, received_by, department_id, purpose, cash_voucher } = req.body

  if (!id) {
    return res.status(400).json({
      message:
        'Metadata-only upsert requires an existing disbursement id. To create a new disbursement, use issueCashDisbursement.',
    })
  }

  try {
    const updateData = {}
    if (received_by !== undefined) updateData[Cash.Disbursement.cols.received_by] = received_by
    if (department_id !== undefined)
      updateData[Cash.Disbursement.cols.department_id] = department_id
    if (purpose !== undefined) updateData[Cash.Disbursement.cols.purpose] = purpose
    if (cash_voucher !== undefined) updateData[Cash.Disbursement.cols.cash_voucher] = cash_voucher

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No metadata fields provided to update' })
    }

    const { sql, bindings } = SQL.model(Cash.Disbursement)
      .update(updateData)
      .where(Cash.Disbursement.pk, id)
      .build()

    const result = await Query(sql, bindings)

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Disbursement not found' })
    }

    return res.status(200).json({ message: 'Disbursement metadata updated successfully' })
  } catch (error) {
    console.error('Error in upsertCashDisbursement:', error)
    return res.status(500).json({ message: 'Error processing Disbursement' })
  }
}

// ==========================================
// ACTION: EDIT AMOUNT
// ==========================================

/**
 * @name editCashDisbursementAmount
 * @description Edit a Cash Disbursement's amount_issued and recalculate
 *              the disbursement's own outstanding/status plus its
 *              revolving fund's issued/outstanding/balance/status by the
 *              DIFFERENCE (new_amount - old_amount) — never treating the
 *              new amount as a fresh transaction.
 *
 *              Does NOT touch the connected Budget, same as every other
 *              action in this file (issue/return/expend/reimburse). An
 *              amount edit only moves money WITHIN the fund it's already
 *              deployed into — an increase pulls from the fund's own
 *              balance into its outstanding (both change by exactly
 *              `difference`, in opposite directions, so the fund's total
 *              balance+outstanding footprint against its Budget is
 *              UNCHANGED). No new money crosses the Budget boundary.
 *
 *              Lifecycle: only disbursements that are NOT already
 *              LIQUIDATED can have their amount edited (mirrors the
 *              existing UI rule in disbursementColumns.jsx, which disables
 *              the Edit action once status === 'LIQUIDATED') — a fully
 *              settled disbursement is treated as immutable.
 *
 *              Fund status guard: an INCREASE pulls additional cash out of
 *              the fund's own balance, so it's blocked under the same
 *              NON_ISSUABLE_RF_STATUSES rule as a fresh issue
 *              (CLOSED/CLEARED/RETURN) — and additionally requires the
 *              fund to actually HAVE that much idle balance sitting in it.
 *              A DECREASE releases cash back to the fund's own balance,
 *              which — like returnCashDisbursement settling an existing
 *              AR — is allowed even against a CLOSED fund, and can itself
 *              trigger that fund's CLOSED -> CLEARED auto-transition via
 *              resolveClosedFundStatus if this was its last remaining
 *              unliquidated disbursement.
 */
const editCashDisbursementAmount = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Edit a disbursement'\''s amount_issued. Recalculates only the DIFFERENCE against its revolving fund (never the connected Budget — see docstring). Blocked once the disbursement is LIQUIDATED.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: true, description: 'Cash disbursement id' }
    #swagger.parameters['amount_issued'] = { in: 'formData', type: 'number', required: true, description: 'New amount_issued for the disbursement' }
  */

  const userId = req.userId || req.user?.id || 1
  const { id, amount_issued } = req.body

  if (!id) {
    return res.status(400).json({ message: 'Missing required field: id' })
  }
  if (amount_issued === undefined) {
    return res.status(400).json({ message: 'Missing required field: amount_issued' })
  }

  const newAmount = parseNum(amount_issued)
  if (newAmount <= 0) {
    return res.status(400).json({ message: 'amount_issued must be greater than zero' })
  }

  try {
    const cd = await getCashDisbursementById(id)
    if (!cd) {
      return res.status(404).json({ message: 'Disbursement not found' })
    }

    if (cd[Cash.Disbursement.cols.status] === 'LIQUIDATED') {
      return res
        .status(400)
        .json({ message: 'Cannot edit the amount of a liquidated disbursement.' })
    }

    const oldAmount = parseNum(cd[Cash.Disbursement.cols.amount_issued])
    const difference = Math.round((newAmount - oldAmount) * 100) / 100

    if (difference === 0) {
      return res
        .status(200)
        .json({ message: 'No amount change detected — nothing to recalculate.', id })
    }

    const currentReturned = parseNum(cd[Cash.Disbursement.cols.amount_returned])
    const currentExpended = parseNum(cd[Cash.Disbursement.cols.amount_expended])
    const alreadySettled = currentReturned + currentExpended

    // Can't shrink amount_issued below money already accounted for by a
    // prior return/expended against THIS disbursement.
    if (newAmount < alreadySettled) {
      return res.status(400).json({
        message: `New amount (₱${newAmount.toFixed(2)}) cannot be less than the amount already returned/expended (₱${alreadySettled.toFixed(2)}) against this disbursement.`,
      })
    }

    const { outstanding: newCdOutstanding, status: newCdStatus } = computeCdStatus(
      newAmount,
      currentReturned,
      currentExpended,
    )

    const fundId = cd[Cash.Disbursement.cols.revolving_fund_id]
    const rf = await getRevolvingFundById(fundId)
    if (!rf) {
      return res.status(404).json({ message: 'Associated revolving fund not found' })
    }

    const rfStatus = rf[Revolving.Fund.cols.status]

    if (difference > 0 && NON_ISSUABLE_RF_STATUSES.includes(rfStatus)) {
      return res.status(400).json({
        message: `Cannot increase disbursement amount — its revolving fund has status ${rfStatus}.`,
      })
    }

    const currentRfBalance = parseNum(rf[Revolving.Fund.cols.balance])
    if (difference > 0 && currentRfBalance < difference) {
      return res
        .status(400)
        .json({ message: 'Insufficient revolving fund balance to cover the increase.' })
    }

    const newRfIssued = parseNum(rf[Revolving.Fund.cols.issued]) + difference
    const newRfOutstanding = Math.max(0, parseNum(rf[Revolving.Fund.cols.outstanding]) + difference)
    const newRfBalance = currentRfBalance - difference

    // Only ever reaches the CLOSED branch on a decrease (difference > 0
    // against a CLOSED/CLEARED/RETURN fund was already rejected above).
    const newRfStatus =
      rfStatus === 'CLOSED'
        ? await resolveClosedFundStatus(rfStatus, newRfOutstanding, fundId, id, newCdStatus)
        : computeRfStatus(rfStatus, newRfIssued > 0)

    const didAutoClear = rfStatus === 'CLOSED' && newRfStatus === 'CLEARED'

    const queries = [
      buildCdUpdate(id, {
        [Cash.Disbursement.cols.amount_issued]: newAmount,
        [Cash.Disbursement.cols.outstanding_amount]: newCdOutstanding,
        [Cash.Disbursement.cols.status]: newCdStatus,
      }),
      buildCdActivityInsert(
        id,
        Math.abs(difference),
        `Amount edited: ₱${oldAmount.toFixed(2)} → ₱${newAmount.toFixed(2)} (${difference > 0 ? '+' : ''}₱${difference.toFixed(2)})`,
        cd[Cash.Disbursement.cols.purpose],
      ),
      buildRfUpdate(fundId, {
        [Revolving.Fund.cols.issued]: newRfIssued,
        [Revolving.Fund.cols.outstanding]: newRfOutstanding,
        [Revolving.Fund.cols.balance]: newRfBalance,
        [Revolving.Fund.cols.status]: newRfStatus,
      }),
      buildRfActivityInsert(
        fundId,
        didAutoClear
          ? `Disbursement #${id} amount edit fully settled this fund's outstanding — no remaining unliquidated disbursements. Status: CLOSED → CLEARED.`
          : `Disbursement #${id} amount edited (${difference > 0 ? '+' : ''}₱${difference.toFixed(2)}) — issued (${newRfIssued}), outstanding (${newRfOutstanding}), balance (${newRfBalance}), status: ${newRfStatus}.`,
        userId,
      ),
    ]

    await Transaction(queries)

    return res.status(200).json({
      message: 'Cash disbursement amount updated successfully',
      id,
      old_amount: oldAmount,
      new_amount: newAmount,
      difference,
    })
  } catch (error) {
    console.error('Error in editCashDisbursementAmount:', error)
    return res
      .status(500)
      .json({ message: 'Error editing cash disbursement amount', error: error.message })
  }
}

// ==========================================
// ACTION: ISSUE
// ==========================================

/**
 * @name issueCashDisbursement
 * @description Issue cash from a Revolving Fund to an employee. Creates the
 *              cash_disbursement row and cascades to revolving_fund only
 *              (issued↑, outstanding↑, balance↓). Does NOT touch budget —
 *              the budget was already debited when this fund was funded/
 *              topped-up (see upsertRevolvingFund); issuing cash out of the
 *              fund to an employee is a fund-internal move, not a new
 *              budget-boundary crossing. Re-debiting here would double-count
 *              the same money leaving the budget twice.
 *
 *              Blocked entirely if the fund is CLOSED, CLEARED, or RETURN —
 *              only OPEN / ON REVIEW funds can issue new cash.
 */
const issueCashDisbursement = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Issue cash against a Revolving Fund. Cascades to revolving_fund only (budget already debited when the fund was funded). Blocked if the fund is CLOSED, CLEARED, or RETURN.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['revolving_fund_id'] = { in: 'formData', type: 'integer', required: true, description: 'Revolving Fund id to issue from' }
    #swagger.parameters['received_by'] = { in: 'formData', type: 'integer', required: true, description: 'Employee id (master_employee.me_id)' }
    #swagger.parameters['department_id'] = { in: 'formData', type: 'integer', required: true, description: 'Department id (master_department.md_id)' }
    #swagger.parameters['purpose'] = { in: 'formData', type: 'string', required: true, description: 'Free-text purpose for this disbursement' }
    #swagger.parameters['amount_issued'] = { in: 'formData', type: 'number', required: true, description: 'Amount to issue' }
    #swagger.parameters['cash_voucher'] = { in: 'formData', type: 'string', required: true, description: 'Cash voucher number' }
    #swagger.parameters['date_issued'] = { in: 'formData', type: 'string', required: false, description: 'Issue date, defaults to now' }
  */

  // TEMP: no auth wired up yet — default to a placeholder test user.
  // Replace this fallback (and remove the TEMP comment) once auth is in.
  const userId = req.userId || req.user?.id || 1

  const {
    revolving_fund_id,
    received_by,
    department_id,
    purpose,
    amount_issued,
    cash_voucher,
    date_issued,
  } = req.body

  if (!revolving_fund_id || !received_by || !department_id || !purpose || !cash_voucher) {
    return res.status(400).json({
      message:
        'Missing required fields: revolving_fund_id, received_by, department_id, purpose, cash_voucher',
    })
  }

  const issueAmount = parseNum(amount_issued)
  if (issueAmount <= 0) {
    return res.status(400).json({ message: 'amount_issued must be greater than zero' })
  }

  try {
    const voucherCount = await checkCashVoucherLimit(cash_voucher)
    if (voucherCount >= 2) {
      return res
        .status(400)
        .json({ message: `Cash voucher '${cash_voucher}' already has 2 associated disbursements.` })
    }

    const rf = await getRevolvingFundById(revolving_fund_id)
    if (!rf) {
      return res.status(404).json({ message: 'Revolving fund not found' })
    }

    const rfStatus = rf[Revolving.Fund.cols.status]
    if (NON_ISSUABLE_RF_STATUSES.includes(rfStatus)) {
      return res.status(400).json({
        message: `Cannot issue cash from a revolving fund with status ${rfStatus}.`,
      })
    }

    const currentBalance = parseNum(rf[Revolving.Fund.cols.balance])
    if (currentBalance < issueAmount) {
      return res.status(400).json({ message: 'Insufficient revolving fund balance.' })
    }

    const { outstanding, status } = computeCdStatus(issueAmount, 0, 0)

    // Step 1: insert the CD row on its own — its auto-increment id is needed
    // by the activity log below, and Transaction() can't return generated
    // ids mid-batch, so this can't be folded into the same transaction.
    const insertCdQuery = SQL.model(Cash.Disbursement)
      .insert({
        [Cash.Disbursement.cols.date_issued]: date_issued || new Date(),
        [Cash.Disbursement.cols.received_by]: received_by,
        [Cash.Disbursement.cols.revolving_fund_id]: revolving_fund_id,
        [Cash.Disbursement.cols.department_id]: department_id,
        [Cash.Disbursement.cols.purpose]: purpose,
        [Cash.Disbursement.cols.amount_issued]: issueAmount,
        [Cash.Disbursement.cols.cash_voucher]: cash_voucher,
        [Cash.Disbursement.cols.amount_returned]: 0,
        [Cash.Disbursement.cols.outstanding_amount]: outstanding,
        [Cash.Disbursement.cols.amount_expended]: 0,
        [Cash.Disbursement.cols.status]: status,
      })
      .build()

    const cdResult = await Query(insertCdQuery.sql, insertCdQuery.bindings)
    const newCdId = cdResult.insertId

    // Step 2: batch everything downstream into one real transaction —
    // activity log, RF update + activity.
    try {
      const newRfIssued = parseNum(rf[Revolving.Fund.cols.issued]) + issueAmount
      const newRfOutstanding = parseNum(rf[Revolving.Fund.cols.outstanding]) + issueAmount
      const newRfBalance = currentBalance - issueAmount
      const newRfStatus = computeRfStatus(rf[Revolving.Fund.cols.status], newRfIssued > 0)

      const queries = [
        buildCdActivityInsert(
          newCdId,
          issueAmount,
          `Issued amount: ₱${issueAmount.toFixed(2)}`,
          purpose,
        ),
        buildRfUpdate(revolving_fund_id, {
          [Revolving.Fund.cols.issued]: newRfIssued,
          [Revolving.Fund.cols.outstanding]: newRfOutstanding,
          [Revolving.Fund.cols.balance]: newRfBalance,
          [Revolving.Fund.cols.status]: newRfStatus,
        }),
        buildRfActivityInsert(
          revolving_fund_id,
          `Issued ₱${issueAmount.toFixed(2)} — issued (${newRfIssued}), outstanding (${newRfOutstanding}), balance (${newRfBalance}), status: ${newRfStatus}.`,
          userId,
        ),
      ]

      await Transaction(queries)
    } catch (txError) {
      // Compensate: the CD row was committed on its own above, but the
      // downstream batch failed — remove the orphaned CD row so we don't
      // leave a disbursement with no matching RF effect.
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

    return res.status(201).json({ message: 'Cash issued successfully', id: newCdId })
  } catch (error) {
    console.error('Error in issueCashDisbursement:', error)
    return res.status(500).json({ message: 'Error issuing cash disbursement' })
  }
}

// ==========================================
// ACTION: RETURN
// ==========================================

/**
 * @name returnCashDisbursement
 * @description Record a return of unused issued cash against an existing
 *              disbursement. Does NOT touch budget — money returning to a
 *              fund is a fund-internal move; the budget's balance is only
 *              affected at fund funding/top-up time.
 *
 *              Distinguishes two funds, which may differ:
 *                - ORIGINAL fund (cash_disbursement.revolving_fund_id) —
 *                  the fund the disbursement was CREATED under. This is
 *                  NEVER changed by this function. It owns the AR for this
 *                  disbursement, so its `outstanding`/`liquidated` totals
 *                  are what get settled here, even if it's since gone
 *                  CLOSED (CLOSED alone must never block a liquidation —
 *                  see the status check below, which only ever looks at
 *                  the SELECTED fund). If this settlement brings the
 *                  original fund's outstanding to 0 with nothing else
 *                  UNLIQUIDATED left against it, it auto-advances
 *                  CLOSED -> CLEARED (see resolveClosedFundStatus).
 *                - SELECTED/liquidation fund (`revolving_fund_id` in the
 *                  request body, defaults to the original fund) — the fund
 *                  that actually receives the returned cash. Must be
 *                  OPEN/ON REVIEW; its `returned`/`balance` totals go up,
 *                  and it moves to ON REVIEW as a result of receiving this
 *                  return even if it has never itself issued anything (see
 *                  computeRfStatus's hasActivity contract).
 *
 *              When original and selected are the SAME fund, both effects
 *              land on the same row (identical to the old behavior) — and
 *              since that fund passed the CLOSED check above to get here,
 *              it can never itself be CLOSED at this point, so the normal
 *              computeRfStatus path is always correct for that branch.
 */
const returnCashDisbursement = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Record a return against an existing disbursement. Target fund defaults to the disbursement'\''s own (original) fund but may be redirected to a different, OPEN/ON REVIEW fund via revolving_fund_id — the original fund association on the disbursement itself never changes. If this fully settles a CLOSED original fund, it auto-advances to CLEARED.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: true, description: 'Cash disbursement id' }
    #swagger.parameters['amount_return'] = { in: 'formData', type: 'number', required: true, description: 'Amount being returned' }
    #swagger.parameters['revolving_fund_id'] = { in: 'formData', type: 'integer', required: false, description: 'Fund to credit the return to — defaults to the disbursement\'s own (original) fund. Must be OPEN/ON REVIEW.' }
  */

  const userId = req.userId || req.user?.id || 1
  const { id, amount_return, revolving_fund_id } = req.body

  if (!id) {
    return res.status(400).json({ message: 'Missing required field: id' })
  }

  const returnAmount = parseNum(amount_return)
  if (returnAmount <= 0) {
    return res.status(400).json({ message: 'amount_return must be greater than zero' })
  }

  try {
    const cd = await getCashDisbursementById(id)
    if (!cd) {
      return res.status(404).json({ message: 'Disbursement not found' })
    }

    const currentIssued = parseNum(cd[Cash.Disbursement.cols.amount_issued])
    const currentReturned = parseNum(cd[Cash.Disbursement.cols.amount_returned])
    const currentExpended = parseNum(cd[Cash.Disbursement.cols.amount_expended])
    const currentOutstanding = parseNum(cd[Cash.Disbursement.cols.outstanding_amount])

    if (returnAmount > currentOutstanding) {
      return res.status(400).json({
        message: `Return amount (${returnAmount}) exceeds outstanding amount (${currentOutstanding}).`,
      })
    }

    // ORIGINAL/creation fund — never changes, kept purely for AR settlement.
    const originalFundId = cd[Cash.Disbursement.cols.revolving_fund_id]
    // SELECTED/liquidation fund — what the caller chose to credit; defaults
    // to the original fund when not explicitly overridden.
    const targetFundId = revolving_fund_id || originalFundId
    const isCrossFundReturn = String(targetFundId) !== String(originalFundId)

    const targetFund = await getRevolvingFundById(targetFundId)
    if (!targetFund) {
      return res.status(404).json({ message: 'Target revolving fund not found' })
    }

    // Validation is ONLY against the SELECTED fund. The disbursement's
    // original fund is allowed to be CLOSED — that status alone must never
    // block this liquidation, as long as the selected fund is eligible.
    if (targetFund[Revolving.Fund.cols.status] === 'CLOSED') {
      return res.status(400).json({
        message: 'Cannot liquidate against a closed revolving fund.',
      })
    }

    const originalFund = isCrossFundReturn ? await getRevolvingFundById(originalFundId) : targetFund
    if (!originalFund) {
      return res.status(404).json({ message: 'Original revolving fund not found' })
    }

    const newReturned = currentReturned + returnAmount
    const { outstanding: newOutstanding, status: newCdStatus } = computeCdStatus(
      currentIssued,
      newReturned,
      currentExpended,
    )

    const queries = [
      buildCdUpdate(id, {
        [Cash.Disbursement.cols.amount_returned]: newReturned,
        [Cash.Disbursement.cols.outstanding_amount]: newOutstanding,
        [Cash.Disbursement.cols.status]: newCdStatus,
      }),
      buildCdActivityInsert(
        id,
        returnAmount,
        `Returned amount: ₱${returnAmount.toFixed(2)}`,
        cd[Cash.Disbursement.cols.purpose],
      ),
    ]

    if (!isCrossFundReturn) {
      // Same fund owns both the AR and receives the cash. It already
      // passed the "not CLOSED" check above to get here, so it can never
      // be CLOSED at this point — computeRfStatus is always correct,
      // identical to the pre-cross-fund-fix behavior. Even a fund that has
      // never issued anything of its own (issued === 0) must still move to
      // ON REVIEW once it has a nonzero returned total, so both signals
      // are OR'd together here.
      const newRfReturned = parseNum(targetFund[Revolving.Fund.cols.returned]) + returnAmount
      const newRfLiquidated = parseNum(targetFund[Revolving.Fund.cols.liquidated]) + returnAmount
      const newRfBalance = parseNum(targetFund[Revolving.Fund.cols.balance]) + returnAmount
      const newRfOutstanding = Math.max(
        0,
        parseNum(targetFund[Revolving.Fund.cols.outstanding]) - returnAmount,
      )
      const newRfStatus = computeRfStatus(
        targetFund[Revolving.Fund.cols.status],
        parseNum(targetFund[Revolving.Fund.cols.issued]) > 0 || newRfReturned > 0,
      )

      queries.push(
        buildRfUpdate(targetFundId, {
          [Revolving.Fund.cols.returned]: newRfReturned,
          [Revolving.Fund.cols.liquidated]: newRfLiquidated,
          [Revolving.Fund.cols.balance]: newRfBalance,
          [Revolving.Fund.cols.outstanding]: newRfOutstanding,
          [Revolving.Fund.cols.status]: newRfStatus,
        }),
        buildRfActivityInsert(
          targetFundId,
          `Returned ₱${returnAmount.toFixed(2)} — returned (${newRfReturned}), liquidated (${newRfLiquidated}), balance (${newRfBalance}), outstanding (${newRfOutstanding}), status: ${newRfStatus}.`,
          userId,
        ),
      )
    } else {
      // Cross-fund return: settle the AR on the ORIGINAL fund (the fund
      // that actually issued this money — its outstanding/liquidated must
      // reflect this settlement so it can transition to CLEARED), and land
      // the physical cash on the SELECTED fund (returned/balance only —
      // this money was never part of that fund's own issued/outstanding).
      //
      // Unlike the target fund, the ORIGINAL fund was never validated as
      // "not CLOSED" — it's exactly the fund this whole flow exists to
      // unblock. So its new status must go through resolveClosedFundStatus
      // whenever it's currently CLOSED, to catch the "this was the last
      // unliquidated disbursement" case and auto-advance it to CLEARED.
      const newOriginalOutstanding = Math.max(
        0,
        parseNum(originalFund[Revolving.Fund.cols.outstanding]) - returnAmount,
      )
      const newOriginalLiquidated =
        parseNum(originalFund[Revolving.Fund.cols.liquidated]) + returnAmount
      const originalStatus = originalFund[Revolving.Fund.cols.status]
      const newOriginalStatus =
        originalStatus === 'CLOSED'
          ? await resolveClosedFundStatus(
              originalStatus,
              newOriginalOutstanding,
              originalFundId,
              id,
              newCdStatus,
            )
          : computeRfStatus(originalStatus, parseNum(originalFund[Revolving.Fund.cols.issued]) > 0)

      // The SELECTED/target fund receives cash it never issued itself, so
      // it needs the same OR'd hasActivity check as the same-fund branch
      // above — otherwise a fund that has only ever received returns
      // (issued always 0) would incorrectly stay OPEN forever even as its
      // balance moves.
      const newTargetReturned = parseNum(targetFund[Revolving.Fund.cols.returned]) + returnAmount
      const newTargetBalance = parseNum(targetFund[Revolving.Fund.cols.balance]) + returnAmount
      const newTargetStatus = computeRfStatus(
        targetFund[Revolving.Fund.cols.status],
        parseNum(targetFund[Revolving.Fund.cols.issued]) > 0 || newTargetReturned > 0,
      )

      const didAutoClear = originalStatus === 'CLOSED' && newOriginalStatus === 'CLEARED'

      queries.push(
        buildRfUpdate(originalFundId, {
          [Revolving.Fund.cols.outstanding]: newOriginalOutstanding,
          [Revolving.Fund.cols.liquidated]: newOriginalLiquidated,
          [Revolving.Fund.cols.status]: newOriginalStatus,
        }),
        buildRfUpdate(targetFundId, {
          [Revolving.Fund.cols.returned]: newTargetReturned,
          [Revolving.Fund.cols.balance]: newTargetBalance,
          [Revolving.Fund.cols.status]: newTargetStatus,
        }),
        buildRfActivityInsert(
          originalFundId,
          didAutoClear
            ? `Fully liquidated via a return credited to Fund #${targetFundId} — no remaining unliquidated disbursements. Status: CLOSED → CLEARED.`
            : `₱${returnAmount.toFixed(2)} of this fund's outstanding settled via a return credited to Fund #${targetFundId} — outstanding (${newOriginalOutstanding}), liquidated (${newOriginalLiquidated}), status: ${newOriginalStatus}.`,
          userId,
        ),
        buildRfActivityInsert(
          targetFundId,
          `Received ₱${returnAmount.toFixed(2)} return for a disbursement originally issued from Fund #${originalFundId} — returned (${newTargetReturned}), balance (${newTargetBalance}), status: ${newTargetStatus}.`,
          userId,
        ),
      )
    }

    await Transaction(queries)

    return res.status(200).json({ message: 'Return recorded successfully' })
  } catch (error) {
    console.error('Error in returnCashDisbursement:', error)
    return res.status(500).json({ message: 'Error recording return' })
  }
}

// ==========================================
// ACTION: RECORD EXPENDED
// ==========================================

/**
 * @name recordExpendedCashDisbursement
 * @description Record spending against previously issued cash. Cascades:
 *              revolving_fund (amount_expended↑, liquidated↑). Does NOT
 *              touch budget — the budget was already debited at fund
 *              funding/top-up time; re-debiting here would double-count.
 *
 *              Always posts against the disbursement's OWN fund (there is
 *              no revolving_fund_id override here, unlike return/reimburse)
 *              — settling an already-issued amount as spent doesn't move
 *              any new money anywhere, so it's INTENTIONALLY allowed even
 *              when that fund's status is CLOSED. A closed fund can still
 *              have its disbursements liquidated; only issuing brand-new
 *              cash (issueCashDisbursement/reimburseCashDisbursement) or
 *              crediting a return into a closed fund (returnCashDisbursement)
 *              are blocked.
 *
 *              If this settlement brings a CLOSED fund's outstanding to 0
 *              with nothing else UNLIQUIDATED left against it, the fund
 *              auto-advances CLOSED -> CLEARED (see resolveClosedFundStatus).
 */
const recordExpendedCashDisbursement = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Record expended amount against an existing disbursement. Cascades to revolving_fund only (budget already debited when the fund was funded). Always posts to the disbursement'\''s own fund, even if that fund is CLOSED — settling existing debt is allowed regardless of fund status, and if it fully settles a CLOSED fund, that fund auto-advances to CLEARED.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: true, description: 'Cash disbursement id' }
    #swagger.parameters['amount_expended'] = { in: 'formData', type: 'number', required: true, description: 'Amount being recorded as expended' }
  */

  const userId = req.userId || req.user?.id || 1
  const { id, amount_expended } = req.body

  if (!id) {
    return res.status(400).json({ message: 'Missing required field: id' })
  }

  const expendedAmount = parseNum(amount_expended)
  if (expendedAmount <= 0) {
    return res.status(400).json({ message: 'amount_expended must be greater than zero' })
  }

  try {
    const cd = await getCashDisbursementById(id)
    if (!cd) {
      return res.status(404).json({ message: 'Disbursement not found' })
    }

    const currentIssued = parseNum(cd[Cash.Disbursement.cols.amount_issued])
    const currentReturned = parseNum(cd[Cash.Disbursement.cols.amount_returned])
    const currentExpended = parseNum(cd[Cash.Disbursement.cols.amount_expended])
    const currentOutstanding = parseNum(cd[Cash.Disbursement.cols.outstanding_amount])

    if (expendedAmount > currentOutstanding) {
      return res.status(400).json({
        message: `Expended amount (${expendedAmount}) exceeds outstanding amount (${currentOutstanding}).`,
      })
    }

    const rf = await getRevolvingFundById(cd[Cash.Disbursement.cols.revolving_fund_id])
    if (!rf) {
      return res.status(404).json({ message: 'Associated revolving fund not found' })
    }

    // Deliberately NO status guard here — see docstring above. Settling
    // amount_expended must always be allowed against the disbursement's
    // own fund, CLOSED or not.

    const newExpended = currentExpended + expendedAmount
    const { outstanding: newOutstanding, status: newCdStatus } = computeCdStatus(
      currentIssued,
      currentReturned,
      newExpended,
    )

    const newRfExpended = parseNum(rf[Revolving.Fund.cols.amount_expended]) + expendedAmount
    const newRfLiquidated = parseNum(rf[Revolving.Fund.cols.liquidated]) + expendedAmount
    const newRfOutstanding = Math.max(
      0,
      parseNum(rf[Revolving.Fund.cols.outstanding]) - expendedAmount,
    )

    // This fund was never validated as "not CLOSED" (unlike the target
    // fund in returnCashDisbursement) — settling against a CLOSED fund is
    // exactly what this function is for. So its new status must go
    // through resolveClosedFundStatus whenever it's currently CLOSED, to
    // catch "this was the last unliquidated disbursement" and auto-advance
    // it to CLEARED; otherwise the normal computeRfStatus path applies.
    const rfStatus = rf[Revolving.Fund.cols.status]
    const newRfStatus =
      rfStatus === 'CLOSED'
        ? await resolveClosedFundStatus(
            rfStatus,
            newRfOutstanding,
            rf[Revolving.Fund.cols.id],
            id,
            newCdStatus,
          )
        : computeRfStatus(rfStatus, parseNum(rf[Revolving.Fund.cols.issued]) > 0)

    const didAutoClear = rfStatus === 'CLOSED' && newRfStatus === 'CLEARED'

    const queries = [
      buildCdUpdate(id, {
        [Cash.Disbursement.cols.amount_expended]: newExpended,
        [Cash.Disbursement.cols.outstanding_amount]: newOutstanding,
        [Cash.Disbursement.cols.status]: newCdStatus,
      }),
      buildCdActivityInsert(
        id,
        expendedAmount,
        `Expended amount: ₱${expendedAmount.toFixed(2)}`,
        cd[Cash.Disbursement.cols.purpose],
      ),
      buildRfUpdate(rf[Revolving.Fund.cols.id], {
        [Revolving.Fund.cols.amount_expended]: newRfExpended,
        [Revolving.Fund.cols.liquidated]: newRfLiquidated,
        [Revolving.Fund.cols.outstanding]: newRfOutstanding,
        [Revolving.Fund.cols.status]: newRfStatus,
      }),
      buildRfActivityInsert(
        rf[Revolving.Fund.cols.id],
        didAutoClear
          ? `Fully liquidated via an expended settlement — no remaining unliquidated disbursements. Status: CLOSED → CLEARED.`
          : `Expended ₱${expendedAmount.toFixed(2)} — expended (${newRfExpended}), liquidated (${newRfLiquidated}), outstanding (${newRfOutstanding}), status: ${newRfStatus}.`,
        userId,
      ),
    ]

    await Transaction(queries)

    return res.status(200).json({ message: 'Expended amount recorded successfully' })
  } catch (error) {
    console.error('Error in recordExpendedCashDisbursement:', error)
    return res.status(500).json({ message: 'Error recording expended amount' })
  }
}

// ==========================================
// ACTION: REIMBURSE
// ==========================================

/**
 * @name reimburseCashDisbursement
 * @description Reimburse an employee for out-of-pocket spending, modeled as
 *              a fresh disbursement that is immediately fully liquidated.
 *              Creates a new cash_disbursement row. Cascades to
 *              revolving_fund only (issued↑, amount_expended↑, liquidated↑,
 *              balance↓). Does NOT touch budget, same reasoning as
 *              issueCashDisbursement — the budget was already debited when
 *              this fund was funded/topped-up.
 *
 *              Blocked entirely if the fund is CLOSED, CLEARED, or RETURN —
 *              same guard as issueCashDisbursement, since this is modeled
 *              as a fresh issuance against the fund. The caller selects
 *              which fund to reimburse from via revolving_fund_id, so — same
 *              as returnCashDisbursement — this can be redirected to a
 *              different, active fund when the original is CLOSED.
 */
const reimburseCashDisbursement = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Reimburse an employee (new, immediately-liquidated disbursement). Cascades to revolving_fund only (budget already debited when the fund was funded). Blocked if the fund is CLOSED, CLEARED, or RETURN.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['revolving_fund_id'] = { in: 'formData', type: 'integer', required: true, description: 'Revolving Fund id to reimburse from' }
    #swagger.parameters['received_by'] = { in: 'formData', type: 'integer', required: true, description: 'Employee id (master_employee.me_id)' }
    #swagger.parameters['department_id'] = { in: 'formData', type: 'integer', required: true, description: 'Department id (master_department.md_id)' }
    #swagger.parameters['purpose'] = { in: 'formData', type: 'string', required: true, description: 'Free-text purpose for this disbursement' }
    #swagger.parameters['amount_reimburse'] = { in: 'formData', type: 'number', required: true, description: 'Amount to reimburse' }
    #swagger.parameters['cash_voucher'] = { in: 'formData', type: 'string', required: true, description: 'Cash voucher number' }
  */

  const userId = req.userId || req.user?.id || 1

  const { revolving_fund_id, received_by, department_id, purpose, amount_reimburse, cash_voucher } =
    req.body

  if (!revolving_fund_id || !received_by || !department_id || !purpose || !cash_voucher) {
    return res.status(400).json({
      message:
        'Missing required fields: revolving_fund_id, received_by, department_id, purpose, cash_voucher',
    })
  }

  const reimburseAmount = parseNum(amount_reimburse)
  if (reimburseAmount <= 0) {
    return res.status(400).json({ message: 'amount_reimburse must be greater than zero' })
  }

  try {
    const voucherCount = await checkCashVoucherLimit(cash_voucher)
    if (voucherCount >= 2) {
      return res
        .status(400)
        .json({ message: `Cash voucher '${cash_voucher}' already has 2 associated disbursements.` })
    }

    const rf = await getRevolvingFundById(revolving_fund_id)
    if (!rf) {
      return res.status(404).json({ message: 'Revolving fund not found' })
    }

    const rfStatus = rf[Revolving.Fund.cols.status]
    if (NON_ISSUABLE_RF_STATUSES.includes(rfStatus)) {
      return res.status(400).json({
        message: `Cannot reimburse from a revolving fund with status ${rfStatus}.`,
      })
    }

    const currentBalance = parseNum(rf[Revolving.Fund.cols.balance])
    if (currentBalance < reimburseAmount) {
      return res.status(400).json({ message: 'Insufficient revolving fund balance.' })
    }

    // Step 1: insert the CD row on its own — see note in issueCashDisbursement
    // on why this can't be folded into the same transaction as the rest.
    const insertCdQuery = SQL.model(Cash.Disbursement)
      .insert({
        [Cash.Disbursement.cols.date_issued]: new Date(),
        [Cash.Disbursement.cols.received_by]: received_by,
        [Cash.Disbursement.cols.revolving_fund_id]: revolving_fund_id,
        [Cash.Disbursement.cols.department_id]: department_id,
        [Cash.Disbursement.cols.purpose]: purpose,
        [Cash.Disbursement.cols.amount_issued]: reimburseAmount,
        [Cash.Disbursement.cols.cash_voucher]: cash_voucher,
        [Cash.Disbursement.cols.amount_returned]: 0,
        [Cash.Disbursement.cols.outstanding_amount]: 0,
        [Cash.Disbursement.cols.amount_expended]: reimburseAmount,
        [Cash.Disbursement.cols.status]: 'LIQUIDATED',
      })
      .build()

    const cdResult = await Query(insertCdQuery.sql, insertCdQuery.bindings)
    const newCdId = cdResult.insertId

    // Step 2: batch everything downstream into one real transaction.
    try {
      const newRfIssued = parseNum(rf[Revolving.Fund.cols.issued]) + reimburseAmount
      const newRfExpended = parseNum(rf[Revolving.Fund.cols.amount_expended]) + reimburseAmount
      const newRfLiquidated = parseNum(rf[Revolving.Fund.cols.liquidated]) + reimburseAmount
      const newRfBalance = currentBalance - reimburseAmount
      const newRfStatus = computeRfStatus(rf[Revolving.Fund.cols.status], newRfIssued > 0)

      const queries = [
        buildCdActivityInsert(
          newCdId,
          reimburseAmount,
          `Reimbursed amount: ₱${reimburseAmount.toFixed(2)}`,
          purpose,
        ),
        buildRfUpdate(revolving_fund_id, {
          [Revolving.Fund.cols.issued]: newRfIssued,
          [Revolving.Fund.cols.amount_expended]: newRfExpended,
          [Revolving.Fund.cols.liquidated]: newRfLiquidated,
          [Revolving.Fund.cols.balance]: newRfBalance,
          [Revolving.Fund.cols.status]: newRfStatus,
        }),
        buildRfActivityInsert(
          revolving_fund_id,
          `Reimbursed ₱${reimburseAmount.toFixed(2)} — issued (${newRfIssued}), expended (${newRfExpended}), liquidated (${newRfLiquidated}), balance (${newRfBalance}), status: ${newRfStatus}.`,
          userId,
        ),
      ]

      await Transaction(queries)
    } catch (txError) {
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

    return res.status(201).json({ message: 'Reimbursement recorded successfully', id: newCdId })
  } catch (error) {
    console.error('Error in reimburseCashDisbursement:', error)
    return res.status(500).json({ message: 'Error recording reimbursement' })
  }
}

// ==========================================
// READ ENDPOINTS
// ==========================================

/**
 * @name getCashDisbursement
 * @description Daily view: defaults to TODAY's disbursements (by
 *              date_issued). Pass date_from / date_to to look back. If
 *              revolving_fund_id is given and no dates are sent, all of
 *              that fund's disbursements are returned.
 */
const getCashDisbursement = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Get Disbursement records. Defaults to TODAY (by date_issued); pass date_from/date_to to look back. If revolving_fund_id is given without dates, all of that fund disbursements are returned.'
  /* 
    #swagger.parameters['revolving_fund_id'] = { in: 'query', type: 'integer', required: false, description: 'Filter by revolving fund id' }
    #swagger.parameters['status'] = { in: 'query', type: 'string', required: false, description: 'Filter by status (LIQUIDATED / UNLIQUIDATED)' }
    #swagger.parameters['date_from'] = { in: 'query', type: 'string', required: false, description: 'Start date (YYYY-MM-DD, inclusive). Defaults to today.' }
    #swagger.parameters['date_to'] = { in: 'query', type: 'string', required: false, description: 'End date (YYYY-MM-DD, inclusive). Defaults to today.' }
  */

  const { revolving_fund_id, status } = req.query

  const range = resolveDateRange(req.query, { defaultToToday: !revolving_fund_id })
  if (range.error) return res.status(400).json({ message: range.error })

  try {
    let queryBuilder = SQL.model(Cash.Disbursement).select(Cash.Disbursement.select)

    if (revolving_fund_id) {
      queryBuilder = queryBuilder.where(Cash.Disbursement.cols.revolving_fund_id, revolving_fund_id)
    }
    if (status) {
      queryBuilder = queryBuilder.where(Cash.Disbursement.cols.status, status)
    }

    const { sql, bindings } = queryBuilder.build()
    const result = await Query(sql, bindings)

    // NOTE: 'date_issued' is the aliased key the select returns. If your
    // response shows it under a different name, change it here.
    return res.status(200).json(filterRowsByDate(result, 'date_issued', range))
  } catch (error) {
    console.error('Error in getCashDisbursement:', error)
    return res.status(500).json({ message: 'Error retrieving Disbursement records' })
  }
}

/**
 * @name upsertCashDisbursementFile
 * @description Update and insert DisbursementFile
 */
const upsertCashDisbursementFile = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Upsert DisbursementFile'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['id'] = { in: 'formData', type: 'string', required: false, description: 'DisbursementFile id' }
    #swagger.parameters['cash_disbursement_id'] = { in: 'formData', type: 'string', required: false, description: 'DisbursementFile cash_disbursement_id' }
    #swagger.parameters['image'] = { in: 'formData', type: 'string', required: false, description: 'DisbursementFile image' }
  */

  const { id, cash_disbursement_id, image } = req.body

  let query

  try {
    if (id) {
      let updateData = {}
      if (cash_disbursement_id !== undefined)
        updateData[Cash.DisbursementFile.cols.cash_disbursement_id] = cash_disbursement_id
      if (image !== undefined) updateData[Cash.DisbursementFile.cols.image] = image

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No data to update' })
      }

      query = SQL.model(Cash.DisbursementFile)
        .update(updateData)
        .where(Cash.DisbursementFile.pk, id)
        .build()
    } else {
      if (!cash_disbursement_id || !image) {
        return res.status(400).json({ message: 'Missing required fields' })
      }

      query = SQL.model(Cash.DisbursementFile)
        .insert({
          [Cash.DisbursementFile.cols.cash_disbursement_id]: cash_disbursement_id,
          [Cash.DisbursementFile.cols.image]: image,
        })
        .build()
    }

    const result = await Query(query.sql, query.bindings)

    if (id && result.affectedRows === 0) {
      return res.status(404).json({ message: 'DisbursementFile not found' })
    }

    return res
      .status(id ? 200 : 201)
      .json({ message: id ? 'Updated successfully' : 'Created successfully' })
  } catch (error) {
    console.error('Error in upsertCashDisbursementFile:', error)
    return res.status(500).json({ message: 'Error processing DisbursementFile' })
  }
}

/**
 * @name getCashDisbursementFile
 * @description Get all DisbursementFile records
 */
const getCashDisbursementFile = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Get all DisbursementFile records'
  /* 
    #swagger.parameters['cash_disbursement_id'] = { in: 'query', type: 'string', required: false, description: 'Filter by cash disbursement id' }
  */

  const { cash_disbursement_id } = req.query

  try {
    let queryBuilder = SQL.model(Cash.DisbursementFile).select(Cash.DisbursementFile.select)

    if (cash_disbursement_id) {
      queryBuilder = queryBuilder.where(
        Cash.DisbursementFile.cols.cash_disbursement_id,
        cash_disbursement_id,
      )
    }

    const { sql, bindings } = queryBuilder.build()
    const result = await Query(sql, bindings)

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error in getCashDisbursementFile:', error)
    return res.status(500).json({ message: 'Error retrieving DisbursementFile records' })
  }
}

/**
 * @name getCashDisbursementActivity
 * @description Get all DisbursementActivity records
 */
const getCashDisbursementActivity = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Get all DisbursementActivity records'
  /* 
    #swagger.parameters['cash_disbursement_id'] = { in: 'query', type: 'string', required: false, description: 'Filter by cash disbursement id' }
  */

  const { cash_disbursement_id } = req.query

  try {
    let queryBuilder = SQL.model(Cash.DisbursementActivity).select(Cash.DisbursementActivity.select)

    if (cash_disbursement_id) {
      queryBuilder = queryBuilder.where(
        Cash.DisbursementActivity.cols.cash_disbursement_id,
        cash_disbursement_id,
      )
    }

    const { sql, bindings } = queryBuilder.build()
    const result = await Query(sql, bindings)

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error in getCashDisbursementActivity:', error)
    return res.status(500).json({ message: 'Error retrieving DisbursementActivity records' })
  }
}

/**
 * @name upsertCashDisbursementActivity
 * @description Manually insert/update a DisbursementActivity log entry
 *              (the action endpoints above log automatically; this remains
 *              available for manual/admin entries)
 */
const upsertCashDisbursementActivity = async (req, res) => {
  // #swagger.tags = ['Cash Disbursement']
  // #swagger.description = 'Upsert DisbursementActivity'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /* 
    #swagger.parameters['id'] = { in: 'formData', type: 'string', required: false, description: 'DisbursementActivity id' }
    #swagger.parameters['cash_disbursement_id'] = { in: 'formData', type: 'string', required: false, description: 'DisbursementActivity cash_disbursement_id' }
    #swagger.parameters['amount'] = { in: 'formData', type: 'number', required: false, description: 'DisbursementActivity amount' }
    #swagger.parameters['remarks'] = { in: 'formData', type: 'string', required: false, description: 'DisbursementActivity remarks' }
    #swagger.parameters['purpose'] = { in: 'formData', type: 'string', required: false, description: 'DisbursementActivity purpose' }
  */

  const { id, cash_disbursement_id, amount, remarks, purpose } = req.body

  let query

  try {
    if (id) {
      let updateData = {}
      if (cash_disbursement_id !== undefined)
        updateData[Cash.DisbursementActivity.cols.cash_disbursement_id] = cash_disbursement_id
      if (amount !== undefined) updateData[Cash.DisbursementActivity.cols.amount] = amount
      if (remarks !== undefined) updateData[Cash.DisbursementActivity.cols.remarks] = remarks
      if (purpose !== undefined) updateData[Cash.DisbursementActivity.cols.purpose] = purpose

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No data to update' })
      }

      query = SQL.model(Cash.DisbursementActivity)
        .update(updateData)
        .where(Cash.DisbursementActivity.pk, id)
        .build()
    } else {
      if (!cash_disbursement_id || amount === undefined || !remarks || !purpose) {
        return res.status(400).json({ message: 'Missing required fields' })
      }

      query = SQL.model(Cash.DisbursementActivity)
        .insert({
          [Cash.DisbursementActivity.cols.cash_disbursement_id]: cash_disbursement_id,
          [Cash.DisbursementActivity.cols.amount]: amount,
          [Cash.DisbursementActivity.cols.remarks]: remarks,
          [Cash.DisbursementActivity.cols.purpose]: purpose,
        })
        .build()
    }

    const result = await Query(query.sql, query.bindings)

    if (id && result.affectedRows === 0) {
      return res.status(404).json({ message: 'DisbursementActivity not found' })
    }

    return res
      .status(id ? 200 : 201)
      .json({ message: id ? 'Updated successfully' : 'Created successfully' })
  } catch (error) {
    console.error('Error in upsertCashDisbursementActivity:', error)
    return res.status(500).json({ message: 'Error processing DisbursementActivity' })
  }
}

module.exports = {
  getCashDisbursement,
  upsertCashDisbursement,
  editCashDisbursementAmount,
  issueCashDisbursement,
  returnCashDisbursement,
  recordExpendedCashDisbursement,
  reimburseCashDisbursement,
  getCashDisbursementFile,
  upsertCashDisbursementFile,
  getCashDisbursementActivity,
  upsertCashDisbursementActivity,
}
