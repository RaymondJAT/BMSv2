import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState, useCallback } from 'react'
import { Image } from 'antd'
import {
  ArrowLeft,
  Printer,
  Loader2,
  Pencil,
  CheckCircle2,
  ShieldCheck,
  ClipboardCheck,
} from 'lucide-react'
import DataTable from '../../../components/ui/DataTable'
import Button from '../../../components/ui/Button'
import { useLiquidationDetailLookups } from '../../../hooks/useLiquidationDetailLookups'
import { useCashDisbursementLookups } from '../../../hooks/useCashDisbursementLookups'
import { useLiquidationDetail } from '../../../hooks/useLiquidationDetail'
import useLiquidations from '../../../hooks/useLiquidations'
import useLiquidationMasterData from '../../../hooks/useLiquidationMasterData'
import { useLiquidationLookups } from '../../../hooks/useLiquidationLookups'
import { useCashDisbursements } from '../../../hooks/useCashDisbursements'
import useRevolvingFunds from '../../../hooks/useRevolvingFunds'
import { useAuth } from '../../../context/AuthContext'
import { createLiquidationItemColumns } from '../../../table-columns/liquidationItemColumns'
import { resolveTeamLeader } from '../../../utils/resolveTeamLeader'
import { getLiquidationPermissions } from '../../../utils/liquidationPermissions'
import CreateLiquidationModal from '../../../features/liquidation/CreateLiquidationModal'
import ApproveLiquidationModal from '../../../features/liquidation/ApproveLiquidationModal'
import VerifyLiquidationModal from '../../../features/liquidation/VerifyLiquidationModal'
import FinanceReviewModal from '../../../features/liquidation/FinanceReviewModal'

export const Route = createFileRoute('/_authenticated/workbench/liquidationDetail')({
  validateSearch: (search) => {
    const id = search.id
    if (id === undefined || id === null || id === '') {
      throw new Error('LiquidationDetailPage requires a ?id= search param')
    }
    return { id: String(id) }
  },
  component: LiquidationDetailPage,
})

const formatCurrency = (val) =>
  `₱${parseFloat(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatDate = (val) => {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function SummaryField({ label, value, valueClassName = 'font-semibold text-slate-800' }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`${valueClassName} mt-0.5`}>{value}</div>
    </div>
  )
}

function ActionButton({ icon: Icon, label, colorClassName, onClick }) {
  return (
    <Button variant="outline" onClick={onClick} className={`font-semibold ${colorClassName}`}>
      <Icon className="w-3.5 h-3.5 mr-1.5" />
      {label}
    </Button>
  )
}

function LiquidationDetailPage() {
  const { id } = Route.useSearch()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const userRole = currentUser?.access_name || null
  const currentEmployeeId = currentUser?.employee_id || null

  const { liquidation, activity, isLoading, error, refetch } = useLiquidationDetail(id)

  const { getEmployeeName, getDepartmentName } = useCashDisbursementLookups()
  const { getParticularsName, getModeName, getStoreLabel } = useLiquidationDetailLookups(
    liquidation?.items,
  )

  const { districts, modes, searchStores, searchModes } = useLiquidationMasterData()
  const { particulars, searchParticulars, getFundLabel } = useLiquidationLookups()

  const { disbursements = [] } = useCashDisbursements()
  const { funds = [] } = useRevolvingFunds()

  const {
    isMutating,
    editLiquidation,
    approveLiquidation,
    rejectLiquidation,
    verifyLiquidation,
    completeLiquidation,
    markIncomplete,
  } = useLiquidations({ role: userRole })

  const [activeModal, setActiveModal] = useState(null)
  const closeActiveModal = useCallback(() => setActiveModal(null), [])

  const permissions = useMemo(
    () => getLiquidationPermissions(userRole, currentEmployeeId, liquidation),
    [userRole, currentEmployeeId, liquidation],
  )

  const rejectionNotes = useMemo(() => activity.filter((a) => a.action === 'REJECTED'), [activity])

  const receiptForSelected = useMemo(
    () => [...activity].reverse().find((a) => a.receipt)?.receipt,
    [activity],
  )

  const disbursementForSelected = useMemo(() => {
    if (!liquidation) return null
    return disbursements.find(
      (d) => String(d.cash_request_id) === String(liquidation.cash_request_id),
    )
  }, [liquidation, disbursements])

  const originalFundId = disbursementForSelected?.revolving_fund_id ?? null
  const originalFund = useMemo(
    () => funds.find((f) => String(f.id) === String(originalFundId)),
    [funds, originalFundId],
  )
  const eligibleFundsForVerify = useMemo(() => funds.filter((f) => f.status !== 'CLOSED'), [funds])

  const itemColumns = useMemo(
    () => createLiquidationItemColumns({ getParticularsName, getModeName, getStoreLabel }),
    [getParticularsName, getModeName, getStoreLabel],
  )

  const withRefetch = useCallback(
    (mutation) =>
      async (...args) => {
        const result = await mutation(...args)
        if (result?.success) refetch?.()
        return result
      },
    [refetch],
  )

  const handleUpdate = withRefetch(editLiquidation)
  const handleApprove = withRefetch(approveLiquidation)
  const handleVerify = withRefetch(verifyLiquidation)
  const handleReject = withRefetch(rejectLiquidation)
  const handleComplete = withRefetch(completeLiquidation)
  const handleMarkIncomplete = withRefetch(markIncomplete)

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white rounded-xl border border-slate-200">
        <Loader2 className="w-6 h-6 text-[#E31837] animate-spin" />
      </div>
    )
  }

  if (error || !liquidation) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-rose-600 font-medium">{error || 'Liquidation not found.'}</p>
        <Button variant="outline" onClick={() => navigate({ to: '/workbench/liquidation' })}>
          Back to Liquidations
        </Button>
      </div>
    )
  }

  const items = liquidation.items || []
  const amountObtained = parseFloat(liquidation.amount_obtained || 0)
  const amountExpended = parseFloat(liquidation.amount_expended || 0)

  const rawDifference = amountObtained - amountExpended
  const difference = Math.abs(rawDifference)

  const varianceType =
    rawDifference > 0 ? 'Return' : rawDifference < 0 ? 'Reimbursement' : 'Fully Liquidated'

  const differenceColor =
    rawDifference < 0 ? 'text-orange-600' : rawDifference > 0 ? 'text-blue-600' : 'text-emerald-600'

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Top Bar Navigation & Actions (Fixed Header) */}
      <div className="flex items-center justify-between shrink-0 print:hidden flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate({ to: '/workbench/liquidation' })}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {permissions.canEdit && (
            <ActionButton
              icon={Pencil}
              label="Edit & Resubmit"
              colorClassName="border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => setActiveModal('edit')}
            />
          )}
          {permissions.canApprove && (
            <ActionButton
              icon={CheckCircle2}
              label="Team Leader Approve"
              colorClassName="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setActiveModal('approve')}
            />
          )}
          {permissions.canVerify && (
            <ActionButton
              icon={ShieldCheck}
              label="Fund Custodian Verify"
              colorClassName="border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => setActiveModal('verify')}
            />
          )}
          {permissions.canFinance && (
            <ActionButton
              icon={ClipboardCheck}
              label="Finance Post-Audit"
              colorClassName="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={() => setActiveModal('finance')}
            />
          )}

          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      {rejectionNotes.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl shrink-0">
          <div className="font-bold mb-1">Latest Remarks</div>
          {rejectionNotes[rejectionNotes.length - 1]?.remarks}
        </div>
      )}

      {/* Header Summary Metadata Grid (Fixed Header - Stays visible while scrolling table) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-white p-4 border border-slate-200 rounded-xl shadow-2xs shrink-0">
        <SummaryField
          label="Employee"
          value={
            getEmployeeName
              ? getEmployeeName(liquidation.employee_id)
              : liquidation.employee_name || `#${liquidation.employee_id}`
          }
        />
        <SummaryField
          label="Department"
          value={
            getDepartmentName
              ? getDepartmentName(liquidation.department_id)
              : liquidation.department || '—'
          }
        />
        <SummaryField
          label="Date of Liquidation"
          value={formatDate(liquidation.date_of_liquidation || liquidation.createdAt)}
        />
        <SummaryField label="Reference ID" value={liquidation.reference_id || '—'} />
        <SummaryField label="Team Leader" value={resolveTeamLeader(liquidation, getEmployeeName)} />
        <SummaryField
          label="Amount Obtained"
          value={formatCurrency(amountObtained)}
          valueClassName="font-bold text-slate-900"
        />
        <SummaryField
          label="Amount Expended"
          value={formatCurrency(amountExpended)}
          valueClassName="font-bold text-slate-900"
        />
        <SummaryField
          label={varianceType}
          value={formatCurrency(difference)}
          valueClassName={`font-bold ${differenceColor}`}
        />
      </div>

      {/* Liquidation Items Table Container (Only this section scrolls with custom scrollbar) */}
      <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
        <Image.PreviewGroup>
          <DataTable
            columns={itemColumns}
            data={items}
            keyExtractor={(row) => row.id}
            emptyMessage="No liquidation items found."
            containerClassName="flex flex-col h-full min-h-0"
            maxHeight="h-full"
            scrollbarClassName="custom-scrollbar"
            initialDisplayCount={items.length || 11}
            newestFirst={false}
          />
        </Image.PreviewGroup>
      </div>

      {/* Workflow Modals */}
      {activeModal === 'edit' && (
        <CreateLiquidationModal
          isOpen
          onClose={closeActiveModal}
          onUpdate={handleUpdate}
          isSubmitting={isMutating}
          editingLiquidation={liquidation}
          districts={districts}
          particulars={particulars}
          modes={modes}
          searchStores={searchStores}
          searchParticulars={searchParticulars}
          searchModes={searchModes}
        />
      )}

      {activeModal === 'approve' && (
        <ApproveLiquidationModal
          isOpen
          onClose={closeActiveModal}
          liquidation={liquidation}
          receipt={receiptForSelected}
          onApprove={(p) => handleApprove(liquidation.id, p)}
          onReject={(p) => handleReject(liquidation.id, p)}
          isSubmitting={isMutating}
          getEmployeeName={getEmployeeName}
        />
      )}

      {activeModal === 'verify' && (
        <VerifyLiquidationModal
          isOpen
          onClose={closeActiveModal}
          liquidation={liquidation}
          receipt={receiptForSelected}
          onVerify={(p) => handleVerify(liquidation.id, p)}
          onReject={(p) => handleReject(liquidation.id, p)}
          isSubmitting={isMutating}
          getEmployeeName={getEmployeeName}
          revolvingFunds={eligibleFundsForVerify}
          originalFundId={originalFundId}
          originalFundStatus={originalFund?.status}
          getFundLabel={getFundLabel}
        />
      )}

      {activeModal === 'finance' && (
        <FinanceReviewModal
          isOpen
          onClose={closeActiveModal}
          liquidation={liquidation}
          onComplete={(p) => handleComplete(liquidation.id, p)}
          onMarkIncomplete={(p) => handleMarkIncomplete(liquidation.id, p)}
          isSubmitting={isMutating}
        />
      )}
    </div>
  )
}
