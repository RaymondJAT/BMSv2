import { Search, Filter } from 'lucide-react'
import DateRangePicker from './DateRangePicker'

export default function TableToolbar({
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  dateRange,
  onDateRangeChange,
  children,
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white py-2 px-3 rounded-xl border border-slate-200/80 shrink-0">
      <div className="relative w-full sm:w-72">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent transition-all"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 self-end sm:self-auto">
        {onDateRangeChange && <DateRangePicker value={dateRange} onChange={onDateRangeChange} />}

        {filters.map((f) => (
          <div
            key={f.key || f.label}
            className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600"
          >
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>{f.label}:</span>
            <select
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {children}
      </div>
    </div>
  )
}
