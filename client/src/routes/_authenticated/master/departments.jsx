import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import Button from '../../../components/ui/Button'
import TableToolbar from '../../../components/ui/TableToolbar'
import {
  FileSpreadsheet,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createDepartmentColumns } from '../../../table-columns/departmentColumns'
import EditDepartmentModal from '../../../features/department/EditDepartmentModal'
import { useCashDisbursementLookups } from '../../../hooks/useCashDisbursementLookups'

export const Route = createFileRoute('/_authenticated/master/departments')({
  component: DepartmentsPage,
})

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

function DepartmentsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])

  const [selectedDepartment, setSelectedDepartment] = useState(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load department data from central lookup hook
  const { departments = [], isLoading, error, refetch } = useCashDisbursementLookups()

  const handleEdit = useCallback((row) => {
    setSelectedDepartment(row)
    setIsEditOpen(true)
  }, [])

  const handleCloseEdit = useCallback(() => {
    setIsEditOpen(false)
    setSelectedDepartment(null)
  }, [])

  const handleUpdateStatus = useCallback(
    async ({ id, status }) => {
      setIsSubmitting(true)
      try {
        // TODO: Replace with your actual API payload execution call
        // await departmentApi.updateStatus(id, { status })
        if (refetch) await refetch()
        return { success: true }
      } catch (err) {
        return {
          success: false,
          message: err.response?.data?.message || 'Failed to update department status.',
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [refetch],
  )

  const handleSelectionChange = useCallback((keys) => {
    setSelectedIds(keys)
  }, [])

  // Dynamic status counters for metric cards
  const metrics = useMemo(() => {
    const total = departments.length
    const active = departments.filter(
      (d) => (d.md_status || d.status || 'ACTIVE').toUpperCase() === 'ACTIVE',
    ).length
    const inactive = total - active
    return { total, active, inactive }
  }, [departments])

  const filteredDepartments = useMemo(() => {
    return departments.filter((dept) => {
      const q = searchTerm.toLowerCase()
      const name = (dept.md_name || dept.name || '').toLowerCase()
      const code = (dept.md_code || dept.code || '').toLowerCase()

      const matchesSearch = name.includes(q) || code.includes(q)
      const currentStatus = (dept.md_status || dept.status || 'ACTIVE').toUpperCase()
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [departments, searchTerm, statusFilter])

  const columns = useMemo(() => createDepartmentColumns({ onEdit: handleEdit }), [handleEdit])

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
            Departments
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage organizational departments and update operational status.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <StatCard
          title="Total Departments"
          value={metrics.total}
          icon={Building2}
          subtitle="Registered units"
          variant="blue"
        />
        <StatCard
          title="Active Departments"
          value={metrics.active}
          icon={CheckCircle2}
          subtitle="Operational status"
          variant="emerald"
        />
        <StatCard
          title="Inactive Departments"
          value={metrics.inactive}
          icon={XCircle}
          subtitle="Disabled status"
          variant="amber"
        />
      </div>

      {/* Toolbar & Filters (Date range omitted automatically) */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Department Name or Code..."
        filters={toolbarFilters}
      />

      {/* Data Table */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading departments...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string' ? error : error?.message || 'Failed to fetch departments.'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredDepartments}
            keyExtractor={(row) => row.md_id || row.id}
            selectable={false}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No departments match your search parameters.'
                : 'No departments found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>
                  Showing {filteredDepartments.length} entries
                  {selectedIds.length > 0 && ` (${selectedIds.length} selected)`}
                </span>
              </div>
            }
          />
        )}
      </div>

      {/* Edit Modal */}
      {isEditOpen && selectedDepartment && (
        <EditDepartmentModal
          isOpen={isEditOpen}
          onClose={handleCloseEdit}
          department={selectedDepartment}
          onUpdateStatus={handleUpdateStatus}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  )
}
