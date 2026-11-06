/**
 * Helpers for the ticket-based liquidation flow:
 *   - who needs tickets (by position)
 *   - cash request types (TRAVEL EXPENSES / BUDGET)
 *   - turning Slink tickets into liquidation table rows
 */

const ROTATION_PICKUP = 'Rotation/Pick-up'

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()

/* ------------------------------------------------------------------ */
/* Who needs tickets                                                   */
/* ------------------------------------------------------------------ */

// Must match the saved position_name exactly (case is ignored).
const TICKET_REQUIRED_POSITIONS = [
  'IT FIELD ASSOCIATE',
  'IT FIELD ENGINEER',
  'IT SUPPORT',
  'IT FIELD SUPPORT',
  'INSTALLER',
  'ELECTRICIAN',
]

// CHANGED: position is passed in (v2 reads it from the auth user, not localStorage).
export const isTicketRequiredPosition = (positionName) =>
  TICKET_REQUIRED_POSITIONS.includes(normalizeText(positionName))

/* ------------------------------------------------------------------ */
/* Request types                                                       */
/* ------------------------------------------------------------------ */

export const REQUEST_TYPES = Object.freeze({
  TRAVEL_EXPENSES: 'TRAVEL EXPENSES',
  BUDGET: 'BUDGET',
})

export const isRotationPickup = (description) =>
  normalizeText(description) === normalizeText(ROTATION_PICKUP)

// A missing type is treated as TRAVEL EXPENSES (legacy, ticket-based rows).
export const normalizeRequestType = (value) => normalizeText(value) || REQUEST_TYPES.TRAVEL_EXPENSES

export const resolveStoredRequestType = (value, description) =>
  isRotationPickup(description) ? REQUEST_TYPES.TRAVEL_EXPENSES : normalizeRequestType(value)

export const isBudgetRequest = (requestType) =>
  normalizeRequestType(requestType) === REQUEST_TYPES.BUDGET

// CHANGED: takes positionName.
export const shouldUseTickets = (requestType, description, positionName) =>
  !isRotationPickup(description) &&
  isTicketRequiredPosition(positionName) &&
  normalizeRequestType(requestType) === REQUEST_TYPES.TRAVEL_EXPENSES

// CHANGED: takes positionName.
export const resolveRequestType = (hasTicket, description, positionName) =>
  isRotationPickup(description) || (isTicketRequiredPosition(positionName) && hasTicket)
    ? REQUEST_TYPES.TRAVEL_EXPENSES
    : REQUEST_TYPES.BUDGET

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export const toLocalDateString = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const toLocalDateStringFromApi = (value) => {
  if (!value) return null
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : toLocalDateString(parsed)
}

/* ------------------------------------------------------------------ */
/* Ticket -> table row                                                 */
/* ------------------------------------------------------------------ */

const LIQUIDATABLE_STATUS_PREFIXES = ['RESOLVED', 'PENDING']

const isLiquidatableStatus = (status) => {
  const normalized = normalizeText(status)
  return LIQUIDATABLE_STATUS_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

// "CC" copies point back to their SR ticket via parent_ticket_id; skip them.
const isLiquidationRowTicket = (ticket) =>
  isLiquidatableStatus(ticket.status) && !ticket.parent_ticket_id

const buildStoreName = (customer) => {
  const storeNo = customer?.store_no
  const storeName = customer?.store_name
  const hasStoreNo = storeNo != null && storeNo !== ''

  if (hasStoreNo && storeName) return `${storeNo} ${storeName}`
  if (storeName) return String(storeName)
  if (hasStoreNo) return String(storeNo)
  return ''
}

/**
 * Slink ticket -> row. v1 fields are unchanged; two fields are added for v2:
 *   store_value - plain store name, matching the v2 store option values
 *   purpose     - same text as `reason`
 */
const ticketToLiquidationRow = (ticket) => {
  const subject = (ticket.subject || '').replace(/\t+/g, ' ').trim()
  return {
    date: ticket.action_date ? String(ticket.action_date).split(/[ T]/)[0] : '',
    rt: ticket.ticket_id || '',
    store_name: buildStoreName(ticket.customer),
    store_value: ticket.customer?.store_name ? String(ticket.customer.store_name) : '', // ADDED
    particulars: '',
    reason: subject,
    purpose: subject, // ADDED
    from: '',
    to: '',
    mode_of_transportation: '',
    amount: '',
  }
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

const getTicketTime = (ticket) => {
  const time = new Date(String(ticket.action_date || '').replace(' ', 'T')).getTime()
  return Number.isNaN(time) ? Infinity : time
}

const compareOldestFirst = (a, b) =>
  getTicketTime(a) - getTicketTime(b) ||
  String(a.ticket_id || '').localeCompare(String(b.ticket_id || ''), undefined, {
    numeric: true,
  })

export const buildLiquidationRows = (tickets = []) =>
  tickets.filter(isLiquidationRowTicket).sort(compareOldestFirst).map(ticketToLiquidationRow)
