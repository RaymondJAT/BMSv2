import { apiClient } from './axios'
import { withDateParams } from './dateParams'

export const liquidationApi = {
  getAll: async (params = {}) =>
    (await apiClient.get('/liquidation', { params: withDateParams(params) })).data || [],
  getById: async (id) => (await apiClient.get(`/liquidation/${id}`)).data,
  create: async (payload) => (await apiClient.post('/liquidation', payload)).data,
  update: async (payload) => (await apiClient.put('/liquidation/update', payload)).data,
  approve: async (payload) => (await apiClient.put('/liquidation/approve', payload)).data,
  reject: async (payload) => (await apiClient.put('/liquidation/reject', payload)).data,
  verify: async (payload) => (await apiClient.put('/liquidation/verify', payload)).data,
  complete: async (payload) => (await apiClient.put('/liquidation/complete', payload)).data,
  markIncomplete: async (payload) => (await apiClient.put('/liquidation/incomplete', payload)).data,
  getActivity: async (params = {}) =>
    (await apiClient.get('/liquidation/activity', { params })).data || [],
}

// Accepts optional { search, limit, status } — see getMasterDistrict.
export const masterDistrictApi = {
  getAll: async (params = {}) => (await apiClient.get('/master-district', { params })).data || [],
}

// masterModeOfTransportationApi removed — it hit the wrong path
// ('/master-modeoftransportation', which doesn't exist). Use
// masterTransportationApi from api/masterTransportationApi.js instead,
// which hits the real route ('/master-mode-of-transportation').

export const cashRequestEligibilityApi = {
  check: async (employeeId) =>
    (await apiClient.get('/cash-request/eligibility', { params: { employee_id: employeeId } }))
      .data,
}

export default liquidationApi
