import { apiClient } from './axios'
import { withDateParams } from './dateParams'

/**
 * Thin wrapper around /cash-request, mirroring cashDisbursementApi.js's
 * conventions exactly (same apiClient import, same getAll/action shape).
 * Endpoints match cash-request.routes.js 1:1:
 *   GET  /cash-request
 *   GET  /cash-request/activity
 *   POST /cash-request
 *   PUT  /cash-request/update
 *   PUT  /cash-request/approve
 *   PUT  /cash-request/reject
 *   PUT  /cash-request/complete
 *
 * `update` requires the backend's PUT /cash-request/update route
 * (updateCashRequest controller) — added specifically so a Requester can
 * edit + resubmit a PENDING or REJECTED request. It does NOT exist for
 * APPROVED/COMPLETED requests; the backend enforces that, this is just
 * the transport.
 */
export const cashRequestApi = {
  // Get cash requests (optionally filtered by status / employee_id — see
  // getCashRequest in cash-request.controller.js). dateFrom/dateTo are
  // converted to the backend's date_from/date_to.
  getAll: async (params = {}) => {
    const response = await apiClient.get('/cash-request', { params: withDateParams(params) })
    return response.data || []
  },

  // Requester creates a Cash Request -> PENDING. No Revolving Fund is
  // selected here — it's assigned later by the Fund Custodian at
  // completion time (see completeCashRequest).
  create: async (payload) => {
    const response = await apiClient.post('/cash-request', payload)
    return response.data
  },

  // Requester edits their own PENDING or REJECTED request. Backend
  // resets status to PENDING on save (resubmission re-enters the Team
  // Lead queue). Never sends revolving_fund_id — that field is owned by
  // the Fund Custodian's completion step, not by an edit.
  update: async (payload) => {
    const response = await apiClient.put('/cash-request/update', payload)
    return response.data
  },

  // Team Lead approves a PENDING request -> APPROVED (now pending Fund
  // Custodian). No financial effect, no Revolving Fund involved.
  approve: async (payload) => {
    const response = await apiClient.put('/cash-request/approve', payload)
    return response.data
  },

  // Team Lead (while PENDING) or Fund Custodian (while APPROVED) rejects
  // a request -> REJECTED. `remarks` is required by the backend and gets
  // tagged with which stage rejected it.
  reject: async (payload) => {
    const response = await apiClient.put('/cash-request/reject', payload)
    return response.data
  },

  // Fund Custodian completes an APPROVED request -> COMPLETED. THIS is
  // the only action that creates a Cash Disbursement and moves the
  // target Revolving Fund's balance/status — see completeCashRequest.
  // Requires `revolving_fund_id` (selected by the Fund Custodian in this
  // same step, not at creation). `remarks` is optional. Purpose is
  // copied server-side from the original request — never send it here.
  complete: async (payload) => {
    const response = await apiClient.put('/cash-request/complete', payload)
    return response.data
  },

  // Cash Request activity/audit log, optionally filtered by
  // cash_request_id. Used to surface rejection remarks (and which stage
  // rejected) back to the Requester.
  getActivity: async (params = {}) => {
    const response = await apiClient.get('/cash-request/activity', { params })
    return response.data || []
  },

  // Wallet balance: cash on hand from completed, unliquidated requests.
  getWallet: async (employeeId) => {
    const response = await apiClient.get('/cash-request/wallet', {
      params: { employee_id: employeeId },
    })
    return response.data
  },
}

export default cashRequestApi
