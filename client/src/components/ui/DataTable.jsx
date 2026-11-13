import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Check, Minus, Loader2 } from 'lucide-react'

// Custom Header Checkbox rendering a red/maroon check or dash icon
const HeaderCheckbox = ({ checked, indeterminate, onChange }) => {
  const checkboxRef = useRef(null)

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = Boolean(indeterminate)
    }
  }, [indeterminate])

  return (
    <label className="relative inline-flex items-center justify-center cursor-pointer p-0.5">
      <input
        type="checkbox"
        ref={checkboxRef}
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <div className="w-4 h-4 rounded border border-slate-300 bg-white peer-checked:bg-rose-50 peer-checked:border-red-600 peer-focus:ring-2 peer-focus:ring-red-500/20 transition-all flex items-center justify-center shadow-2xs">
        {checked && <Check className="w-3 h-3 text-[#E31837] stroke-3" />}
        {!checked && indeterminate && <Minus className="w-3 h-3 text-[#E31837] stroke-3" />}
      </div>
    </label>
  )
}

// Custom Row Checkbox
const RowCheckbox = ({ checked, onChange }) => {
  return (
    <label
      className="relative inline-flex items-center justify-center cursor-pointer p-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
      <div className="w-4 h-4 rounded border border-slate-300 bg-white peer-checked:bg-rose-50 peer-checked:border-red-600 peer-focus:ring-2 peer-focus:ring-red-500/20 transition-all flex items-center justify-center shadow-2xs">
        {checked && <Check className="w-3 h-3 text-[#E31837] stroke-3" />}
      </div>
    </label>
  )
}

const DataTable = ({
  columns = [],
  data = [],
  keyExtractor = (row, index) => row.id || index,
  isLoading = false,
  emptyMessage = 'No data available.',
  onRowClick,
  footer,
  maxHeight,
  containerClassName = '',
  scrollbarClassName = 'custom-scrollbar',
  newestFirst = true,
  // Infinite Scroll Props
  initialDisplayCount = 11,
  pageSize = 11,
  // Selection Props
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  // Folder / Tab Filter Props
  tabs = [],
  activeTab,
  onTabChange,
}) => {
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [visibleCount, setVisibleCount] = useState(initialDisplayCount)

  const scrollContainerRef = useRef(null)

  // Reset pagination limit when sorting, tab switching, or underlying data changes
  useEffect(() => {
    setVisibleCount(initialDisplayCount)
  }, [data, sortColumn, sortDirection, activeTab, initialDisplayCount])

  // Filter dataset by active tab folder if tabs are provided
  const tabFilteredData = useMemo(() => {
    if (!tabs.length || activeTab === undefined) return data
    const currentTab = tabs.find((t) => t.key === activeTab)
    if (!currentTab || !currentTab.filter) return data
    return data.filter(currentTab.filter)
  }, [data, tabs, activeTab])

  const handleSort = (key) => {
    if (!key) return
    if (sortColumn === key) {
      if (sortDirection === 'asc') setSortDirection('desc')
      else {
        setSortColumn(null)
        setSortDirection('asc')
      }
    } else {
      setSortColumn(key)
      setSortDirection('asc')
    }
  }

  const sortedData = useMemo(() => {
    if (!sortColumn) {
      return newestFirst ? [...tabFilteredData].reverse() : tabFilteredData
    }

    return [...tabFilteredData].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]

      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1
    })
  }, [tabFilteredData, sortColumn, sortDirection, newestFirst])

  // Slice sorted dataset to only render up to visibleCount
  const displayedData = useMemo(() => {
    return sortedData.slice(0, visibleCount)
  }, [sortedData, visibleCount])

  const hasMore = visibleCount < sortedData.length

  // Scroll listener to detect when scroll reaches near bottom
  const handleScroll = useCallback(
    (e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
      if (scrollHeight - scrollTop <= clientHeight + 20) {
        if (hasMore) {
          setVisibleCount((prev) => Math.min(prev + pageSize, sortedData.length))
        }
      }
    },
    [hasMore, pageSize, sortedData.length],
  )

  // Selection Logic
  const isAllSelected =
    tabFilteredData.length > 0 &&
    tabFilteredData.every((row, idx) => selectedRows.includes(keyExtractor(row, idx)))

  const isSomeSelected =
    tabFilteredData.some((row, idx) => selectedRows.includes(keyExtractor(row, idx))) &&
    !isAllSelected

  const handleSelectAll = (e) => {
    if (!onSelectionChange) return
    if (e.target.checked) {
      const allKeys = tabFilteredData.map((row, idx) => keyExtractor(row, idx))
      onSelectionChange(allKeys, tabFilteredData)
    } else {
      onSelectionChange([], [])
    }
  }

  const handleSelectRow = (e, row, rowKey) => {
    e.stopPropagation()
    if (!onSelectionChange) return

    let nextSelected = []
    if (e.target.checked) {
      nextSelected = [...selectedRows, rowKey]
    } else {
      nextSelected = selectedRows.filter((id) => id !== rowKey)
    }

    const nextSelectedObjects = data.filter((item, idx) =>
      nextSelected.includes(keyExtractor(item, idx)),
    )

    onSelectionChange(nextSelected, nextSelectedObjects)
  }

  const getAlignmentClass = (align) => {
    switch (align) {
      case 'center':
        return 'text-center justify-center'
      case 'right':
        return 'text-right justify-end'
      default:
        return 'text-left justify-start'
    }
  }

  const displayColumns = useMemo(() => {
    if (!selectable) return columns

    const checkboxColumn = {
      id: '__selection__',
      width: 'w-10',
      align: 'center',
      header: (
        <HeaderCheckbox
          checked={isAllSelected}
          indeterminate={isSomeSelected}
          onChange={handleSelectAll}
        />
      ),
      cell: (row, rowKey) => {
        const isChecked = selectedRows.includes(rowKey)
        return <RowCheckbox checked={isChecked} onChange={(e) => handleSelectRow(e, row, rowKey)} />
      },
    }

    return [checkboxColumn, ...columns]
  }, [columns, selectable, isAllSelected, isSomeSelected, selectedRows, tabFilteredData])

  return (
    <div
      className={`w-full bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col ${
        maxHeight || ''
      } ${containerClassName}`}
    >
      {/* Table Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`overflow-auto min-w-full flex-1 min-h-0 ${scrollbarClassName}`}
      >
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-[#F9F6F0] shadow-xs">
            <tr className="border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              {displayColumns.map((col, index) => {
                const alignClass = getAlignmentClass(col.align)
                const isSorted = sortColumn === col.accessorKey

                return (
                  <th
                    key={col.id || index}
                    className={`py-2.5 px-3 font-semibold select-none bg-[#F1F3F5] ${col.width || ''}`}
                  >
                    {col.sortable && col.accessorKey ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.accessorKey)}
                        className={`flex items-center gap-1 transition-colors hover:text-slate-900 ${alignClass} w-full`}
                      >
                        <span>{typeof col.header === 'function' ? col.header() : col.header}</span>
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-[#E31837]" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-[#E31837]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                        )}
                      </button>
                    ) : (
                      <div className={`flex items-center ${alignClass}`}>
                        {typeof col.header === 'function' ? col.header() : col.header}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                  {displayColumns.map((_, cIdx) => (
                    <td key={cIdx} className="py-2.5 px-3">
                      <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={displayColumns.length || 1}
                  className="py-6 text-center text-slate-400 text-xs font-medium"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              <>
                {displayedData.map((row, index) => {
                  const rowKey = keyExtractor(row, index)
                  const isSelected = selectedRows.includes(rowKey)

                  return (
                    <tr
                      key={rowKey}
                      onClick={() => onRowClick && onRowClick(row)}
                      className={`transition-colors hover:bg-[#ffeeee] ${
                        isSelected ? 'bg-rose-50/50' : ''
                      } ${onRowClick ? 'cursor-pointer' : ''}`}
                    >
                      {displayColumns.map((col, cIdx) => {
                        const alignClass = getAlignmentClass(col.align)
                        return (
                          <td key={cIdx} className="py-2.5 px-3 align-top">
                            <div className={`flex items-start ${alignClass}`}>
                              {col.cell
                                ? col.cell(row, rowKey)
                                : col.accessorKey
                                  ? String(row[col.accessorKey] ?? '')
                                  : null}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}

                {hasMore && (
                  <tr>
                    <td colSpan={displayColumns.length || 1} className="py-3 text-center bg-white">
                      <div className="inline-flex items-center gap-2 text-xs text-slate-400 font-medium">
                        <Loader2 className="w-3.5 h-3.5 text-[#E31837] animate-spin" />
                        <span>Loading more rows...</span>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Excel-style Footer Bar combining tabs and entry counts (Scrollbar removed with overflow-hidden & flex-wrap) */}
      {(tabs.length > 0 || footer) && (
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200/80 bg-[#F1F3F5] px-3 py-1.5 shrink-0 gap-2 overflow-hidden">
          {/* Sheet / Folder Tabs */}
          {tabs && tabs.length > 0 ? (
            <div className="flex items-center gap-1 overflow-hidden flex-wrap w-full sm:w-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key
                const count =
                  tab.count !== undefined
                    ? tab.count
                    : data.filter(tab.filter || (() => true)).length

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => onTabChange && onTabChange(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-t border-t border-x transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-slate-900 border-slate-300 shadow-2xs font-bold -mb-1 pb-1.5'
                        : 'bg-slate-200/80 text-slate-500 border-transparent hover:bg-slate-200 hover:text-slate-700'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-rose-50 text-[#E31837] border border-red-200'
                          : 'bg-slate-300/80 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div />
          )}

          {/* Custom Footer or Entry Stats */}
          <div className="text-[11px] text-slate-500 font-medium shrink-0">{footer}</div>
        </div>
      )}
    </div>
  )
}

export default DataTable
