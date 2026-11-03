import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import ProjectModal from '../../../features/project/ProjectModal'
import {
  Search,
  Filter,
  Plus,
  Briefcase,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createProjectColumns } from '../../../table-columns/projectColumns'
import { useProjects } from '../../../hooks/useProjects'

export const Route = createFileRoute('/_authenticated/master/project')({
  component: ProjectsPage,
})

export default function ProjectsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { projects, isLoading, isSubmitting, error, saveProject } = useProjects()

  const handleCreate = useCallback(() => {
    setSelectedProject(null)
    setIsModalOpen(true)
  }, [])

  const handleEdit = useCallback((row) => {
    setSelectedProject(row)
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    setSelectedProject(null)
  }, [])

  const handleSelectionChange = useCallback((keys) => {
    setSelectedIds(keys)
  }, [])

  // Metrics
  const metrics = useMemo(() => {
    const total = projects.length
    const active = projects.filter((p) => (p.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length
    const inactive = total - active
    return { total, active, inactive }
  }, [projects])

  // Search & Filter
  const filteredProjects = useMemo(() => {
    return projects.filter((item) => {
      const q = searchTerm.toLowerCase()
      const name = (item.name || '').toLowerCase()
      const matchesSearch = name.includes(q)

      const currentStatus = (item.status || 'ACTIVE').toUpperCase()
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [projects, searchTerm, statusFilter])

  const columns = useMemo(() => createProjectColumns({ onEdit: handleEdit }), [handleEdit])

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Master Projects
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage the Project list available for selection on Cash Requests.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E31837] hover:bg-[#c4122e] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <StatCard
          title="Total Projects"
          value={metrics.total}
          icon={Briefcase}
          subtitle="Registered projects"
          variant="blue"
        />
        <StatCard
          title="Active Projects"
          value={metrics.active}
          icon={CheckCircle2}
          subtitle="Available for selection"
          variant="emerald"
        />
        <StatCard
          title="Inactive Projects"
          value={metrics.inactive}
          icon={XCircle}
          subtitle="Hidden from Cash Request"
          variant="amber"
        />
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white py-2 px-3 rounded-xl border border-slate-200/80 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Project Name..."
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

      {/* Data Table */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading projects...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string' ? error : error?.message || 'Failed to fetch projects.'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredProjects}
            keyExtractor={(row) => row.id}
            selectable={false}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No projects match your search parameters.'
                : 'No projects found. Click "New Project" to add one.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Showing {filteredProjects.length} entries</span>
              </div>
            }
          />
        )}
      </div>

      {/* Create / Edit Modal */}
      <ProjectModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        project={selectedProject}
        onSave={saveProject}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
