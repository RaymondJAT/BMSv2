import { apiClient } from './axios'
import { withDateParams } from './dateParams'

export const revolvingFundApi = {
  // dateFrom/dateTo are converted to the backend's date_from/date_to.
  getAll: async (params = {}) => {
    const response = await apiClient.get('/revolving-fund', { params: withDateParams(params) })
    return response.data || []
  },
  getActivity: async (revolvingFundId) => {
    const response = await apiClient.get('/revolving-fund/activity', {
      params: { revolving_fund_id: revolvingFundId },
    })
    return response.data || []
  },
  save: async (payload) => {
    const response = await apiClient.post('/revolving-fund', payload)
    return response.data
  },
  saveActivity: async (payload) => {
    const response = await apiClient.post('/revolving-fund/activity', payload)
    return response.data
  },
  getClosed: async (params = {}) => {
    const response = await apiClient.get('/revolving-fund/closed', { params })
    return response.data || []
  },
  saveClosed: async (payload) => {
    const response = await apiClient.post('/revolving-fund/closed', payload)
    return response.data
  },
}

export default revolvingFundApi
