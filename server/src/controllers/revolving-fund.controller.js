const { Query, Transaction, SQLQueryBuilder } = require('../database/utilities/queries.util')
const { resolveDateRange, filterRowsByDate } = require('../utilities/dateRange.util')
const { Revolving } = require('../database/models/Revolving')
const { Closed } = require('../database/models/Closed')
const { Budget } = require('../database/models/Budget')
const { Cash } = require('../database/models/Cash')

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

const formatDate = (date = new Date()) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const getDateBounds = () => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  return {
    todayStr: formatDate(today),
    yesterdayStr: formatDate(yesterday),
  }
}

/**
 * Transaction() expects an array of { sql, values }, but the query builder's
 * .build() returns { sql, bindings }. This adapts one to the other.
 */
const toTxQuery = ({ sql, bindings }) => ({ sql, values: bindings })

const getBudgetById = async (id) => {
  const { sql, bindings } = SQL.model(Budget.Budget)
    .select(Budget.Budget.select)
    .where(Budget.Budget.pk, id)
    .build()
  const [row] = await Query(sql, bindings)
  return wrapRow(row, Budget.Budget)
}

/**
 * Needed so a top-up (add_amount) can compute its delta against the
 * fund's CURRENT added/total_fund/balance server-side, instead of trusting
 * whatever cumulative totals the client sent — those can be stale (e.g. a
 * second edit landing before the first one's response refreshed the UI).
 */
const getRevolvingFundById = async (id) => {
  const { sql, bindings } = SQL.model(Revolving.Fund)
    .select(Revolving.Fund.select)
    .where(Revolving.Fund.pk, id)
    .build()
  const [row] = await Query(sql, bindings)
  return wrapRow(row, Revolving.Fund)
}

/**
 * The LIVE "how much of this budget is currently deployed into Revolving
 * Funds" figure — SUM(rf_balance + rf_outstanding) across every fund tied
 * to the budget. This is money currently outside Finance's control, either
 * sitting idle in a fund's balance or still out with a Requester as an
 * unresolved cash_disbursement. It automatically shrinks when a fund
 * closes (balance sweeps to 0) or a disbursement is returned, and grows on
 * top-up or issue — no manual bookkeeping required (matches
 * getBudgetBudget in budgetController.js, which surfaces the same figure
 * for display; this copy exists purely for server-side sufficiency checks
 * at the moment of mutation, before the client's cached copy could
 * possibly reflect the change).
 */
const getDeployedAmountForBudget = async (budgetId) => {
  const rows = await Query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN rf_status IN ('CLOSED', 'CLEARED') THEN GREATEST(rf_total_fund - rf_ending, 0)
         ELSE rf_total_fund
       END
     ), 0) AS deployed
     FROM revolving_fund WHERE rf_budget_id = ?`,
    [budgetId],
  )
  return parseNum(rows[0]?.deployed)
}

/**
 * True if the given fund has any UNLIQUIDATED cash_disbursement rows that
 * ORIGINATED from it (cd.revolving_fund_id === fundId). Since a
 * disbursement's revolving_fund_id is always its ORIGINAL fund and never
 * changes — even after a cross-fund return/reimburse liquidates it against
 * a different fund (see returnCashDisbursement in
 * cashDisbursementController.js) — this only counts a fund's own
 * transactions, never ones it merely helped liquidate for another fund.
 */
const hasUnliquidatedDisbursements = async (fundId) => {
  const { sql, bindings } = SQL.model(Cash.Disbursement)
    .select([Cash.Disbursement.cols.id])
    .where(Cash.Disbursement.cols.revolving_fund_id, fundId)
    .where(Cash.Disbursement.cols.status, 'UNLIQUIDATED')
    .build()
  const rows = await Query(sql, bindings)
  return rows.length > 0
}

// ==========================================
// CONTROLLERS
// ==========================================

/**
 * @name upsertRevolvingFund
 * @description Create or update a Revolving Fund entry.
 *
 *              IMPORTANT: neither creating nor topping up a fund writes
 *              anything to the connected Budget row anymore. budget.b_amount
 *              is Finance's ledger (see budgetController.js) and is never
 *              touched by Revolving Fund activity — instead, both flows
 *              below VALIDATE against a live "remaining budget" computed
 *              as Total Budget minus the actual current SUM of every
 *              fund's balance+outstanding for that budget (see
 *              getDeployedAmountForBudget). This means the Budget's
 *              Deployed/Remaining figures are always exactly reproducible
 *              from the fund rows themselves — never a separately
 *              maintained counter that can drift.
 */
const upsertRevolvingFund = async (req, res) => {
  // #swagger.tags = ['Revolving Fund']
  // #swagger.description = 'Create a new Revolving Fund (no id) or update / top-up an existing one (id). Validates against — but never writes to — the connected Budget. Top-up: send add_amount, a literal delta added to the fund current totals.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: false, description: 'Revolving fund id (update if present, create if blank)' }
    #swagger.parameters['budget_id'] = { in: 'formData', type: 'integer', required: false, description: 'Budget id (required on create)' }
    #swagger.parameters['year'] = { in: 'formData', type: 'integer', required: false, description: 'Defaults to the current year' }
    #swagger.parameters['month'] = { in: 'formData', type: 'integer', required: false, description: 'Defaults to the current month' }
    #swagger.parameters['start_date'] = { in: 'formData', type: 'string', required: false, description: 'YYYY-MM-DD, defaults to today' }
    #swagger.parameters['end_date'] = { in: 'formData', type: 'string', required: false, description: 'YYYY-MM-DD' }
    #swagger.parameters['beginning'] = { in: 'formData', type: 'number', required: false, description: 'Beginning amount' }
    #swagger.parameters['added'] = { in: 'formData', type: 'number', required: false, description: 'Amount added at creation' }
    #swagger.parameters['total_fund'] = { in: 'formData', type: 'number', required: false, description: 'Defaults to beginning + added on create' }
    #swagger.parameters['add_amount'] = { in: 'formData', type: 'number', required: false, description: 'Top-up: literal amount added THIS call (update only)' }
    #swagger.parameters['issued'] = { in: 'formData', type: 'number', required: false, description: 'Issued total' }
    #swagger.parameters['returned'] = { in: 'formData', type: 'number', required: false, description: 'Returned total' }
    #swagger.parameters['outstanding'] = { in: 'formData', type: 'number', required: false, description: 'Outstanding total' }
    #swagger.parameters['amount_expended'] = { in: 'formData', type: 'number', required: false, description: 'Expended total' }
    #swagger.parameters['ending'] = { in: 'formData', type: 'number', required: false, description: 'Ending amount' }
    #swagger.parameters['liquidated'] = { in: 'formData', type: 'number', required: false, description: 'Liquidated total' }
    #swagger.parameters['balance'] = { in: 'formData', type: 'number', required: false, description: 'Balance, defaults to total_fund on create' }
    #swagger.parameters['status'] = { in: 'formData', type: 'string', required: false, description: 'OPEN, ON REVIEW, CLOSED, CLEARED or RETURN' }
  */

  const userId = req.userId || req.user?.id || req.body.user_id || 1

  const {
    id,
    budget_id,
    year,
    month,
    start_date,
    end_date,
    beginning,
    added,
    total_fund,
    issued,
    returned,
    outstanding,
    amount_expended,
    ending,
    liquidated,
    balance,
    status,
    add_amount,
  } = req.body

  try {
    if (id) {
      // ==========================================
      // UPDATE FLOW
      // ==========================================
      const existingFund = await getRevolvingFundById(id)

      if (!existingFund) {
        return res.status(404).json({ message: 'Revolving Fund not found' })
      }

      const updateData = {}
      if (budget_id !== undefined) updateData[Revolving.Fund.cols.budget_id] = budget_id
      if (year !== undefined) updateData[Revolving.Fund.cols.year] = parseNum(year)
      if (month !== undefined) updateData[Revolving.Fund.cols.month] = parseNum(month)
      if (start_date !== undefined) updateData[Revolving.Fund.cols.start_date] = start_date
      if (end_date !== undefined) updateData[Revolving.Fund.cols.end_date] = end_date
      if (beginning !== undefined) updateData[Revolving.Fund.cols.beginning] = parseNum(beginning)
      if (added !== undefined) updateData[Revolving.Fund.cols.added] = parseNum(added)
      if (total_fund !== undefined)
        updateData[Revolving.Fund.cols.total_fund] = parseNum(total_fund)
      if (issued !== undefined) updateData[Revolving.Fund.cols.issued] = parseNum(issued)
      if (returned !== undefined) updateData[Revolving.Fund.cols.returned] = parseNum(returned)
      if (outstanding !== undefined)
        updateData[Revolving.Fund.cols.outstanding] = parseNum(outstanding)
      if (amount_expended !== undefined)
        updateData[Revolving.Fund.cols.amount_expended] = parseNum(amount_expended)
      if (ending !== undefined) updateData[Revolving.Fund.cols.ending] = parseNum(ending)
      if (liquidated !== undefined)
        updateData[Revolving.Fund.cols.liquidated] = parseNum(liquidated)
      if (balance !== undefined) updateData[Revolving.Fund.cols.balance] = parseNum(balance)

      if (status !== undefined) {
        updateData[Revolving.Fund.cols.status] = status
      } else if (issued !== undefined && parseNum(issued) > 0) {
        updateData[Revolving.Fund.cols.status] = 'ON REVIEW'
      }

      // Top-up: add_amount is the literal amount being added THIS call.
      // Computed here from the fund's current row (existingFund), not from
      // whatever added/total_fund/balance the client sent above — so a
      // second top-up of ₱2,000 always means "+₱2,000 from wherever the
      // fund currently is", not "overwrite added with 2,000". This
      // intentionally takes precedence over any raw added/total_fund/
      // balance fields set from the request above.
      const topUpAmount = add_amount !== undefined ? parseNum(add_amount) : 0
      let topUpRemarks = null

      if (topUpAmount > 0) {
        if (existingFund[Revolving.Fund.cols.status] === 'CLOSED') {
          return res.status(400).json({ message: 'Cannot add funds to a closed revolving fund.' })
        }

        const newAdded = parseNum(existingFund[Revolving.Fund.cols.added]) + topUpAmount
        const newTotalFund = parseNum(existingFund[Revolving.Fund.cols.total_fund]) + topUpAmount
        const newBalance = parseNum(existingFund[Revolving.Fund.cols.balance]) + topUpAmount

        updateData[Revolving.Fund.cols.added] = newAdded
        updateData[Revolving.Fund.cols.total_fund] = newTotalFund
        updateData[Revolving.Fund.cols.balance] = newBalance

        const fundBudgetId = existingFund[Revolving.Fund.cols.budget_id]
        const budgetRow = await getBudgetById(fundBudgetId)
        if (!budgetRow) {
          return res
            .status(400)
            .json({ message: `Associated budget ${fundBudgetId} not found for top-up.` })
        }

        // Sufficiency check against the LIVE remaining budget (Total minus
        // everything currently deployed across ALL this budget's funds,
        // including this one's own current stake) — never against a
        // manually-maintained b_amount wallet.
        const totalBudget = parseNum(budgetRow[Budget.Budget.cols.amount])
        const existingDeployed = await getDeployedAmountForBudget(fundBudgetId)
        const remainingBudget = totalBudget - existingDeployed

        if (remainingBudget < topUpAmount) {
          return res.status(400).json({ message: 'Insufficient budget amount balance for top-up.' })
        }

        topUpRemarks = `Topped up ₱${topUpAmount.toFixed(2)} — added (${newAdded}), total fund (${newTotalFund}), balance (${newBalance}).`
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No data provided to update' })
      }

      const query = SQL.model(Revolving.Fund)
        .update(updateData)
        .where(Revolving.Fund.pk, id)
        .build()

      // The RF update and its activity log both reference an id we already
      // know (no generated-id dependency), so they batch into one real,
      // all-or-nothing transaction. No budget queries are ever appended
      // here — see this function's docstring.
      const queries = [toTxQuery(query)]

      if (Revolving.FundActivity) {
        const activityQuery = SQL.model(Revolving.FundActivity)
          .insert({
            [Revolving.FundActivity.cols.revolving_fund_id]: id,
            [Revolving.FundActivity.cols.remarks]:
              topUpRemarks ||
              `Revolving Fund updated (Status: ${updateData[Revolving.Fund.cols.status] || 'N/A'})`,
            [Revolving.FundActivity.cols.user_id]: userId,
          })
          .build()

        queries.push(toTxQuery(activityQuery))
      }

      await Transaction(queries)

      return res.status(200).json({
        message: 'Revolving fund updated successfully',
        id,
      })
    } else {
      // ==========================================
      // CREATE FLOW
      // ==========================================
      if (!budget_id) {
        return res.status(400).json({ message: 'Budget id is required' })
      }

      const { todayStr, yesterdayStr } = getDateBounds()

      const budgetRow = await getBudgetById(budget_id)
      if (!budgetRow) {
        return res.status(400).json({ message: 'Invalid budget ID' })
      }

      const departmentId = budgetRow[Budget.Budget.cols.department_id]
      const budgetType = budgetRow[Budget.Budget.cols.type]

      const unclosedYesterdayQuery = await Query(
        `SELECT 
          rf_start_date AS start_date, 
          CONCAT(md_description, '-', b_type) AS name, 
          rf_status 
        FROM revolving_fund 
        INNER JOIN budget ON rf_budget_id = b_id 
        INNER JOIN master_department ON b_department_id = md_id 
        WHERE DATE(rf_start_date) = ? 
          AND rf_budget_id = ? 
          AND rf_status IN ('ON REVIEW', 'OPEN')`,
        [yesterdayStr, budget_id],
      )

      if (unclosedYesterdayQuery.length > 0) {
        const existingName = unclosedYesterdayQuery.map((rf) => rf.name).join(', ')
        return res.status(400).json({
          message: `Revolving fund with type(s) ${existingName} is still not closed from Yesterday`,
        })
      }

      const todayExistingQuery = await Query(
        `SELECT b_type FROM revolving_fund 
        INNER JOIN budget ON rf_budget_id = b_id 
        WHERE DATE(rf_start_date) = ? 
          AND b_department_id = ? 
          AND (b_type = 'CASH' OR b_type = 'GCASH')`,
        [todayStr, departmentId],
      )

      if (todayExistingQuery.some((rf) => rf.b_type === budgetType)) {
        return res.status(400).json({
          message: `Revolving fund with type ${budgetType} already exists for this department today.`,
        })
      }

      const beginningAmount = parseNum(beginning)
      const addedAmount = parseNum(added)
      const totalFundAmount =
        total_fund !== undefined ? parseNum(total_fund) : beginningAmount + addedAmount

      // Both beginning and added leave the budget's available pool and
      // become locked in the fund, so both must be covered by the
      // budget's current REMAINING balance — not raw b_amount, and not
      // beginning alone.
      const deployedAmount = beginningAmount + addedAmount
      const totalBudget = parseNum(budgetRow[Budget.Budget.cols.amount])
      const existingDeployed = await getDeployedAmountForBudget(budget_id)
      const remainingBudget = totalBudget - existingDeployed

      if (remainingBudget < deployedAmount) {
        return res.status(400).json({ message: 'Insufficient budget amount balance.' })
      }

      const now = new Date()
      const currentYear = parseNum(year, now.getFullYear())
      const currentMonth = parseNum(month, now.getMonth() + 1)
      const startDateVal = start_date || todayStr
      const endDateVal = end_date || null
      const initialIssued = parseNum(issued)

      const initialStatus = status || (initialIssued > 0 ? 'ON REVIEW' : 'OPEN')

      // rf_id is an autoincrement INTEGER. The activity log below needs
      // this generated id, and Transaction() can't return generated ids
      // mid-batch, so this insert stays standalone.
      const insertFundQuery = SQL.model(Revolving.Fund)
        .insert({
          [Revolving.Fund.cols.budget_id]: budget_id,
          [Revolving.Fund.cols.year]: currentYear,
          [Revolving.Fund.cols.month]: currentMonth,
          [Revolving.Fund.cols.start_date]: startDateVal,
          [Revolving.Fund.cols.end_date]: endDateVal,
          [Revolving.Fund.cols.beginning]: beginningAmount,
          [Revolving.Fund.cols.added]: addedAmount,
          [Revolving.Fund.cols.total_fund]: totalFundAmount,
          [Revolving.Fund.cols.issued]: initialIssued,
          [Revolving.Fund.cols.returned]: parseNum(returned),
          [Revolving.Fund.cols.outstanding]: parseNum(outstanding),
          [Revolving.Fund.cols.amount_expended]: parseNum(amount_expended),
          [Revolving.Fund.cols.ending]: parseNum(ending),
          [Revolving.Fund.cols.liquidated]: parseNum(liquidated),
          [Revolving.Fund.cols.balance]:
            balance !== undefined ? parseNum(balance) : totalFundAmount,
          [Revolving.Fund.cols.status]: initialStatus,
        })
        .build()

      const resFund = await Query(insertFundQuery.sql, insertFundQuery.bindings)
      const newFundId = resFund.insertId

      try {
        const queries = []

        if (Revolving.FundActivity) {
          const activityQuery = SQL.model(Revolving.FundActivity)
            .insert({
              [Revolving.FundActivity.cols.revolving_fund_id]: newFundId,
              [Revolving.FundActivity.cols.remarks]:
                `Initial fund created (Status: ${initialStatus}, Amount: ₱${totalFundAmount.toFixed(
                  2,
                )})`,
              [Revolving.FundActivity.cols.user_id]: userId,
            })
            .build()

          queries.push(toTxQuery(activityQuery))
        }

        if (queries.length > 0) {
          await Transaction(queries)
        }
      } catch (txError) {
        // Compensate: the RF row committed above, but its activity log
        // insert failed — remove the orphaned RF row so we don't leave a
        // fund with no matching activity log.
        try {
          const { sql: delSql, bindings: delBindings } = SQL.model(Revolving.Fund)
            .delete()
            .where(Revolving.Fund.pk, newFundId)
            .build()
          await Query(delSql, delBindings)
        } catch (compensationError) {
          console.error(
            `CRITICAL: failed to compensate orphaned revolving_fund id ${newFundId} after transaction failure:`,
            compensationError,
          )
        }
        throw txError
      }

      return res.status(200).json({
        message: 'Revolving fund created successfully',
        id: newFundId,
      })
    }
  } catch (error) {
    console.error('Error in upsertRevolvingFund:', error)
    return res
      .status(500)
      .json({ message: 'Error processing Revolving Fund record', error: error.message })
  }
}

/**
 * @name upsertClosedRevolvingFund
 * @description Submit/Report a Revolving Fund = CLOSE and SURRENDER it.
 *              Zeroes rf_balance and records the counted amount in
 *              rf_ending (purely descriptive — what was actually on hand
 *              at closure). Sets status to CLOSED if the fund still has
 *              unliquidated Cash Disbursements of its own, or straight to
 *              CLEARED if it doesn't (see hasUnliquidatedDisbursements).
 *
 *              IMPORTANT: this does NOT credit anything back to the
 *              connected Budget. It doesn't need to — the Budget's
 *              Deployed/Remaining figures are computed live as
 *              SUM(rf_balance + rf_outstanding) across the budget's funds
 *              (see getBudgetBudget in budgetController.js), so the moment
 *              this fund's balance is swept to 0 here, that money is
 *              automatically reflected as available again in the Budget's
 *              Remaining figure — no separate ledger transfer required, and
 *              no risk of crediting the same money back twice.
 */
const upsertClosedRevolvingFund = async (req, res) => {
  // #swagger.tags = ['Revolving Fund']
  // #swagger.description = 'Submit/report a Revolving Fund = CLOSE and SURRENDER it (no id), or edit an existing submission record (id). Zeroes the fund balance; status becomes CLOSED if the fund still has its own unliquidated disbursements, otherwise CLEARED.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: false, description: 'Submission record id (update if present, create if blank)' }
    #swagger.parameters['revolving_fund_id'] = { in: 'formData', type: 'integer', required: false, description: 'Fund being surrendered (required on create)' }
    #swagger.parameters['beginning'] = { in: 'formData', type: 'number', required: false, description: 'Beginning amount' }
    #swagger.parameters['cash_inflow'] = { in: 'formData', type: 'number', required: false, description: 'Cash inflow' }
    #swagger.parameters['cash_outflow'] = { in: 'formData', type: 'number', required: false, description: 'Cash outflow' }
    #swagger.parameters['ending'] = { in: 'formData', type: 'number', required: false, description: 'Ending amount' }
    #swagger.parameters['cashonhand'] = { in: 'formData', type: 'number', required: false, description: 'Cash on hand counted' }
    #swagger.parameters['gcash'] = { in: 'formData', type: 'number', required: false, description: 'GCash counted' }
    #swagger.parameters['total_cash'] = { in: 'formData', type: 'number', required: false, description: 'Total cash counted' }
    #swagger.parameters['sub_total'] = { in: 'formData', type: 'number', required: false, description: 'Sub total' }
    #swagger.parameters['status'] = { in: 'formData', type: 'string', required: false, description: 'BALANCED, SHORT or OVER (defaults to BALANCED)' }
    #swagger.parameters['created_by'] = { in: 'formData', type: 'integer', required: false, description: 'User id who submitted' }
    #swagger.parameters['end_date'] = { in: 'formData', type: 'string', required: false, description: 'YYYY-MM-DD fund end date' }
  */

  const userId = req.userId || req.user?.id || req.body.created_by || 1

  const {
    id,
    revolving_fund_id,
    beginning,
    cash_inflow,
    cash_outflow,
    ending,
    cashonhand,
    gcash,
    total_cash,
    sub_total,
    status,
    created_by,
    end_date,
  } = req.body

  const ClosedModel = Closed.RevolvingFund

  try {
    let closedRecordId = id

    if (id) {
      // Update existing submission record
      const updateData = {}
      if (revolving_fund_id !== undefined)
        updateData[ClosedModel.cols.revolving_fund_id] = revolving_fund_id
      if (beginning !== undefined) updateData[ClosedModel.cols.beginning] = parseNum(beginning)
      if (cash_inflow !== undefined)
        updateData[ClosedModel.cols.cash_inflow] = parseNum(cash_inflow)
      if (cash_outflow !== undefined)
        updateData[ClosedModel.cols.cash_outflow] = parseNum(cash_outflow)
      if (ending !== undefined) updateData[ClosedModel.cols.ending] = parseNum(ending)
      if (cashonhand !== undefined) updateData[ClosedModel.cols.cashonhand] = parseNum(cashonhand)
      if (gcash !== undefined) updateData[ClosedModel.cols.gcash] = parseNum(gcash)
      if (total_cash !== undefined) updateData[ClosedModel.cols.total_cash] = parseNum(total_cash)
      if (sub_total !== undefined) updateData[ClosedModel.cols.sub_total] = parseNum(sub_total)
      if (status !== undefined) updateData[ClosedModel.cols.status] = status
      if (created_by !== undefined) updateData[ClosedModel.cols.created_by] = created_by

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No data provided to update' })
      }

      const updateQuery = SQL.model(ClosedModel)
        .update(updateData)
        .where(ClosedModel.pk, id)
        .build()
      const updateResult = await Query(updateQuery.sql, updateQuery.bindings)

      if (updateResult.affectedRows === 0) {
        return res.status(404).json({ message: 'Submitted Revolving Fund record not found' })
      }
    } else {
      // Create new submission record = SURRENDER the Revolving Fund.
      if (!revolving_fund_id) {
        return res.status(400).json({ message: 'Missing required field: revolving_fund_id' })
      }

      const validSubmitStatuses = ['BALANCED', 'SHORT', 'OVER']
      const submitStatus =
        status && validSubmitStatuses.includes(status.toUpperCase())
          ? status.toUpperCase()
          : 'BALANCED'

      const rf = await getRevolvingFundById(revolving_fund_id)
      if (!rf) {
        return res.status(404).json({ message: 'Revolving fund not found' })
      }

      const rfStatus = rf[Revolving.Fund.cols.status]
      if (rfStatus === 'CLOSED' || rfStatus === 'CLEARED') {
        return res.status(400).json({
          message: `Revolving fund is already ${rfStatus} and cannot be submitted/surrendered again.`,
        })
      }

      // Descriptive only — what was actually counted at closure. Not
      // transferred anywhere; the Budget derives its own Remaining figure
      // live from rf_balance/rf_outstanding, so simply zeroing rf_balance
      // below is what actually "returns" this money to the Budget's view.
      const remainingCash = Math.round(parseNum(rf[Revolving.Fund.cols.balance]) * 100) / 100

      // crf_id is an autoincrement INTEGER — nothing downstream actually
      // needs it (the parent-status update and activity log only need
      // revolving_fund_id, already known), but the insert still can't
      // report its own insertId back through Transaction(), so it stays
      // standalone for consistency with the rest of this file's pattern.
      const insertQuery = SQL.model(ClosedModel)
        .insert({
          [ClosedModel.cols.revolving_fund_id]: revolving_fund_id,
          [ClosedModel.cols.beginning]: parseNum(beginning),
          [ClosedModel.cols.cash_inflow]: parseNum(cash_inflow),
          [ClosedModel.cols.cash_outflow]: parseNum(cash_outflow),
          [ClosedModel.cols.ending]: parseNum(ending),
          [ClosedModel.cols.cashonhand]: parseNum(cashonhand),
          [ClosedModel.cols.gcash]: parseNum(gcash),
          [ClosedModel.cols.total_cash]: parseNum(total_cash),
          [ClosedModel.cols.sub_total]: parseNum(sub_total),
          [ClosedModel.cols.status]: submitStatus,
          [ClosedModel.cols.created_by]: created_by || userId,
        })
        .build()

      const insertResult = await Query(insertQuery.sql, insertQuery.bindings)
      closedRecordId = insertResult.insertId

      try {
        // Status is decided by THIS fund's own outstanding transactions —
        // not by whether it happened to be used as someone else's
        // liquidation target. A disbursement counts toward a fund only via
        // cd.revolving_fund_id (its ORIGINAL fund), so a fund that was only
        // ever used to receive a cross-fund return/reimburse for another
        // fund's disbursement has zero of its own and goes straight to
        // CLEARED — it never passes through CLOSED. See
        // hasUnliquidatedDisbursements above.
        const hasOwnUnliquidated = await hasUnliquidatedDisbursements(revolving_fund_id)
        const newFundStatus = hasOwnUnliquidated ? 'CLOSED' : 'CLEARED'

        const updateParentQuery = SQL.model(Revolving.Fund)
          .update({
            [Revolving.Fund.cols.status]: newFundStatus,
            [Revolving.Fund.cols.balance]: 0,
            [Revolving.Fund.cols.ending]: remainingCash,
            ...(end_date !== undefined ? { [Revolving.Fund.cols.end_date]: end_date } : {}),
          })
          .where(Revolving.Fund.pk, revolving_fund_id)
          .build()

        const queries = [toTxQuery(updateParentQuery)]

        if (Revolving.FundActivity) {
          const activityQuery = SQL.model(Revolving.FundActivity)
            .insert({
              [Revolving.FundActivity.cols.revolving_fund_id]: revolving_fund_id,
              [Revolving.FundActivity.cols.remarks]:
                `Revolving Fund submitted/reported (reconciliation: ${submitStatus}) and surrendered. Status: ${newFundStatus}.` +
                (remainingCash > 0
                  ? ` ₱${remainingCash.toFixed(2)} balance released back to the connected Budget's available pool.`
                  : ' No remaining cash to release.'),
              [Revolving.FundActivity.cols.user_id]: userId,
            })
            .build()

          queries.push(toTxQuery(activityQuery))
        }

        await Transaction(queries)
      } catch (txError) {
        // Compensate: the closed-fund submission committed above, but
        // updating the parent fund's status/balance failed — remove the
        // orphaned submission rather than leave a reconciliation record
        // whose parent fund was never actually closed.
        try {
          const { sql: delSql, bindings: delBindings } = SQL.model(ClosedModel)
            .delete()
            .where(ClosedModel.pk, closedRecordId)
            .build()
          await Query(delSql, delBindings)
        } catch (compensationError) {
          console.error(
            `CRITICAL: failed to compensate orphaned closed_revolving_fund id ${closedRecordId} after transaction failure:`,
            compensationError,
          )
        }
        throw txError
      }
    }

    return res.status(200).json({
      message: id
        ? 'Submitted Revolving Fund record updated successfully'
        : 'Revolving Fund submitted and reconciled successfully',
      id: closedRecordId,
    })
  } catch (error) {
    console.error('Error in upsertClosedRevolvingFund:', error)
    return res
      .status(500)
      .json({ message: 'Error processing Closed Revolving Fund record', error: error.message })
  }
}

/**
 * @name upsertRevolvingFundActivity
 * @description Log activity entries manually
 */
const upsertRevolvingFundActivity = async (req, res) => {
  // #swagger.tags = ['Revolving Fund']
  // #swagger.description = 'Manually insert (no id) or update (id) a Revolving Fund activity log entry'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: false, description: 'Activity id (update if present, create if blank)' }
    #swagger.parameters['revolving_fund_id'] = { in: 'formData', type: 'integer', required: false, description: 'Revolving fund id (required on create)' }
    #swagger.parameters['remarks'] = { in: 'formData', type: 'string', required: false, description: 'Activity remarks (required on create)' }
    #swagger.parameters['user_id'] = { in: 'formData', type: 'integer', required: false, description: 'User id' }
  */

  const userId = req.userId || req.user?.id || req.body.user_id || 1
  const { id, revolving_fund_id, remarks, user_id } = req.body

  try {
    let query
    if (id) {
      const updateData = {}
      if (revolving_fund_id !== undefined)
        updateData[Revolving.FundActivity.cols.revolving_fund_id] = revolving_fund_id
      if (remarks !== undefined) updateData[Revolving.FundActivity.cols.remarks] = remarks
      if (user_id !== undefined) updateData[Revolving.FundActivity.cols.user_id] = user_id

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No data provided to update' })
      }

      query = SQL.model(Revolving.FundActivity)
        .update(updateData)
        .where(Revolving.FundActivity.pk, id)
        .build()
    } else {
      if (!revolving_fund_id || !remarks) {
        return res
          .status(400)
          .json({ message: 'Missing required fields: revolving_fund_id and remarks are required' })
      }

      query = SQL.model(Revolving.FundActivity)
        .insert({
          [Revolving.FundActivity.cols.revolving_fund_id]: revolving_fund_id,
          [Revolving.FundActivity.cols.remarks]: remarks,
          [Revolving.FundActivity.cols.user_id]: user_id || userId,
        })
        .build()
    }

    const result = await Query(query.sql, query.bindings)

    if (id && result.affectedRows === 0) {
      return res.status(404).json({ message: 'FundActivity record not found' })
    }

    return res.status(200).json({
      message: id ? 'Activity log updated successfully' : 'Activity log created successfully',
    })
  } catch (error) {
    console.error('Error in upsertRevolvingFundActivity:', error)
    return res
      .status(500)
      .json({ message: 'Error processing Revolving Fund Activity record', error: error.message })
  }
}

/**
 * @name getRevolvingFund
 * @description Daily view: defaults to TODAY's funds (by start_date). Pass
 *              date_from / date_to to look back. If budget_id is given and
 *              no dates are sent, all funds of that budget are returned.
 */
const getRevolvingFund = async (req, res) => {
  // #swagger.tags = ['Revolving Fund']
  // #swagger.description = 'Get Revolving Fund records. Defaults to TODAY (by start_date); pass date_from/date_to to look back. If budget_id is given without dates, all funds of that budget are returned.'
  /*
    #swagger.parameters['status'] = { in: 'query', type: 'string', required: false, description: 'Filter by status (OPEN, ON REVIEW, CLOSED, CLEARED, RETURN)' }
    #swagger.parameters['budget_id'] = { in: 'query', type: 'integer', required: false, description: 'Filter by budget id' }
    #swagger.parameters['date_from'] = { in: 'query', type: 'string', required: false, description: 'Start date (YYYY-MM-DD, inclusive). Defaults to today.' }
    #swagger.parameters['date_to'] = { in: 'query', type: 'string', required: false, description: 'End date (YYYY-MM-DD, inclusive). Defaults to today.' }
  */

  const { status, budget_id } = req.query

  const range = resolveDateRange(req.query, { defaultToToday: !budget_id })
  if (range.error) return res.status(400).json({ message: range.error })

  try {
    let queryBuilder = SQL.model(Revolving.Fund).select([
      Revolving.Fund.cols.id,
      Revolving.Fund.cols.budget_id,
      Revolving.Fund.cols.year,
      Revolving.Fund.cols.month,
      Revolving.Fund.cols.start_date,
      Revolving.Fund.cols.end_date,
      Revolving.Fund.cols.beginning,
      Revolving.Fund.cols.added,
      Revolving.Fund.cols.total_fund,
      Revolving.Fund.cols.issued,
      Revolving.Fund.cols.returned,
      Revolving.Fund.cols.outstanding,
      Revolving.Fund.cols.amount_expended,
      Revolving.Fund.cols.ending,
      Revolving.Fund.cols.liquidated,
      Revolving.Fund.cols.balance,
      Revolving.Fund.cols.status,
      Revolving.Fund.cols.createdAt,
    ])

    if (status) queryBuilder = queryBuilder.where(Revolving.Fund.cols.status, status)
    if (budget_id) queryBuilder = queryBuilder.where(Revolving.Fund.cols.budget_id, budget_id)

    const { sql, bindings } = queryBuilder.build()
    const result = await Query(sql, bindings)

    // NOTE: 'start_date' is the aliased key the select above returns. If
    // your response shows it under a different name, change it here.
    return res.status(200).json(filterRowsByDate(result, 'start_date', range))
  } catch (error) {
    console.error('Error in getRevolvingFund:', error)
    return res
      .status(500)
      .json({ message: 'Error retrieving Revolving Fund records', error: error.message })
  }
}

/**
 * @name getRevolvingFundActivity
 */
const getRevolvingFundActivity = async (req, res) => {
  // #swagger.tags = ['Revolving Fund']
  // #swagger.description = 'Get Revolving Fund activity records'
  /*
    #swagger.parameters['revolving_fund_id'] = { in: 'query', type: 'integer', required: false, description: 'Filter by revolving fund id' }
  */

  const { revolving_fund_id } = req.query

  try {
    let queryBuilder = SQL.model(Revolving.FundActivity).select([
      Revolving.FundActivity.cols.id,
      Revolving.FundActivity.cols.revolving_fund_id,
      Revolving.FundActivity.cols.remarks,
      Revolving.FundActivity.cols.user_id,
      Revolving.FundActivity.cols.createdAt,
    ])

    if (revolving_fund_id) {
      queryBuilder = queryBuilder.where(
        Revolving.FundActivity.cols.revolving_fund_id,
        revolving_fund_id,
      )
    }

    const { sql, bindings } = queryBuilder.build()
    const result = await Query(sql, bindings)

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error in getRevolvingFundActivity:', error)
    return res
      .status(500)
      .json({ message: 'Error retrieving Revolving Fund Activity records', error: error.message })
  }
}

/**
 * @name getClosedRevolvingFund
 */
const getClosedRevolvingFund = async (req, res) => {
  // #swagger.tags = ['Revolving Fund']
  // #swagger.description = 'Get submitted/closed Revolving Fund records'
  /*
    #swagger.parameters['revolving_fund_id'] = { in: 'query', type: 'integer', required: false, description: 'Filter by revolving fund id' }
  */

  const { revolving_fund_id } = req.query
  const ClosedModel = Closed.RevolvingFund

  try {
    let queryBuilder = SQL.model(ClosedModel).select([
      ClosedModel.cols.id,
      ClosedModel.cols.revolving_fund_id,
      ClosedModel.cols.beginning,
      ClosedModel.cols.cash_inflow,
      ClosedModel.cols.cash_outflow,
      ClosedModel.cols.ending,
      ClosedModel.cols.cashonhand,
      ClosedModel.cols.gcash,
      ClosedModel.cols.total_cash,
      ClosedModel.cols.sub_total,
      ClosedModel.cols.status,
      ClosedModel.cols.created_by,
      ClosedModel.cols.createdAt,
    ])

    if (revolving_fund_id) {
      queryBuilder = queryBuilder.where(ClosedModel.cols.revolving_fund_id, revolving_fund_id)
    }

    const { sql, bindings } = queryBuilder.build()
    const result = await Query(sql, bindings)

    return res.status(200).json(result)
  } catch (error) {
    console.error('Error in getClosedRevolvingFund:', error)
    return res
      .status(500)
      .json({ message: 'Error retrieving Closed Revolving Fund records', error: error.message })
  }
}

module.exports = {
  getRevolvingFund,
  upsertRevolvingFund,
  getRevolvingFundActivity,
  upsertRevolvingFundActivity,
  getClosedRevolvingFund,
  upsertClosedRevolvingFund,
}
