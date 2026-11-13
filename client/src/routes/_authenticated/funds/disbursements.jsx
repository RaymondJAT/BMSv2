import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import TableToolbar from '../../../components/ui/TableToolbar'
import Button from '../../../components/ui/Button'
import { getTodayRange } from '../../../utils/dateRange'
import StatCard from '../../../components/ui/StatCard'
import {
  Plus,
  FileSpreadsheet,
  HandCoins,
  AlertCircle,
  Receipt,
  RotateCcw,
  Loader2,
} from 'lucide-react'
import { createDisbursementColumns } from '../../../table-columns/disbursementColumns'
import CreateCashDisbursementModal from '../../../features/disbursement/CreateCashDisbursementModal'
import EditCashDisbursementModal from '../../../features/disbursement/EditCashDisbursementModal'
import SubmitCashDisbursementModal from '../../../features/disbursement/SubmitCashDisbursementModal'
import { useCashDisbursements } from '../../../hooks/useCashDisbursements'
import { useCashDisbursementLookups } from '../../../hooks/useCashDisbursementLookups'

export const Route = createFileRoute('/_authenticated/funds/disbursements')({
  component: DisbursementsPage,
})

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(val || 0)

function DisbursementsPage() {
  const [dateRange, setDateRange] = useState(getTodayRange)
  const {
    disbursements,
    isLoading,
    isMutating,
    error,
    issue,
    saveDisbursement,
    submitLiquidation,
  } = useCashDisbursements({ dateFrom: dateRange.from, dateTo: dateRange.to })

  const {
    revolvingFunds,
    departments,
    employees,
    getDepartmentName,
    getEmployeeName,
    getFundLabel,
  } = useCashDisbursementLookups()

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [selectedDisbursement, setSelectedDisbursement] = useState(null)
  const [activeModal, setActiveModal] = useState(null)

  const handleEdit = useCallback((row) => {
    setSelectedDisbursement(row)
    setActiveModal('edit')
  }, [])

  const handleSubmitAction = useCallback((row) => {
    setSelectedDisbursement(row)
    setActiveModal('submit')
  }, [])

  const handleCloseModal = useCallback(() => {
    setActiveModal(null)
    setSelectedDisbursement(null)
  }, [])

  const metrics = useMemo(() => {
    return disbursements.reduce(
      (acc, item) => {
        acc.totalIssued += parseFloat(item.amount_issued || 0)
        acc.totalExpended += parseFloat(item.amount_expended || 0)
        acc.totalReturned += parseFloat(item.amount_returned || 0)
        acc.totalOutstanding += parseFloat(item.outstanding_amount || 0)
        return acc
      },
      { totalIssued: 0, totalExpended: 0, totalReturned: 0, totalOutstanding: 0 },
    )
  }, [disbursements])

  const filteredDisbursements = useMemo(() => {
    return disbursements.filter((item) => {
      const q = searchTerm.toLowerCase()
      const employeeName = getEmployeeName(item.received_by).toLowerCase()
      const departmentName = getDepartmentName(item.department_id).toLowerCase()
      const purposeText = String(item.purpose || '').toLowerCase()

      const matchesSearch =
        (item.cash_voucher || '').toLowerCase().includes(q) ||
        employeeName.includes(q) ||
        departmentName.includes(q) ||
        purposeText.includes(q) ||
        String(item.id ?? '').includes(q)

      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [disbursements, searchTerm, statusFilter, getEmployeeName, getDepartmentName])

  const columns = useMemo(
    () =>
      createDisbursementColumns({
        onEdit: handleEdit,
        onSubmit: handleSubmitAction,
        getEmployeeName,
        getDepartmentName,
        allDisbursements: disbursements,
      }),
    [handleEdit, handleSubmitAction, getEmployeeName, getDepartmentName, disbursements],
  )

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Cash Disbursements
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Track vouchers, payee liquidations, cash returns, and unliquidated advances.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
            Export
          </Button>
          <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Disbursement
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <StatCard
          title="Total Issued"
          value={formatCurrency(metrics.totalIssued)}
          icon={HandCoins}
          subtitle="All cash vouchers"
          variant="amber"
        />
        <StatCard
          title="Total Expended"
          value={formatCurrency(metrics.totalExpended)}
          icon={Receipt}
          subtitle="Liquidated expenses"
          variant="emerald"
        />
        <StatCard
          title="Cash Returned"
          value={formatCurrency(metrics.totalReturned)}
          icon={RotateCcw}
          subtitle="Unused fund returns"
          variant="blue"
        />
        <StatCard
          title="Outstanding Balance"
          value={formatCurrency(metrics.totalOutstanding)}
          icon={AlertCircle}
          subtitle="Pending settlement"
          variant="red"
        />
      </div>

      {/* Toolbar */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Voucher, Payee, or Department..."
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'ALL', label: 'All Statuses' },
              { value: 'UNLIQUIDATED', label: 'UNLIQUIDATED' },
              { value: 'LIQUIDATED', label: 'LIQUIDATED' },
            ],
          },
        ]}
      />
      {/* Error state */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl shrink-0">
          {error}
        </div>
      )}

      {/* DataTable */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-6 h-6 animate-spin text-[#E31837]" />
            <span className="ml-2 text-sm font-semibold text-slate-600">
              Loading disbursements...
            </span>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredDisbursements}
            keyExtractor={(row) => row.id}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No cash disbursements match your search filter.'
                : 'No cash disbursements found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Showing {filteredDisbursements.length} entries</span>
              </div>
            }
          />
        )}
      </div>

      {/* Modals */}
      {isCreateOpen && (
        <CreateCashDisbursementModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onIssue={issue}
          isSubmitting={isMutating}
          revolvingFunds={revolvingFunds}
          employees={employees}
          departments={departments}
          getFundLabel={getFundLabel}
        />
      )}

      {activeModal === 'edit' && selectedDisbursement && (
        <EditCashDisbursementModal
          isOpen={activeModal === 'edit'}
          onClose={handleCloseModal}
          disbursement={selectedDisbursement}
          onSave={saveDisbursement}
          isSubmitting={isMutating}
          employees={employees}
          departments={departments}
        />
      )}

      {activeModal === 'submit' && selectedDisbursement && (
        <SubmitCashDisbursementModal
          isOpen={activeModal === 'submit'}
          onClose={handleCloseModal}
          disbursement={selectedDisbursement}
          revolvingFunds={revolvingFunds}
          onSubmit={submitLiquidation}
          isSubmitting={isMutating}
          getFundLabel={getFundLabel}
        />
      )}
    </div>
  )
}
