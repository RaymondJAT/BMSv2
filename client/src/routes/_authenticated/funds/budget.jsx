import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import DataTable from '../../../components/ui/DataTable'
import Button from '../../../components/ui/Button'
import TableToolbar from '../../../components/ui/TableToolbar'
import { Plus, Loader2 } from 'lucide-react'

import { createBudgetColumns } from '../../../table-columns/budgetColumns'
import BudgetFormModal from '../../../features/budget/BudgetFormModal'
import BudgetHistoryModal from '../../../features/budget/BudgetHistoryModal'

import useBudgets from '../../../hooks/useBudgets'
import useBudgetForm from '../../../hooks/useBudgetForm'
import useBudgetHistory from '../../../hooks/useBudgetHistory'

export const Route = createFileRoute('/_authenticated/funds/budget')({
  component: RouteComponent,
})

function RouteComponent() {
  const [searchTerm, setSearchTerm] = useState('')

  // Data Fetching & Mutations Hook
  const { budgets, departments, isLoading, error, getDepartmentName, handleDelete } = useBudgets()

  // Form & Upsert Modal Hook
  const {
    isModalOpen,
    selectedBudget,
    isSubmitting,
    formData,
    setFormData,
    handleOpenModal,
    handleCloseModal,
    handleSubmit,
  } = useBudgetForm()

  // History Audit Logs Hook
  const {
    historyModalBudget,
    historyLogs,
    isHistoryLoading,
    historyError,
    handleOpenHistoryModal,
    handleCloseHistoryModal,
  } = useBudgetHistory()

  // Client-side filtering logic based on user search term
  const filteredBudgets = budgets.filter((item) => {
    const term = searchTerm.toLowerCase()
    const deptName = getDepartmentName(item).toLowerCase()
    const deptId = (item.department_id ?? '').toString().toLowerCase()
    const code = (item.id ?? '').toString().toLowerCase()
    const type = (item.type ?? '').toString().toLowerCase()

    return (
      deptName.includes(term) || deptId.includes(term) || code.includes(term) || type.includes(term)
    )
  })

  // Column definitions injected with action callbacks
  const columns = createBudgetColumns({
    getDepartmentName,
    onViewHistory: handleOpenHistoryModal,
    onEdit: (row) => handleOpenModal(row),
    onDelete: handleDelete,
  })

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Budget Management
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Overview of department allocations, expenses, and transaction logs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Allocation
          </Button>
        </div>
      </div>

      {/* Toolbar & Search Filters (Date range omitted automatically) */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search department, ID, or type..."
      />

      {/* Global Query Error notification */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl shrink-0">
          {error}
        </div>
      )}

      {/* Table Area */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-5 h-5 animate-spin text-[#E31837]" />
            <span className="ml-2 text-xs font-semibold text-slate-600">
              Loading budget records...
            </span>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredBudgets}
            keyExtractor={(row) => row.id}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm
                ? 'No budget records match your search query.'
                : 'No active budget allocations found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Showing {filteredBudgets.length} entries</span>
              </div>
            }
          />
        )}
      </div>

      {/* Form Modal */}
      <BudgetFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        formData={formData}
        setFormData={setFormData}
        isSubmitting={isSubmitting}
        departments={departments}
        selectedBudget={selectedBudget}
        getDepartmentName={getDepartmentName}
      />

      {/* History Modal */}
      <BudgetHistoryModal
        budget={historyModalBudget}
        logs={historyLogs}
        isLoading={isHistoryLoading}
        error={historyError}
        onClose={handleCloseHistoryModal}
        getDepartmentName={getDepartmentName}
      />
    </div>
  )
}
