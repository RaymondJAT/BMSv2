import { useState, useCallback, useEffect } from 'react'
import { masterDistrictApi } from '../api/masterDistrictApi'

export function useDistricts() {
  const [districts, setDistricts] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [error, setError] = useState(null)

  const fetchDistricts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await masterDistrictApi.getAll()
      setDistricts(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error loading districts')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDistricts()
  }, [fetchDistricts])

  const updateStatus = useCallback(
    async ({ id, status }) => {
      setIsSubmitting(true)
      try {
        const data = await masterDistrictApi.upsert({ id, status })
        await fetchDistricts()
        return { success: true, message: data?.message || 'Updated successfully' }
      } catch (err) {
        return {
          success: false,
          message: err.response?.data?.message || err.message || 'Failed to update status',
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [fetchDistricts],
  )

  const importDistricts = useCallback(
    async (items) => {
      setIsSubmitting(true)
      try {
        const data = await masterDistrictApi.importCSV(items)
        await fetchDistricts()
        return { success: true, count: data?.count || items.length }
      } catch (err) {
        const message = err.response?.data?.message || err.message || 'Network error during import'
        return {
          success: false,
          message,
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [fetchDistricts],
  )

  /**
   * Aligns our stores with Slink's and keeps the server's summary in
   * `syncResult` so the page can show what happened.
   *   dryRun        -> preview only, nothing is saved (the list is not reloaded)
   *   insertMissing -> also add Slink stores that are not in our list
   * After a real sync the list is reloaded on success AND on failure,
   * because pages saved before a failure are kept by the server.
   */
  const syncFromSlink = useCallback(
    async ({ dryRun = false } = {}) => {
      setIsSyncing(true)
      setSyncResult(null)
      try {
        const data = await masterDistrictApi.syncFromSlink({ dryRun })
        const result = { success: true, ...data }
        setSyncResult(result)
        if (!dryRun) await fetchDistricts()
        return result
      } catch (err) {
        const body = err.response?.data || {}
        const result = {
          success: false,
          dry_run: dryRun,
          ...body,
          message: body.message || err.message || 'Failed to sync districts from Slink',
        }
        setSyncResult(result)
        if (!dryRun) await fetchDistricts()
        return result
      } finally {
        setIsSyncing(false)
      }
    },
    [fetchDistricts],
  )

  const clearSyncResult = useCallback(() => setSyncResult(null), [])

  return {
    districts,
    isLoading,
    isSubmitting,
    isSyncing,
    syncResult,
    error,
    refetch: fetchDistricts,
    updateStatus,
    importDistricts,
    syncFromSlink,
    clearSyncResult,
  }
}
