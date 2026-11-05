import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState, useEffect } from 'react'
import DataTable from '../../../components/ui/DataTable'
import TableToolbar from '../../../components/ui/TableToolbar'
import { getTodayRange } from '../../../utils/dateRange'
import { Loader2 } from 'lucide-react'
import { createLiquidationColumns } from '../../../table-columns/liquidationColumns'
import useLiquidations from '../../../hooks/useLiquidations'
import { useLiquidationLookups } from '../../../hooks/useLiquidationLookups'
import { useAuth } from '../../../context/AuthContext'

export const Route = createFileRoute('/_authenticated/workbench/liquidation')({
  component: LiquidationPage,
})

/**
 * Liquidation list. Read-only besides Download — every workflow decision
 * (Edit & resubmit, Team Leader Approve/Reject, Fund Custodian
 * Verify/Reject, Finance post-audit) requires checking the liquidation's
 * line items against their receipts first, so all of that now lives on
 * LiquidationDetailPage instead. Clicking a row goes there.
 *
 * Shows today's liquidations by default; use the date range filter to look
 * back at older ones.
 */
function LiquidationPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const userRole = currentUser?.access_name || null

  const [dateRange, setDateRange] = useState(getTodayRange)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const {
    liquidations = [],
    isLoading,
    error,
  } = useLiquidations({ role: userRole, dateFrom: dateRange.from, dateTo: dateRange.to })
  const { getEmployeeName } = useLiquidationLookups()

  // Silently log or handle background sync errors
  useEffect(() => {
    if (error) {
      console.warn('Liquidation background sync warning:', error)
    }
  }, [error])

  const handleView = (row) =>
    navigate({ to: '/workbench/liquidationDetail', search: { id: String(row.id) } })

  const columns = useMemo(() => createLiquidationColumns({ getEmployeeName }), [getEmployeeName])

  // Status options are built from the rows actually returned, so no status
  // value has to be hard-coded here.
  const statusOptions = useMemo(() => {
    const seen = [
      ...new Set(liquidations.map((l) => String(l.status || '').toUpperCase()).filter(Boolean)),
    ]
    return [
      { value: 'ALL', label: 'All Statuses' },
      ...seen.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })),
    ]
  }, [liquidations])

  const filteredLiquidations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return liquidations.filter((row) => {
      const matchesStatus =
        statusFilter === 'ALL' || String(row.status || '').toUpperCase() === statusFilter
      if (!matchesStatus) return false
      if (!q) return true
      // Search every plain value on the row, plus the resolved employee name.
      const haystack = [
        ...Object.values(row).filter((v) => typeof v === 'string' || typeof v === 'number'),
        getEmployeeName?.(row.employee_id ?? row.requested_by ?? row.created_by) || '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [liquidations, searchTerm, statusFilter, getEmployeeName])

  const isFiltering = searchTerm || statusFilter !== 'ALL'

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      <div>
        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
          Liquidations
        </h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Team Leader → Fund Custodian → Finance post-audit pipeline. New liquidations are created
          from a completed Cash Request. Open a row to review and act on it.
        </p>
      </div>

      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search liquidations..."
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: statusOptions,
          },
        ]}
      />

      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredLiquidations}
            keyExtractor={(row) => row.id}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              isFiltering ? 'No liquidations match your filters.' : 'No liquidations found.'
            }
            onRowClick={handleView}
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Showing {filteredLiquidations.length} entries</span>
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}
