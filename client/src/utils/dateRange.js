// Shared date helpers for the date-range filter. All dates are plain
// 'YYYY-MM-DD' strings in LOCAL time (same shape the API's date_from /
// date_to params expect), never UTC ISO strings — avoids off-by-one-day
// bugs around midnight.

const pad = (n) => String(n).padStart(2, '0')

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseDateStr = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayStr = () => toDateStr(new Date())

export const getTodayRange = () => {
  const t = todayStr()
  return { from: t, to: t }
}

// Wide range for lookup lists (e.g. funds used to resolve display names),
// which must not be limited to "today" like the paged list views are.
export const getAllTimeRange = () => ({ from: '2000-01-01', to: todayStr() })

export const daysAgoStr = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateStr(d)
}

const fmt = (s) =>
  parseDateStr(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

export const formatRangeLabel = ({ from, to }) => {
  if (!from || !to) return 'Select dates'
  if (from === to) return from === todayStr() ? 'Today' : fmt(from)
  return `${fmt(from)} – ${fmt(to)}`
}
