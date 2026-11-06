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

/**
 * Asks Slink whether the employee holds an open ticket. The answer decides
 * the request type: open ticket -> TRAVEL EXPENSES, otherwise BUDGET.
 *
 * Positions that don't use tickets (ticketRequired = false) never call Slink
 * and are always NONE. If Slink can't be reached the status stays UNKNOWN
 * (we don't guess a type); call refresh() to retry.
 */
export function useSlinkTicketStatus({ employeeId, ticketRequired, enabled = true }) {
  const [fetchedStatus, setFetchedStatus] = useState(TICKET_STATUS.UNKNOWN)
  const requestSeq = useRef(0)

  const refresh = useCallback(async () => {
    if (!enabled || !ticketRequired || !employeeId) return
    const seq = ++requestSeq.current
    try {
      const result = await slinkApi.getRequestBudget(employeeId)
      if (seq !== requestSeq.current) return // a newer check superseded this one
      setFetchedStatus(result?.data?.hasTicket ? TICKET_STATUS.HAS : TICKET_STATUS.NONE)
    } catch (err) {
      console.error('[useSlinkTicketStatus] check failed:', err)
      if (seq === requestSeq.current) setFetchedStatus(TICKET_STATUS.UNKNOWN)
    }
  }, [employeeId, ticketRequired, enabled])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Derived, so a position that loads late (or doesn't use tickets) is NONE
  // without waiting on a network call.
  const ticketStatus = !ticketRequired ? TICKET_STATUS.NONE : fetchedStatus
  const requestType = ticketStatus === TICKET_STATUS.HAS ? 'TRAVEL EXPENSES' : 'BUDGET'

  return { ticketStatus, requestType, refresh }
}

export default useSlinkTicketStatus
