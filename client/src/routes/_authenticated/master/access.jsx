import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import {
  Search,
  Filter,
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

  // NOTE: accessColumns.jsx's createAccessColumns expects an `onPermissions`
  // prop (that's what the key-icon button calls) — the previous version of
  // this file passed `onEditPermissions`, which accessColumns.jsx never
  // reads, so the button silently did nothing. Fixed here.
  const columns = useMemo(
    () =>
      createAccessColumns({
        onEdit: handleEdit,
        onPermissions: handleEditPermissions,
      }),
    [handleEdit, handleEditPermissions],
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
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E31837] hover:bg-[#c4132e] text-white font-semibold text-xs rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Role
          </button>
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white py-2 px-3 rounded-xl border border-slate-200/80 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Role Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent transition-all"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </div>
        </div>
      </div>

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
