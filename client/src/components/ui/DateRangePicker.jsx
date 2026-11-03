import { useState, useRef, useEffect, useCallback } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  toDateStr,
  parseDateStr,
  todayStr,
  daysAgoStr,
  formatRangeLabel,
} from '../../utils/dateRange'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1)

const PRESETS = [
  { label: 'Today', get: () => ({ from: todayStr(), to: todayStr() }) },
  { label: 'Yesterday', get: () => ({ from: daysAgoStr(1), to: daysAgoStr(1) }) },
  { label: 'Last 7 days', get: () => ({ from: daysAgoStr(6), to: todayStr() }) },
  { label: 'Last 30 days', get: () => ({ from: daysAgoStr(29), to: todayStr() }) },
  {
    label: 'This month',
    get: () => {
      const n = new Date()
      return { from: toDateStr(new Date(n.getFullYear(), n.getMonth(), 1)), to: todayStr() }
    },
  },
]

/** One month grid. Arrows are rendered only on the outer edges (see `showPrev` / `showNext`). */
function MonthGrid({
  month,
  rangeStart,
  rangeEnd,
  maxDate,
  onPick,
  onHover,
  showPrev,
  showNext,
  onPrev,
  onNext,
  nextDisabled,
}) {
  const year = month.getFullYear()
  const m = month.getMonth()
  const firstWeekday = new Date(year, m, 1).getDay()
  const daysInMonth = new Date(year, m + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateStr(new Date(year, m, d)))

  const title = month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  return (
    <div className="w-62">
      <div className="flex items-center justify-between h-7 mb-1">
        {showPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
            aria-label="Previous months"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-6" />
        )}
        <span className="text-xs font-bold text-slate-800">{title}</span>
        {showNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Next months"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-6" />
        )}
      </div>

      <div className="grid grid-cols-7 text-center mb-0.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] font-semibold text-slate-400 py-1">
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <span key={`b-${idx}`} className="h-8" />

          const disabled = day > maxDate
          const isStart = day === rangeStart
          const isEnd = day === rangeEnd
          const inRange = rangeStart && rangeEnd && day > rangeStart && day < rangeEnd
          const isToday = day === maxDate

          let cls = 'text-slate-700 hover:bg-slate-100'
          if (disabled) cls = 'text-slate-300 cursor-not-allowed'
          else if (isStart || isEnd) cls = 'bg-[#E31837] text-white font-bold'
          else if (inRange) cls = 'bg-red-50 text-slate-800 rounded-none'

          return (
            <div
              key={day}
              className={`h-8 flex items-center justify-center ${
                inRange || (isStart && rangeEnd && rangeEnd !== rangeStart) || isEnd
                  ? 'bg-red-50'
                  : ''
              } ${isStart && rangeEnd && rangeEnd !== rangeStart ? 'rounded-l-full' : ''} ${
                isEnd && rangeStart !== rangeEnd ? 'rounded-r-full' : ''
              }`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(day)}
                onMouseEnter={() => !disabled && onHover(day)}
                className={`w-8 h-8 text-xs rounded-full transition-colors cursor-pointer ${cls} ${
                  isToday && !isStart && !isEnd ? 'ring-1 ring-slate-300' : ''
                }`}
              >
                {Number(day.slice(8))}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Date range filter with a two-month calendar. The left calendar shows one
 * month and the right shows the next (e.g. January | February); the arrows
 * move BOTH forward/back by two months (January | February → March | April).
 *
 * value:    { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * onChange: ({ from, to }) => void   — called once a full range is chosen.
 *
 * Future dates are disabled (nothing can exist there yet).
 */
export default function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [leftMonth, setLeftMonth] = useState(() => startOfMonth(new Date()))
  const [pendingStart, setPendingStart] = useState(null)
  const [hoverDay, setHoverDay] = useState(null)
  const rootRef = useRef(null)

  const maxDate = todayStr()
  const currentMonthStart = startOfMonth(new Date())

  // Opening: show the month BEFORE the selected end on the left so the
  // selected end month sits on the right (today -> previous month | this month).
  const openPicker = useCallback(() => {
    const anchor = value?.to ? parseDateStr(value.to) : new Date()
    setLeftMonth(addMonths(startOfMonth(anchor), -1))
    setPendingStart(null)
    setHoverDay(null)
    setOpen(true)
  }, [value?.to])

  const closePicker = useCallback(() => {
    setOpen(false)
    setPendingStart(null)
    setHoverDay(null)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closePicker()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') closePicker()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closePicker])

  const applyRange = (range) => {
    onChange?.(range)
    closePicker()
  }

  const handlePick = (day) => {
    if (!pendingStart) {
      setPendingStart(day)
      setHoverDay(day)
      return
    }
    const [from, to] = pendingStart <= day ? [pendingStart, day] : [day, pendingStart]
    applyRange({ from, to })
  }

  // While picking, preview the range between the first click and the hovered day.
  let rangeStart = value?.from
  let rangeEnd = value?.to
  if (pendingStart) {
    const h = hoverDay || pendingStart
    rangeStart = pendingStart <= h ? pendingStart : h
    rangeEnd = pendingStart <= h ? h : pendingStart
  }

  const rightMonth = addMonths(leftMonth, 1)
  const nextLeft = addMonths(leftMonth, 2)
  const nextDisabled = nextLeft > currentMonthStart

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => (open ? closePicker() : openPicker())}
        className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-white px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 cursor-pointer transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-bold text-slate-800">{formatRangeLabel(value || {})}</span>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex flex-col md:flex-row gap-3 max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex md:flex-col gap-1 md:w-28 md:border-r md:border-slate-100 md:pr-3 overflow-x-auto">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyRange(p.get())}
                className="text-left whitespace-nowrap text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-2 py-1.5 rounded-md cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div
            className="flex flex-col sm:flex-row gap-4"
            onMouseLeave={() => pendingStart && setHoverDay(pendingStart)}
          >
            <MonthGrid
              month={leftMonth}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              maxDate={maxDate}
              onPick={handlePick}
              onHover={setHoverDay}
              showPrev
              onPrev={() => setLeftMonth((m) => addMonths(m, -2))}
            />
            <MonthGrid
              month={rightMonth}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              maxDate={maxDate}
              onPick={handlePick}
              onHover={setHoverDay}
              showNext
              onNext={() => setLeftMonth((m) => addMonths(m, 2))}
              nextDisabled={nextDisabled}
            />
          </div>

          {pendingStart && (
            <p className="md:hidden text-[11px] text-slate-500">Select the end date.</p>
          )}
        </div>
      )}
    </div>
  )
}
