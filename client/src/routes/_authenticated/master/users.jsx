import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import Button from '../../../components/ui/Button'
import TableToolbar from '../../../components/ui/TableToolbar'
import { FileSpreadsheet, Users, UserCheck, UserX, Loader2, AlertCircle } from 'lucide-react'
import { createUserColumns } from '../../../table-columns/userColumns'
import { useUserManagementLookups } from '../../../hooks/useUserManagementLookups'
import { masterUserApi } from '../../../api/masterUserApi'
import AccessAssignmentModal from '../../../features/users/AccessAssignmentModal'

export const Route = createFileRoute('/_authenticated/master/users')({
  component: UsersPage,
})

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

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
            System Users
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage user accounts, roles, access permissions, and activation statuses.
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

      {/* Toolbar & Filters (Date range omitted automatically) */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Name, Username, or Role..."
        filters={toolbarFilters}
      />

      {/* Data Table */}
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
