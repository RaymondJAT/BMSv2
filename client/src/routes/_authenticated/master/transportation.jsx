import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import Button from '../../../components/ui/Button'
import TableToolbar from '../../../components/ui/TableToolbar'
import { Truck, CheckCircle2, XCircle, Loader2, AlertCircle, Plus } from 'lucide-react'
import { createTransportationColumns } from '../../../table-columns/transportationColumns'
import { useTransportation } from '../../../hooks/useTransportation'

export const Route = createFileRoute('/_authenticated/master/transportation')({
  component: TransportationPage,
})

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

export default function TransportationPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedTransportation, setSelectedTransportation] = useState(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)

  // Custom hook for transportation data management
  const { transportationList = [], isLoading, error } = useTransportation()

  const handleEdit = useCallback((row) => {
    setSelectedTransportation(row)
    setIsEditOpen(true)
  }, [])

  const handleSelectionChange = useCallback((keys) => {
    setSelectedIds(keys)
  }, [])

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = transportationList.length
    const active = transportationList.filter(
      (item) => (item.mmot_status || 'ACTIVE').toUpperCase() === 'ACTIVE',
    ).length
    const inactive = total - active
    return { total, active, inactive }
  }, [transportationList])

  // Search & Filter
  const filteredTransportation = useMemo(() => {
    return transportationList.filter((item) => {
      const q = searchTerm.toLowerCase()
      const name = (item.mmot_name || '').toLowerCase()

      const matchesSearch = name.includes(q)

      const currentStatus = (item.mmot_status || 'ACTIVE').toUpperCase()
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [transportationList, searchTerm, statusFilter])

  const columns = useMemo(() => createTransportationColumns({ onEdit: handleEdit }), [handleEdit])

  const toolbarFilters = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        value: statusFilter,
        onChange: setStatusFilter,
        options: STATUS_FILTER_OPTIONS,
      },
    ],
    [statusFilter],
  )

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Master Mode of Transportation
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage transport modes, categories, and vehicle lookup options.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            onClick={() => setIsAddOpen(true)}
            className="bg-[#4A0404] hover:bg-[#3B0303] text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5 stroke-[2.5]" />
            Add Transportation
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <StatCard
          title="Total Transportation Modes"
          value={metrics.total}
          icon={Truck}
          subtitle="Registered modes"
          variant="blue"
        />
        <StatCard
          title="Active Modes"
          value={metrics.active}
          icon={CheckCircle2}
          subtitle="Available for selection"
          variant="emerald"
        />
        <StatCard
          title="Inactive Modes"
          value={metrics.inactive}
          icon={XCircle}
          subtitle="Disabled or archived"
          variant="amber"
        />
      </div>

      {/* Toolbar & Filters */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Transportation Mode..."
        filters={toolbarFilters}
      />

      {/* Data Table */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading modes of transportation...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string'
                ? error
                : error?.message || 'Failed to fetch modes of transportation.'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredTransportation}
            keyExtractor={(row, index) => row.mmot_id || row.id || `transport-${index}`}
            selectable={false}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No transportation modes match your search parameters.'
                : 'No transportation modes found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>
                  Showing {filteredTransportation.length} entries
                  {selectedIds.length > 0 && ` (${selectedIds.length} selected)`}
                </span>
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}
