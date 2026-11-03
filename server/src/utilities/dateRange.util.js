/**
 * Shared "daily view" helpers for the list/read endpoints.
 *
 * Behaviour: by default a list endpoint only returns TODAY's records, so
 * each day starts as a fresh set. Callers can look back by passing
 * `date_from` and/or `date_to` (YYYY-MM-DD, inclusive).
 *
 *   - no dates                -> today only
 *   - date_from only          -> date_from .. today
 *   - date_to only            -> that single day
 *   - both                    -> date_from .. date_to
 *
 * Place at: <controllers>/../utilities/dateRange.util.js (adjust the
 * require path in each controller to match).
 */

const formatDate = (date = new Date()) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const isValidDateStr = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(`${s}T00:00:00`))

/**
 * @param {object} query - req.query
 * @param {object} opts
 * @param {boolean} opts.defaultToToday - when no dates are given, scope to
 *   today (true) or return everything (false). Use false when the caller
 *   already narrowed by a parent id (e.g. revolving_fund_id), so detail
 *   views never disappear at midnight.
 * @returns {{ from: string|null, to: string|null, error?: string }}
 */
const resolveDateRange = (query = {}, { defaultToToday = true } = {}) => {
  const { date_from, date_to } = query
  const today = formatDate()

  if (date_from && !isValidDateStr(date_from)) {
    return { from: null, to: null, error: 'date_from must be in YYYY-MM-DD format' }
  }
  if (date_to && !isValidDateStr(date_to)) {
    return { from: null, to: null, error: 'date_to must be in YYYY-MM-DD format' }
  }

  if (!date_from && !date_to) {
    return defaultToToday ? { from: today, to: today } : { from: null, to: null }
  }

  const to = date_to || today
  const from = date_from || to
  if (from > to) {
    return { from: null, to: null, error: 'date_from cannot be later than date_to' }
  }
  return { from, to }
}

/** For raw-SQL endpoints: pushes `DATE(col) BETWEEN ? AND ?` onto the arrays. */
const addDateCondition = (column, range, conditions, params) => {
  if (!range.from || !range.to) return
  conditions.push(`DATE(${column}) BETWEEN ? AND ?`)
  params.push(range.from, range.to)
}

/** For query-builder endpoints: filters already-fetched rows by a date field. */
const filterRowsByDate = (rows, field, range) => {
  if (!range.from || !range.to) return rows
  return rows.filter((row) => {
    const raw = row[field]
    if (!raw) return false
    const d = raw instanceof Date ? raw : new Date(raw)
    if (isNaN(d)) return false
    const day = formatDate(d)
    return day >= range.from && day <= range.to
  })
}

module.exports = { formatDate, resolveDateRange, addDateCondition, filterRowsByDate }
