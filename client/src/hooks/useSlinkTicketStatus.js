import { useState, useEffect, useCallback, useRef } from 'react'
import { slinkApi } from '../api/slinkApi'

/**
 * UNKNOWN - still checking, or Slink could not be reached
 * HAS     - the employee holds an open ticket
 * NONE    - no open ticket (or this position doesn't use tickets at all)
 */
export const TICKET_STATUS = {
  UNKNOWN: 'unknown',
  HAS: 'has',
  NONE: 'none',
}

const LOG_TAG = '[Slink ticket check]'

/**
 * Asks Slink whether the employee holds an open ticket. The answer decides
 * the request type: open ticket -> TRAVEL EXPENSES, otherwise BUDGET.
 *
 * Positions that don't use tickets (ticketRequired = false) never call Slink
 * and are always NONE. If Slink can't be reached the status stays UNKNOWN
 * (we don't guess a type) and `error` says why; call refresh() to retry.
 *
 * Every outcome is logged so you can tell from the console whether Slink
 * is working: OK, FAILED, or SKIPPED (with the reason).
 */
export function useSlinkTicketStatus({ employeeId, ticketRequired, enabled = true }) {
  const [fetchedStatus, setFetchedStatus] = useState(TICKET_STATUS.UNKNOWN)
  const [error, setError] = useState(null)
  const requestSeq = useRef(0)

  const refresh = useCallback(async () => {
    if (!enabled || !ticketRequired) {
      // console.log(`${LOG_TAG} SKIPPED`, {
      //   reason: !enabled ? 'user role cannot create requests' : 'position does not use tickets',
      //   enabled,
      //   ticketRequired,
      // })
      return
    }

    if (!employeeId) {
      console.warn(`${LOG_TAG} SKIPPED: no Slink employee id (employee_code) on the user`)
      setError('No employee id on the logged-in user.')
      return
    }

    const seq = ++requestSeq.current
    try {
      const result = await slinkApi.getRequestBudget(employeeId)
      if (seq !== requestSeq.current) return 

      const hasTicket = Boolean(result?.data?.hasTicket)
      // console.log(`${LOG_TAG} OK`, {
      //   employeeId,
      //   hasTicket,
      //   requestType: hasTicket ? 'TRAVEL EXPENSES' : 'BUDGET',
      //   raw: result,
      // })

      setFetchedStatus(hasTicket ? TICKET_STATUS.HAS : TICKET_STATUS.NONE)
      setError(null)
    } catch (err) {
      console.error(`${LOG_TAG} FAILED`, { employeeId, message: err.message })
      if (seq !== requestSeq.current) return
      setFetchedStatus(TICKET_STATUS.UNKNOWN)
      setError(err.message || 'Slink check failed')
    }
  }, [employeeId, ticketRequired, enabled])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Derived, so a position that loads late (or doesn't use tickets) is NONE
  // without waiting on a network call.
  const ticketStatus = !ticketRequired ? TICKET_STATUS.NONE : fetchedStatus
  const requestType = ticketStatus === TICKET_STATUS.HAS ? 'TRAVEL EXPENSES' : 'BUDGET'

  return { ticketStatus, requestType, error, refresh }
}

export default useSlinkTicketStatus
