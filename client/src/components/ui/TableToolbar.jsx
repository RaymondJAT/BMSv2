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
  // Tab / Folder Props
  tabs = [],
  activeTab,
  onTabChange,
  data = [],
}) {
  return (
    <div className="bg-white px-3 pt-2 pb-2 sm:pb-0 rounded-xl border border-slate-200/85 shrink-0 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
        {/* Left Side: Modern Underline Tabs */}
        {tabs && tabs.length > 0 ? (
          <div
            role="tablist"
            className="flex items-center gap-5 border-b border-slate-200/80 sm:border-b-0 w-full sm:w-auto"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key
              const count =
                tab.count !== undefined ? tab.count : data.filter(tab.filter || (() => true)).length

              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => onTabChange && onTabChange(tab.key)}
                  className={`group relative flex items-center gap-2 pb-2.5 pt-1 text-xs font-semibold whitespace-nowrap transition-colors duration-200 cursor-pointer focus:outline-none ${
                    isActive ? 'text-[#E31837]' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>

                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums transition-colors duration-200 ${
                      isActive
                        ? 'bg-rose-50 text-[#E31837] ring-1 ring-inset ring-rose-200'
                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80 group-hover:text-slate-700'
                    }`}
                  >
                    {count}
                  </span>

                  {/* Bottom Active Tab Indicator Bar */}
                  <span
                    className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full transition-all duration-200 ease-out ${
                      isActive
                        ? 'bg-[#E31837] opacity-100 scale-x-100'
                        : 'bg-slate-300 opacity-0 scale-x-75 group-hover:opacity-60 group-hover:scale-x-100'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        ) : (
          <div />
        )}

        {/* Right Side: Search bar, DatePicker, and Filters */}
        <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:pb-2">
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
    </div>
  )
}
