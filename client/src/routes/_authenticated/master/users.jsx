import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import {
  Search,
  Filter,
  FileSpreadsheet,
  Users,
  UserCheck,
  UserX,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createUserColumns } from '../../../table-columns/userColumns'
import { useUserManagementLookups } from '../../../hooks/useUserManagementLookups'
import { masterUserApi } from '../../../api/masterUserApi'
import AccessAssignmentModal from '../../../features/users/AccessAssignmentModal'

export const Route = createFileRoute('/_authenticated/master/users')({
  component: UsersPage,
})

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])

  const [accessTargetUser, setAccessTargetUser] = useState(null)

  const {
    users = [],
    rolesMap = {},
    accessRoles = [],
    isLoading,
    error,
    refetch,
  } = useUserManagementLookups()

  const handleSetAccess = useCallback((row) => {
    setAccessTargetUser(row)
  }, [])

  const handleCloseAccessModal = useCallback(() => {
    setAccessTargetUser(null)
  }, [])

  const handleSaveAccess = useCallback(
    async (userId, roleId) => {
      await masterUserApi.upsert({ id: userId, access: roleId })
      await refetch()
    },
    [refetch],
  )

  const handleSelectionChange = useCallback((keys) => {
    setSelectedIds(keys)
  }, [])

  const metrics = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => (u.status || '').toUpperCase() === 'ACTIVE').length
    const inactive = total - active
    return { total, active, inactive }
  }, [users])

  const filteredUsers = useMemo(() => {
    return users.filter((usr) => {
      const q = searchTerm.toLowerCase()
      const fullname = (usr.fullname || '').toLowerCase()
      const username = (usr.username || '').toLowerCase()
      const empId = String(usr.employee_id ?? '')
      const roleName = (usr.access_name || rolesMap[usr.access_id] || '').toLowerCase()

      const matchesSearch =
        fullname.includes(q) || username.includes(q) || empId.includes(q) || roleName.includes(q)

      const currentStatus = (usr.status || 'ACTIVE').toUpperCase()
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [users, searchTerm, statusFilter, rolesMap])

  const columns = useMemo(
    () => createUserColumns({ rolesMap, onSetAccess: handleSetAccess }),
    [rolesMap, handleSetAccess],
  )

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            System Users
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage user accounts, roles, access permissions, and activation statuses.
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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <StatCard
          title="Total Users"
          value={metrics.total}
          icon={Users}
          subtitle="Registered accounts"
          variant="blue"
        />
        <StatCard
          title="Active Accounts"
          value={metrics.active}
          icon={UserCheck}
          subtitle="Enabled login access"
          variant="emerald"
        />
        <StatCard
          title="Inactive Accounts"
          value={metrics.inactive}
          icon={UserX}
          subtitle="Disabled or suspended"
          variant="amber"
        />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white py-2 px-3 rounded-xl border border-slate-200/80 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Name, Username, or Role..."
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
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading users...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string' ? error : error?.message || 'Failed to fetch users.'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredUsers}
            keyExtractor={(row) => row.id}
            selectable={false}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No users match your search parameters.'
                : 'No users found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>
                  Showing {filteredUsers.length} entries
                  {selectedIds.length > 0 && ` (${selectedIds.length} selected)`}
                </span>
              </div>
            }
          />
        )}
      </div>

      <AccessAssignmentModal
        isOpen={Boolean(accessTargetUser)}
        user={accessTargetUser}
        accessRoles={accessRoles}
        onClose={handleCloseAccessModal}
        onSave={handleSaveAccess}
      />
    </div>
  )
}
