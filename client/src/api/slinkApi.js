// Slink API (/bms). No Authorization header on purpose: Slink uses a static
// system API key that the Vite dev/preview proxy injects server-side (see
// vite.config.js). The user's JWT must never be sent to Slink, and the system
// key must never be read into client code. Do NOT route these through
// apiClient — its interceptor may attach the user's token.
const HEADERS = { 'Content-Type': 'application/json' }

const get = async (url) => {
  const res = await fetch(url, { headers: HEADERS })
  const text = await res.text()
  if (!res.ok) throw new Error(`Slink ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Slink response was not JSON')
  }
}

export const slinkApi = {
  // Does the employee hold an open ticket? -> { data: { hasTicket } }
  getRequestBudget: (employeeId) => get(`/bms/request-budget/${employeeId}`),

  // Tickets from dateFrom..dateTo plus Slink's liquidation_status
  // -> { data: { tickets, liquidation_status } }
  getLiquidationTickets: (employeeId, { dateFrom, dateTo }) => {
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    return get(`/bms/request-liquidation/${employeeId}?${params.toString()}`)
  },
}

export default slinkApi
