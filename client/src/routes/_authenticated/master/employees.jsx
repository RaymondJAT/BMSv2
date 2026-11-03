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
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createEmployeeColumns } from '../../../table-columns/employeeColumns'
import { useEmployeeLookups } from '../../../hooks/useEmployeeLookups'

export const Route = createFileRoute('/_authenticated/master/employees')({
  component: EmployeesPage,
})

export default function EmployeesPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])

  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  // department_name / position_name already come pre-joined on each
  // employee row (see master-employee.controller.js getMasterEmployee) —
  // no separate department/position lookup maps are needed here.
  const { employees = [], isLoading, error } = useEmployeeLookups()

  const handleEdit = useCallback((row) => {
    setSelectedEmployee(row)
    setIsEditOpen(true)
  }, [])

  const handleSelectionChange = useCallback((keys) => {
    setSelectedIds(keys)
  }, [])

  const metrics = useMemo(() => {
    const total = employees.length
    const regular = employees.filter((e) => (e.status || '').toUpperCase() === 'REGULAR').length
    const nonRegular = total - regular
    return { total, regular, nonRegular }
  }, [employees])

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const q = searchTerm.toLowerCase()
      const name = (emp.fullname || '').toLowerCase()
      const deptName = (emp.department_name || '').toLowerCase()
      const posTitle = (emp.position_name || '').toLowerCase()

      const matchesSearch = name.includes(q) || deptName.includes(q) || posTitle.includes(q)
      const currentStatus = (emp.status || 'PROBATIONARY').toUpperCase()
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [employees, searchTerm, statusFilter])

  const columns = useMemo(() => createEmployeeColumns({ onEdit: handleEdit }), [handleEdit])

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Employees
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage employee directory profiles, assignments, and employment statuses.
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

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <StatCard
          title="Total Employees"
          value={metrics.total}
          icon={Users}
          subtitle="Registered staff"
          variant="blue"
        />
        <StatCard
          title="Regular Employees"
          value={metrics.regular}
          icon={UserCheck}
          subtitle="Regularized status"
          variant="emerald"
        />
        <StatCard
          title="Non-Regular / Probationary"
          value={metrics.nonRegular}
          icon={Clock}
          subtitle="Probationary or contractual"
          variant="amber"
        />
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white py-2 px-3 rounded-xl border border-slate-200/80 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Employee Name, Dept, or Role..."
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
              <option value="REGULAR">Regular</option>
              <option value="PROBATIONARY">Probationary</option>
            </select>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading employees...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string' ? error : error?.message || 'Failed to fetch employees.'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredEmployees}
            keyExtractor={(row) => row.id}
            selectable={false}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No employees match your search parameters.'
                : 'No employees found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>
                  Showing {filteredEmployees.length} entries
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
