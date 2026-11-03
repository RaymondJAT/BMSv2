import { useState, useEffect } from 'react'
import { cashRequestEligibilityApi } from '../api/liquidationApi'

export function useCashRequestEligibility(employeeId, requests = []) {
  const [eligibility, setEligibility] = useState({ eligible: true, message: null })

  // Only re-check when something eligibility-relevant changes, not on every
  // new array identity.
  const requestsKey = requests
    .map((r) => `${r.id}:${r.status}:${r.disbursement_status}:${r.liquidation_status}`)
    .join('|')

  useEffect(() => {
    if (!employeeId) return
    let cancelled = false

    cashRequestEligibilityApi
      .check(employeeId)
      .then((result) => {
        if (!cancelled) setEligibility(result)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [employeeId, requestsKey])

  return eligibility
}

export default useCashRequestEligibility
