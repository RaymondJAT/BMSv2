import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { liquidationApi } from '../api/liquidationApi'

export function useLiquidations({ role, dateFrom, dateTo } = {}) {
  const [liquidations, setLiquidations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isMutating, setIsMutating] = useState(false)
  const queryClient = useQueryClient()

  const fetchLiquidations = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await liquidationApi.getAll({ dateFrom, dateTo })
      setLiquidations(data || [])
    } catch (err) {
      console.error('Failed to fetch liquidations:', err)
      setError(err.response?.data?.message || 'Failed to load liquidations.')
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchLiquidations()
  }, [fetchLiquidations])

  const invalidateFinancialCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['revolvingFunds'] })
    queryClient.invalidateQueries({ queryKey: ['budgets'] })
    queryClient.invalidateQueries({ queryKey: ['cashDisbursements'] })
  }, [queryClient])

  const runMutation = useCallback(
    async (fn, payload, { invalidateFinancial = false } = {}) => {
      setIsMutating(true)
      try {
        const result = await fn(payload)
        await fetchLiquidations()
        if (invalidateFinancial) invalidateFinancialCaches()
        return { success: true, data: result }
      } catch (err) {
        console.error('Liquidation mutation failed:', err)
        return {
          success: false,
          message: err.response?.data?.message || 'Something went wrong. Please try again.',
        }
      } finally {
        setIsMutating(false)
      }
    },
    [fetchLiquidations, invalidateFinancialCaches],
  )

  const createLiquidation = useCallback(
    (payload) => runMutation(liquidationApi.create, payload),
    [runMutation],
  )
  const editLiquidation = useCallback(
    (id, payload = {}) => runMutation(liquidationApi.update, { id, ...payload }),
    [runMutation],
  )
  const approveLiquidation = useCallback(
    (id, payload = {}) => runMutation(liquidationApi.approve, { id, ...payload }),
    [runMutation],
  )
  const rejectLiquidation = useCallback(
    (id, payload = {}) => runMutation(liquidationApi.reject, { id, ...payload }),
    [runMutation],
  )
  const verifyLiquidation = useCallback(
    (id, payload = {}) =>
      runMutation(liquidationApi.verify, { id, ...payload }, { invalidateFinancial: true }),
    [runMutation],
  )
  const completeLiquidation = useCallback(
    (id, payload = {}) =>
      runMutation(liquidationApi.complete, { id, ...payload }, { invalidateFinancial: true }),
    [runMutation],
  )
  const markIncomplete = useCallback(
    (id, payload = {}) => runMutation(liquidationApi.markIncomplete, { id, ...payload }),
    [runMutation],
  )

  void role

  const metrics = useMemo(
    () =>
      liquidations.reduce(
        (acc, lq) => {
          const status = String(lq.status || '').toUpperCase()
          if (status === 'PENDING') acc.pendingCount += 1
          if (status === 'APPROVED') acc.approvedCount += 1
          if (status === 'VERIFIED') acc.verifiedCount += 1
          if (status === 'COMPLETED') acc.completedCount += 1
          if (status === 'INCOMPLETE') acc.incompleteCount += 1
          return acc
        },
        {
          pendingCount: 0,
          approvedCount: 0,
          verifiedCount: 0,
          completedCount: 0,
          incompleteCount: 0,
        },
      ),
    [liquidations],
  )

  return {
    liquidations,
    metrics,
    isLoading,
    isMutating,
    error,
    fetchLiquidations,
    createLiquidation,
    editLiquidation,
    approveLiquidation,
    rejectLiquidation,
    verifyLiquidation,
    completeLiquidation,
    markIncomplete,
  }
}

export default useLiquidations
