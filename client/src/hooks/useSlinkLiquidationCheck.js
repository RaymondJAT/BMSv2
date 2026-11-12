import { useState, useCallback } from 'react'
import { slinkApi } from '../api/slinkApi'
import {
  buildLiquidationRows,
  shouldUseTickets,
  toLocalDateString,
  toLocalDateStringFromApi,
} from '../utils/liquidationTickets'

const LOG_TAG = '[Slink liquidation check]'
const ALLOWED_STATUS = 'allowed'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

/** Result shape returned by checkLiquidation. Defaults describe a blocked check. */
const buildResult = ({ allowed = false, rows = [], status = null, error = null } = {}) => ({
  allowed,
  rows,
  status,
  error,
})

/** Only TRAVEL EXPENSES requests from ticket-required positions call Slink. */
const usesSlinkTickets = (request, positionName) =>
  Boolean(request?.request_type) &&
  shouldUseTickets(request.request_type, request.purpose, positionName)

/**
 * Date range sent to Slink, same as V1: from the cash request's own
 * request_date (falling back to the 1st of this month) up to TODAY in
 * local time.
 */
const getSlinkDateRange = (request) => {
  const now = new Date()
  const dateFrom =
    toLocalDateStringFromApi(request?.request_date) ??
    toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))
  const dateTo = toLocalDateString(now)
  return { dateFrom, dateTo }
}

const summarizeTickets = (tickets) =>
  tickets.map((ticket) => ({
    id: ticket.ticket_id,
    status: ticket.status,
    action_date: ticket.action_date,
    parent: ticket.parent_ticket_id,
  }))

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/**
 * Pre-liquidation check against Slink. Only TRAVEL EXPENSES requests from
 * ticket-required positions call Slink; BUDGET, Rotation/Pick-up and everyone
 * else are always allowed with a blank form.
 *
 * checkLiquidation(request) -> { allowed, rows, status, error }. Never throws.
 *   status - Slink's raw liquidation_status (null when Slink wasn't called)
 */
export function useSlinkLiquidationCheck({ employeeId, positionName }) {
  const [isChecking, setIsChecking] = useState(false)

  const checkLiquidation = useCallback(
    async (request) => {
      if (!usesSlinkTickets(request, positionName)) {
        console.log(`${LOG_TAG} SKIPPED (always allowed)`, {
          requestType: request?.request_type,
          purpose: request?.purpose,
          positionName,
        })
        return buildResult({ allowed: true })
      }

      if (!employeeId) {
        console.warn(`${LOG_TAG} FAILED: no Slink employee id (employee_code) on the user`)
        return buildResult({ error: 'No Slink employee id' })
      }

      setIsChecking(true)
      try {
        const { dateFrom, dateTo } = getSlinkDateRange(request)
        if (dateFrom > dateTo) {
          console.warn(`${LOG_TAG} date_from is AFTER date_to. Slink may return nothing.`)
        }

        const result = await slinkApi.getLiquidationTickets(employeeId, { dateFrom, dateTo })
        const tickets = result?.data?.tickets ?? []
        const status = result?.data?.liquidation_status ?? null
        const allowed = normalizeStatus(status) === ALLOWED_STATUS

        console.log(`${LOG_TAG} ${allowed ? 'ALLOWED' : 'NOT ALLOWED'}`, {
          employeeId,
          dateFrom,
          dateTo,
          status,
          tickets: summarizeTickets(tickets),
        })

        return buildResult({ allowed, rows: buildLiquidationRows(tickets), status })
      } catch (err) {
        console.error(`${LOG_TAG} FAILED`, { employeeId, message: err.message })
        return buildResult({ error: err.message || 'Slink check failed' })
      } finally {
        setIsChecking(false)
      }
    },
    [employeeId, positionName],
  )

  return { checkLiquidation, isChecking }
}

export default useSlinkLiquidationCheck
