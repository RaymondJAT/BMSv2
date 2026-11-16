import { apiClient } from './axios'

// The sync walks every Slink page on the server, so give it more room than
// the default request.
const SYNC_TIMEOUT_MS = 5 * 60 * 1000

export const masterDistrictApi = {
  getAll: async () => {
    const response = await apiClient.get('/master-district')
    return response.data || []
  },

  upsert: async ({ id, store_number, store_name, region, city_province, status }) => {
    const params = new URLSearchParams()
    if (id) params.append('id', id)
    if (store_number !== undefined) params.append('store_number', store_number)
    if (store_name !== undefined) params.append('store_name', store_name)
    if (region !== undefined) params.append('region', region)
    if (city_province !== undefined) params.append('city_province', city_province)
    if (status !== undefined) params.append('status', status)

    const response = await apiClient.post('/master-district', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  importCSV: async (items) => {
    const response = await apiClient.post('/master-district/import', items, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return response.data
  },

  // Aligns our stores with Slink's (paginated on the server).
  //   dryRun        -> preview only, nothing is saved
  //   insertMissing -> also add Slink stores that are not in our list
  // The route here must match the one you register for syncMasterDistrictFromSlink.
  syncFromSlink: async ({ dryRun = false } = {}) => {
    const response = await apiClient.post(
      '/master-district/sync-slink',
      { dry_run: dryRun },
      { timeout: SYNC_TIMEOUT_MS },
    )
    return response.data
  },
}

export default masterDistrictApi
