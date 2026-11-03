import { apiClient } from './axios'
import { withDateParams } from './dateParams'

export const cashDisbursementApi = {
  // Get cash disbursements. dateFrom/dateTo are converted to the
  // backend's date_from/date_to.
  getAll: async (params = {}) => {
    const response = await apiClient.get('/cash-disbursement', { params: withDateParams(params) })
    return response.data || []
  },

  // Create or Update a cash disbursement entry (metadata only — received_by,
  // department_id, particulars, cash_voucher. Amount is NOT editable through
  // this endpoint — use editAmount below.)
  save: async (payload) => {
    const response = await apiClient.post('/cash-disbursement', payload)
    return response.data
  },

  // Edit a disbursement's amount_issued. Backend recalculates only the
  // difference against the related revolving fund (and budget, if the
  // fund is connected to one) — never treats the new amount as a fresh
  // transaction.
  editAmount: async (payload) => {
    const response = await apiClient.post('/cash-disbursement/edit-amount', payload)
    return response.data
  },

  // Issue cash disbursement
  issue: async (payload) => {
    const response = await apiClient.post('/cash-disbursement/issue', payload)
    return response.data
  },

  // Record cash return for unused funds
  returnCash: async (payload) => {
    const response = await apiClient.post('/cash-disbursement/return', payload)
    return response.data
  },

  // Record expended expenses / liquidation details
  recordExpended: async (payload) => {
    const response = await apiClient.post('/cash-disbursement/expend', payload)
    return response.data
  },

  // Reimburse cash disbursement
  reimburse: async (payload) => {
    const response = await apiClient.post('/cash-disbursement/reimburse', payload)
    return response.data
  },

  // Get uploaded files
  getFiles: async (disbursementId) => {
    const response = await apiClient.get('/cash-disbursement/file', {
      params: { cash_disbursement_id: disbursementId },
    })
    return response.data || []
  },

  // Upload or attach files to a cash disbursement
  uploadFile: async (payload) => {
    const response = await apiClient.post('/cash-disbursement/file', payload)
    return response.data
  },

  // Get activity logs
  getActivity: async (disbursementId) => {
    const response = await apiClient.get('/cash-disbursement/activity', {
      params: { cash_disbursement_id: disbursementId },
    })
    return response.data || []
  },

  // Add or record a new activity log
  addActivity: async (payload) => {
    const response = await apiClient.post('/cash-disbursement/activity', payload)
    return response.data
  },
}

export default cashDisbursementApi
