import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import TableToolbar from '../../../components/ui/TableToolbar'
import Button from '../../../components/ui/Button'
import { getTodayRange, todayStr } from '../../../utils/dateRange'
import StatCard from '../../../components/ui/StatCard'
import {
  Plus,
  FileSpreadsheet,
  Vault,
  HandCoins,
  AlertCircle,
  Coins,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { createRevolvingColumns } from '../../../table-columns/revolvingColumns'
import CreateRevolvingFundModal from '../../../features/revolving/CreateRevolvingFundModal'
import ViewRevolvingFundModal from '../../../features/revolving/ViewRevolvingFundModal'
import EditRevolvingFundModal from '../../../features/revolving/EditRevolvingFundModal'
import SubmitRevolvingFundModal from '../../../features/revolving/SubmitRevolvingFundModal'

import useRevolvingFunds from '../../../hooks/useRevolvingFunds'
import useRevolvingFundForm from '../../../hooks/useRevolvingFundForm'
import useRevolvingFundActivity from '../../../hooks/useRevolvingFundActivity'
import useCloseRevolvingFund from '../../../hooks/useCloseRevolvingFund'
import useEditRevolvingFund from '../../../hooks/useEditRevolvingFund'
import useBudgets from '../../../hooks/useBudgets'
import { useCashDisbursements } from '../../../hooks/useCashDisbursements'

export const Route = createFileRoute('/_authenticated/funds/revolving')({
  component: RevolvingFundPage,
})

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(val || 0)

function RevolvingFundPage() {
  const [dateRange, setDateRange] = useState(getTodayRange)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Fetch budget pool options for fund creation — also doubles as the
  // lookup source for resolving each fund's display name (see getFundLabel
  // below), since useBudgets already exposes getDepartmentName.
  const { budgets = [], getDepartmentName, isLoading: isBudgetsLoading } = useBudgets()

  const {
    funds = [],
    metrics = {},
    isLoading,
    error,
    fetchRevolvingFunds,
  } = useRevolvingFunds({ dateFrom: dateRange.from, dateTo: dateRange.to })

  const { disbursements = [] } = useCashDisbursements({
    dateFrom: '2000-01-01',
    dateTo: todayStr(),
  }) // all-time: used for reimbursed totals

  const reimbursedByFund = useMemo(() => {
    const totals = {}
    disbursements.forEach((row) => {
      const hasOriginal = disbursements.some(
        (d) => d.cash_voucher === row.cash_voucher && d.id < row.id,
      )
      if (hasOriginal) {
        const fundId = row.revolving_fund_id
        totals[fundId] = (totals[fundId] || 0) + parseFloat(row.amount_issued || 0)
      }
    })
    return totals
  }, [disbursements])

  const getReimbursedAmount = useCallback(
    (fundId) => reimbursedByFund[fundId] || 0,
    [reimbursedByFund],
  )

  /**
   * revolving_fund rows carry only budget_id — no name of their own. This
   * resolves each fund's display name to its budget's identity (department
   * + fund type), the closest equivalent to a "fund name" this schema has.
   */
  const getFundLabel = useCallback(
    (fundRow) => {
      const budgetId = fundRow?.budget_id
      const budget = budgets.find((b) => String(b.id) === String(budgetId))
      if (!budget) return `Fund #${fundRow?.id ?? fundRow?.revolving_fund_id ?? 'N/A'}`

      const deptName = getDepartmentName
        ? getDepartmentName(budget)
        : `Department #${budget.department_id}`
      return budget.type ? `${deptName} — ${budget.type}` : deptName
    },
    [budgets, getDepartmentName],
  )

  const {
    isModalOpen: isCreateOpen,
    formData,
    setFormData,
    handleOpenModal: handleOpenCreateModal,
    handleCloseModal: handleCloseCreateModal,
    handleSubmit: handleCreateSubmit,
    isSubmitting: isCreating,
  } = useRevolvingFundForm()

  const {
    activityModalFund,
    activityLogs,
    isActivityLoading,
    handleOpenActivityModal,
    handleCloseActivityModal,
  } = useRevolvingFundActivity()

  const {
    closeModalFund,
    isClosing,
    handleOpenCloseModal,
    handleCloseModal: handleCloseSubmitModal,
    handleConfirmClose,
  } = useCloseRevolvingFund()

  const { saveFund, isSaving: isEditSaving } = useEditRevolvingFund()

  const [selectedEditFund, setSelectedEditFund] = useState(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const handleView = useCallback(
    (row, e) => {
      handleOpenActivityModal(row, e)
    },
    [handleOpenActivityModal],
  )

  const handleEdit = useCallback((row) => {
    setSelectedEditFund(row)
    setIsEditOpen(true)
  }, [])

  const handleSubmit = useCallback(
    (row, e) => {
      handleOpenCloseModal(row, e)
    },
    [handleOpenCloseModal],
  )

  const handleCloseEditModal = useCallback(() => {
    setIsEditOpen(false)
    setSelectedEditFund(null)
  }, [])

  // Only { id, add_amount } comes out of the modal now — the backend owns
  // computing the fund's new added/total_fund/balance from its current
  // row plus this literal delta (see the controller's UPDATE FLOW), so
  // there's nothing else to assemble here.
  const handleSaveEdit = useCallback(
    async (payload) => {
      try {
        await saveFund(payload)
        handleCloseEditModal()
      } catch {
        // useEditRevolvingFund's onError already alerts the message; leave
        // the modal open so the user can retry without re-entering anything.
      }
    },
    [saveFund, handleCloseEditModal],
  )

  const filteredFunds = useMemo(() => {
    return funds.filter((fund) => {
      const fundName = getFundLabel(fund)
      const fundId = String(fund.id || fund.revolving_fund_id || '')

      const matchesSearch =
        fundName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fundId.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus =
        statusFilter === 'ALL' ||
        String(fund.status || '').toUpperCase() === statusFilter.toUpperCase()

      return matchesSearch && matchesStatus
    })
  }, [funds, searchTerm, statusFilter, getFundLabel])

  const columns = useMemo(
    () =>
      createRevolvingColumns({
        onView: handleView,
        onEdit: handleEdit,
        onSubmit: handleSubmit,
        getReimbursedAmount,
        getFundLabel,
      }),
    [handleView, handleEdit, handleSubmit, getReimbursedAmount, getFundLabel],
  )

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Revolving Funds
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage custodial petty cash, advance disbursements, liquidations, and replenishment
            cycles.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
            Export
          </Button>
          <Button variant="primary" onClick={() => handleOpenCreateModal()}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Fund
          </Button>
        </div>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 shrink-0">
        <StatCard
          title="Total Capacity"
          value={formatCurrency(metrics?.totalCapacity)}
          icon={Vault}
          subtitle="All active funds"
          variant="blue"
        />

        <StatCard
          title="Disbursed"
          value={formatCurrency(metrics?.totalIssued)}
          icon={HandCoins}
          subtitle="Issued advances"
          variant="amber"
        />

        <StatCard
          title="Liquidated"
          value={formatCurrency(metrics?.totalLiquidated)}
          icon={CheckCircle2}
          subtitle="Verified with receipts"
          variant="emerald"
        />

        <StatCard
          title="Unliquidated"
          value={formatCurrency(metrics?.totalUnliquidated)}
          icon={AlertCircle}
          subtitle="Pending receipts"
          variant="red"
        />

        <StatCard
          title="Available Balance"
          value={formatCurrency(metrics?.totalBalance)}
          icon={Coins}
          subtitle="Unassigned pool"
          variant="emerald"
        />
      </div>

      {/* Table Toolbar & Filters */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by Fund ID or Name..."
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
              { value: 'Active', label: 'Active' },
              { value: 'Low Balance', label: 'Low Balance' },
              { value: 'Closed', label: 'Closed' },
            ],
          },
        ]}
      />
      {/* Main DataTable / Loading / Error Container */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading revolving funds...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string'
                ? error
                : error?.message || 'An unexpected error occurred.'}
            </p>
            <Button
              variant="outline"
              onClick={() => fetchRevolvingFunds?.()}
              className="mt-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              Retry
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredFunds}
            keyExtractor={(row) => row.id || row.revolving_fund_id}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No revolving funds match your search filter.'
                : 'No revolving funds found.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Showing {filteredFunds.length} entries</span>
              </div>
            }
          />
        )}
      </div>

      {/* Modals Wired to Custom Hooks */}
      <CreateRevolvingFundModal
        isOpen={isCreateOpen}
        onClose={handleCloseCreateModal}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleCreateSubmit}
        isSubmitting={isCreating}
        budgets={budgets}
        revolvingFunds={funds}
        isBudgetsLoading={isBudgetsLoading}
        getDepartmentName={getDepartmentName}
      />

      <ViewRevolvingFundModal
        isOpen={Boolean(activityModalFund)}
        onClose={handleCloseActivityModal}
        fund={activityModalFund}
        logs={activityLogs}
        isLoading={isActivityLoading}
        getFundLabel={getFundLabel}
      />

      <EditRevolvingFundModal
        isOpen={isEditOpen}
        onClose={handleCloseEditModal}
        fund={selectedEditFund}
        onSave={handleSaveEdit}
        isSubmitting={isEditSaving}
        getFundLabel={getFundLabel}
      />

      <SubmitRevolvingFundModal
        isOpen={Boolean(closeModalFund)}
        onClose={handleCloseSubmitModal}
        fund={closeModalFund}
        onSubmitReport={handleConfirmClose}
        isSubmitting={isClosing}
        getFundLabel={getFundLabel}
      />
    </div>
  )
}
