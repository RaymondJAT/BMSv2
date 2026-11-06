import { useState, useCallback } from 'react'
import { slinkApi } from '../api/slinkApi'
import {
  buildLiquidationRows,
  shouldUseTickets,
  toLocalDateString,
  toLocalDateStringFromApi,
} from '../utils/liquidationTickets'
import { todayStr } from '../utils/dateRange'

/**
 * Pre-liquidation check against Slink. Only TRAVEL EXPENSES requests from
 * ticket-required positions call Slink; BUDGET, Rotation/Pick-up and everyone
 * else are always allowed with a blank form.
 *
 * checkLiquidation(request) -> { allowed, rows, error }. Never throws.
 */
export function useSlinkLiquidationCheck({ employeeId, positionName }) {
  const [isChecking, setIsChecking] = useState(false)

  const checkLiquidation = useCallback(
    async (request) => {
      // v2 rows always carry request_type; no legacy "missing = travel" fallback.
      const usesTickets =
        Boolean(request?.request_type) &&
        shouldUseTickets(request.request_type, request.purpose, positionName)

      if (!usesTickets) return { allowed: true, rows: [], error: null }

      setIsChecking(true)
      try {
        const now = new Date()
        const dateFrom =
          toLocalDateStringFromApi(request?.request_date) ??
          toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))
        const dateTo = todayStr()

        const result = await slinkApi.getLiquidationTickets(employeeId, { dateFrom, dateTo })
        const tickets = result?.data?.tickets ?? []
        const allowed =
          String(result?.data?.liquidation_status || '')
            .trim()
            .toLowerCase() === 'allowed'

        return { allowed, rows: buildLiquidationRows(tickets), error: null }
      } catch (err) {
        console.error('[useSlinkLiquidationCheck] check failed:', err)
        return { allowed: false, rows: [], error: err.message || 'Slink check failed' }
      } finally {
        setIsChecking(false)
      }
    },
    [employeeId, positionName],
  )

  return { checkLiquidation, isChecking }
}

export default useSlinkLiquidationCheck
