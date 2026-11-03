import { useState, useEffect, useCallback } from 'react'
import { routeAccessApi } from '../api/routeAccessApi'

export function useRouteAccess() {
  const [routeAccess, setRouteAccess] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchRouteAccess = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await routeAccessApi.getAll()
      const data = response?.data || response
      setRouteAccess(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch route access:', err)
      setError(err.response?.data?.message || 'Failed to load route access records.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRouteAccess()
  }, [fetchRouteAccess])

  return {
    routeAccess,
    isLoading,
    error,
    refetch: fetchRouteAccess,
  }
}

export default useRouteAccess
