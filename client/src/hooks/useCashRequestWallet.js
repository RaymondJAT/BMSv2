import { useState, useEffect, useCallback } from 'react'
import { cashRequestApi } from '../api/cashRequestApi'

/**
 * The requester's wallet balance. Refetches on mount, whenever `refreshKey`
 * changes (the page passes a key built from the requests' statuses), and
 * when the tab regains focus. The balance changes when ANOTHER user (the
 * Fund Custodian) completes or verifies, so focus covers the gap.
 */
export function useCashRequestWallet(employeeId, refreshKey = '') {
  const [wallet, setWallet] = useState({ balance: 0, previousBalance: 0 })
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!employeeId) return
    setIsLoading(true)
    try {
      const data = await cashRequestApi.getWallet(employeeId)
      setWallet({
        balance: Number(data?.balance) || 0,
        previousBalance: Number(data?.previous_balance) || 0,
      })
    } catch (err) {
      console.error('Failed to load wallet:', err)
    } finally {
      setIsLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  return { wallet, isLoading, refresh }
}

export default useCashRequestWallet
