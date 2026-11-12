import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import Button from '../../../components/ui/Button'
import TableToolbar from '../../../components/ui/TableToolbar'
import {
  FileSpreadsheet,
  Plus,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createAccessColumns } from '../../../table-columns/accessColumns'
import EditAccessModal from '../../../features/access/EditAccessModal'
import EditPermissionModal from '../../../features/access/EditPermissionModal'
import { useAccessLookups } from '../../../hooks/useAccessLookups'
import { masterAccessApi } from '../../../api/masterAccessApi'

export const Route = createFileRoute('/_authenticated/master/access')({
  component: AccessPage,
})

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'ACTIVE' },
  { value: 'INACTIVE', label: 'INACTIVE' },
]

function AccessPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])

  // State for Upsert Role Modal
  const [selectedAccess, setSelectedAccess] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // State for Route Permissions Modal
  const [selectedPermissionAccess, setSelectedPermissionAccess] = useState(null)
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false)

  // Load access list from lookup hook
  const { accessRoles = [], isLoading, error, refetch } = useAccessLookups()

  const handleCreate = useCallback(() => {
    setSelectedAccess(null)
    setIsModalOpen(true)
  }, [])

  const handleEdit = useCallback((row) => {
    setSelectedAccess(row)
    setIsModalOpen(true)
  }, [])

  const handleEditPermissions = useCallback((row) => {
    setSelectedPermissionAccess(row)
    setIsPermissionModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    setSelectedAccess(null)
  }, [])

  const handleClosePermissionModal = useCallback(() => {
    setIsPermissionModalOpen(false)
    setSelectedPermissionAccess(null)
  }, [])

  const handlePermissionsUpdated = useCallback(async () => {
    if (refetch) await refetch()
  }, [refetch])

  const handleUpsertAccess = useCallback(
    async (payload) => {
      setIsSubmitting(true)
      try {
        await masterAccessApi.upsert(payload)
        if (refetch) await refetch()
        return { success: true }
      } catch (err) {
        return {
          success: false,
          message: err.response?.data?.message || 'Failed to save access role record.',
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

  // Metrics counters for StatCards
  const metrics = useMemo(() => {
    const total = accessRoles.length
    const active = accessRoles.filter((a) => {
      const status = a.ma_status || a.status || 'ACTIVE'
      return String(status).toUpperCase() === 'ACTIVE'
    }).length
    const inactive = total - active
    return { total, active, inactive }
  }, [accessRoles])

  // Search & Filter execution
  const filteredAccessList = useMemo(() => {
    return accessRoles.filter((item) => {
      const q = searchTerm.toLowerCase()
      const name = (item.ma_name || item.name || '').toLowerCase()

      const matchesSearch = name.includes(q)
      const currentStatus = (item.ma_status || item.status || 'ACTIVE').toUpperCase()
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [accessRoles, searchTerm, statusFilter])

  const columns = useMemo(
    () =>
      createAccessColumns({
        onEdit: handleEdit,
        onPermissions: handleEditPermissions,
      }),
    [handleEdit, handleEditPermissions],
  )

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
            Access Master
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage system access roles and authorization profiles.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
            Export
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Role
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <StatCard
          title="Total Access Roles"
          value={metrics.total}
          icon={ShieldCheck}
          subtitle="Configured roles"
          variant="blue"
        />
        <StatCard
          title="Active Roles"
          value={metrics.active}
          icon={CheckCircle2}
          subtitle="Available for users"
          variant="emerald"
        />
        <StatCard
          title="Inactive Roles"
          value={metrics.inactive}
          icon={XCircle}
          subtitle="Disabled roles"
          variant="amber"
        />
      </div>

      {/* Toolbar & Filters */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Role Name..."
        filters={toolbarFilters}
      />

      {/* Data Table */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading access roles...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string'
                ? error
                : error?.message || 'Failed to fetch access records.'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredAccessList}
            keyExtractor={(row) => row.ma_id || row.id}
            selectable={false}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No access roles match your search parameters.'
                : 'No access roles found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>
                  Showing {filteredAccessList.length} entries
                  {selectedIds.length > 0 && ` (${selectedIds.length} selected)`}
                </span>
              </div>
            }
          />
        )}
      </div>

      {/* Edit/Create Role Modal */}
      {isModalOpen && (
        <EditAccessModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          accessData={selectedAccess}
          onUpsert={handleUpsertAccess}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Edit Route Permissions Modal */}
      {isPermissionModalOpen && (
        <EditPermissionModal
          isOpen={isPermissionModalOpen}
          onClose={handleClosePermissionModal}
          accessData={selectedPermissionAccess}
          onRoutesUpdated={handlePermissionsUpdated}
        />
      )}
    </div>
  )
}
