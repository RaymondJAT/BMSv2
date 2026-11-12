const { Query } = require('../database/utilities/queries.util')

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100

/**
 * One wallet per employee (mw_employee_id is UNIQUE). Creates it at ₱0 the
 * first time it's needed and returns its id. Safe to call repeatedly.
 * Call this BEFORE any standalone insert, so a failure here can't leave
 * an orphaned row behind.
 */
const ensureWalletId = async (employeeId) => {
  await Query(
    `INSERT IGNORE INTO master_wallet (mw_employee_id, mw_previous_amount, mw_current_amount)
     VALUES (?, 0, 0)`,
    [employeeId],
  )
  const rows = await Query('SELECT mw_id FROM master_wallet WHERE mw_employee_id = ?', [employeeId])
  return rows[0]?.mw_id
}

/**
 * Builds the two queries ({ sql, values }, ready for Transaction()) that
 * post one ledger entry and move the wallet balance:
 *   1. ledger row, reading the balance INSIDE the transaction, so
 *      previous/new balance can't be stale
 *   2. wallet row update (previous <- current, current +/- amount)
 *
 * A DEBIT is clamped to the current balance, so the wallet never goes
 * negative. The unique index (wallet, reference_type, reference_id) makes
 * double posting fail instead of double counting.
 */
const buildWalletPosting = ({ walletId, type, amount, referenceType, referenceId, remarks }) => {
  const amt = round2(amount)
  const isCredit = type === 'CREDIT'

  const amountExpr = isCredit ? '?' : 'LEAST(mw_current_amount, ?)'
  const newBalanceExpr = isCredit
    ? 'mw_current_amount + ?'
    : 'mw_current_amount - LEAST(mw_current_amount, ?)'

  const ledger = {
    sql: `INSERT INTO master_wallet_activity
            (mwa_wallet_id, mwa_type, mwa_amount, mwa_previous_balance, mwa_new_balance,
             mwa_reference_type, mwa_reference_id, mwa_remarks)
          SELECT mw_id, ?, ${amountExpr}, mw_current_amount, ${newBalanceExpr}, ?, ?, ?
          FROM master_wallet WHERE mw_id = ?`,
    values: [type, amt, amt, referenceType, referenceId, remarks || null, walletId],
  }

  const update = {
    sql: `UPDATE master_wallet
          SET mw_previous_amount = mw_current_amount,
              mw_current_amount = ${newBalanceExpr},
              mw_updatedAt = NOW()
          WHERE mw_id = ?`,
    values: [amt, walletId],
  }

  // Ledger first: it must read the balance before the update changes it.
  return [ledger, update]
}

module.exports = { ensureWalletId, buildWalletPosting }
