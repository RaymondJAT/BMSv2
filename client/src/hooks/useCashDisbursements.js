import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cashDisbursementApi } from '../api/cashDisbursementApi'

/**
 * Wraps cashDisbursementApi with list state + all backend actions.
 * Every mutating action refetches the list on success so the table stays
 * in sync with server-computed fields (outstanding_amount, status, etc —
 * these are never set optimistically since the backend, not the client,
 * owns that math).
 *
 * IMPORTANT: this hook manages its own disbursements list via plain state
 * (not react-query), but issue/return/expended/reimburse/editAmount can
 * all change a revolving_fund's balance/status server-side — including
 * auto-clearing a CLOSED fund to CLEARED once its last disbursement is
 * settled (see cashDisbursementController.js). The Revolving Funds page
 * reads funds through react-query (`useRevolvingFunds`, key
 * ['revolvingFunds']), which has no way to know that data went stale from
 * a mutation made through THIS hook. Every mutation below therefore also
 * invalidates that query cache, or the fund list silently shows stale
 * statuses/balances until the user manually retries or remounts the page.
 */
export function useCashDisbursements(initialParams = {}) {
  const { dateFrom, dateTo } = initialParams
  const [disbursements, setDisbursements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isMutating, setIsMutating] = useState(false)
  const queryClient = useQueryClient()

  const fetchDisbursements = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await cashDisbursementApi.getAll({ dateFrom, dateTo })
      setDisbursements(data || [])
    } catch (err) {
      console.error('Failed to fetch cash disbursements:', err)
      setError(err.response?.data?.message || 'Failed to load cash disbursements.')
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchDisbursements()
  }, [fetchDisbursements])

  // Every disbursement action that touches a revolving_fund can move its
  // balance/status (including a CLOSED -> CLEARED auto-transition), so
  // every such mutation invalidates the funds cache in addition to
  // refetching this hook's own disbursements list.
  const invalidateRevolvingFunds = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['revolvingFunds'] })
  }, [queryClient])

  const runMutation = useCallback(
    async (fn, payload, { invalidateFunds = true } = {}) => {
      setIsMutating(true)
      try {
        const result = await fn(payload)
        await fetchDisbursements()
        if (invalidateFunds) invalidateRevolvingFunds()
        return { success: true, data: result }
      } catch (err) {
        console.error('Cash disbursement mutation failed:', err)
        const message = err.response?.data?.message || 'Something went wrong. Please try again.'
        return { success: false, message }
      } finally {
        setIsMutating(false)
      }
    },
    [fetchDisbursements, invalidateRevolvingFunds],
  )

  // Issue new cash from a revolving fund
  const issue = useCallback(
    (payload) => runMutation(cashDisbursementApi.issue, payload),
    [runMutation],
  )

  // Record a return of unused issued cash against an existing disbursement
  const returnCash = useCallback(
    (payload) => runMutation(cashDisbursementApi.returnCash, payload),
    [runMutation],
  )

  // Record spending against previously issued cash
  const recordExpended = useCallback(
    (payload) => runMutation(cashDisbursementApi.recordExpended, payload),
    [runMutation],
  )

  // Reimburse an employee (new, immediately-liquidated disbursement)
  const reimburse = useCallback(
    (payload) => runMutation(cashDisbursementApi.reimburse, payload),
    [runMutation],
  )

  // Metadata-only edit (received_by, department_id, purpose, cash_voucher)
  // — id is required; the backend rejects metadata upserts without one.
  // Doesn't touch any revolving_fund, so no funds-cache invalidation needed.
  const updateMetadata = useCallback(
    (payload) => runMutation(cashDisbursementApi.save, payload, { invalidateFunds: false }),
    [runMutation],
  )

  // Amount edit — recalculates the difference against the related
  // revolving fund (and budget, if connected). Can move fund balance/
  // status, including a CLOSED -> CLEARED auto-transition on a decrease,
  // so this DOES invalidate the funds cache.
  const editAmount = useCallback(
    (payload) => runMutation(cashDisbursementApi.editAmount, payload),
    [runMutation],
  )

  /**
   * Combined save used by EditCashDisbursementModal: that modal collects
   * both metadata fields (received_by/department_id/purpose/cash_voucher)
   * and amount_issued in one form, but the backend deliberately splits
   * these into two endpoints — upsertCashDisbursement (metadata only) and
   * editCashDisbursementAmount (amount, with its own difference-based
   * recalculation against the fund/budget). This runs both, but only
   * calls editAmount when the amount actually changed (matches
   * "difference === 0 -> no financial records touched" from the backend's
   * own contract, and avoids an unnecessary extra request / activity-log
   * entry on every metadata-only edit).
   *
   * If metadata succeeds but the amount edit fails (e.g. insufficient
   * fund balance for an increase), metadata changes are NOT rolled back —
   * they're a separate transaction on the backend. The returned message
   * surfaces the amount-edit failure so the user knows to retry just the
   * amount field; the modal stays open (see its handleSubmit) since the
   * overall result is reported as a failure.
   */
  const saveDisbursement = useCallback(
    async ({ originalAmount, ...payload }) => {
      const metaResult = await updateMetadata({
        id: payload.id,
        received_by: payload.received_by,
        department_id: payload.department_id,
        purpose: payload.purpose,
        cash_voucher: payload.cash_voucher,
      })

      if (!metaResult.success) {
        return metaResult
      }

      const newAmount = parseFloat(payload.amount_issued)
      const oldAmount = parseFloat(originalAmount)
      const amountChanged = !isNaN(newAmount) && !isNaN(oldAmount) && newAmount !== oldAmount

      if (!amountChanged) {
        return metaResult
      }

      const amountResult = await editAmount({
        id: payload.id,
        amount_issued: newAmount,
      })

      if (!amountResult.success) {
        return {
          success: false,
          message: `Details saved, but the amount change failed: ${amountResult.message}`,
        }
      }

      return amountResult
    },
    [updateMetadata, editAmount],
  )

  /**
   * Submits a liquidation report: settles the existing outstanding via
   * return + expended, and if the reported expended amount exceeds what's
   * left after the return (employee spent out of pocket), auto-triggers a
   * reimbursement for the excess — reusing the original cash_voucher, which
   * is exactly the "issue row + reimbursement row" pattern the backend's
   * 2-per-voucher limit is designed for.
   *
   * Can issue up to two sequential backend calls (recordExpended, then
   * returnCash or reimburse). Either call alone can be the one that fully
   * settles the disbursement and triggers a fund's CLOSED -> CLEARED
   * transition server-side, so the funds cache is invalidated once at the
   * end regardless of which combination actually ran.
   */
  const submitLiquidation = useCallback(
    async ({
      disbursement,
      revolving_fund_id,
      amount_return = 0,
      amount_expended = 0,
      is_reimbursement = false,
      reimbursement_amount = 0,
    }) => {
      setIsMutating(true)
      try {
        const outstanding = parseFloat(disbursement.outstanding_amount || 0)
        const expendedToRecord = Math.min(parseFloat(amount_expended) || 0, outstanding)

        if (expendedToRecord > 0) {
          await cashDisbursementApi.recordExpended({
            id: disbursement.id,
            amount_expended: expendedToRecord,
          })
        }

        if (!is_reimbursement) {
          const returnToRecord = Math.min(
            parseFloat(amount_return) || 0,
            Math.max(0, outstanding - expendedToRecord),
          )
          if (returnToRecord > 0) {
            await cashDisbursementApi.returnCash({
              id: disbursement.id,
              amount_return: returnToRecord,
              revolving_fund_id: revolving_fund_id || disbursement.revolving_fund_id,
            })
          }
        }

        if (is_reimbursement) {
          const reimburseAmt = parseFloat(reimbursement_amount) || 0
          if (reimburseAmt > 0) {
            await cashDisbursementApi.reimburse({
              revolving_fund_id: revolving_fund_id || disbursement.revolving_fund_id,
              received_by: disbursement.received_by,
              department_id: disbursement.department_id,
              purpose: disbursement.purpose,
              amount_reimburse: reimburseAmt,
              cash_voucher: disbursement.cash_voucher,
            })
          }
        }

        await fetchDisbursements()
        invalidateRevolvingFunds()
        return { success: true }
      } catch (err) {
        console.error('Submit liquidation failed:', err)
        await fetchDisbursements()
        invalidateRevolvingFunds()
        const message = err.response?.data?.message || 'Something went wrong. Please try again.'
        return { success: false, message }
      } finally {
        setIsMutating(false)
      }
    },
    [fetchDisbursements, invalidateRevolvingFunds],
  )

  return {
    disbursements,
    isLoading,
    isMutating,
    error,
    fetchDisbursements,
    issue,
    returnCash,
    recordExpended,
    reimburse,
    updateMetadata,
    editAmount,
    saveDisbursement,
    submitLiquidation,
  }
}

export default useCashDisbursements
