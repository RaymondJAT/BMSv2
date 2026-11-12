import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import { Plus, FileSpreadsheet, Loader2, Wallet } from 'lucide-react'
import DataTable from '../../../components/ui/DataTable'
import TableToolbar from '../../../components/ui/TableToolbar'
import Toast from '../../../components/ui/Toast'
import StatCard from '../../../components/ui/StatCard'
import Button from '../../../components/ui/Button'
import { getTodayRange } from '../../../utils/dateRange'
import { getLiquidationTypeForRequest } from '../../../utils/requestType'
import { isTicketRequiredPosition } from '../../../utils/liquidationTickets'
import { createRequestColumns } from '../../../table-columns/requestColumns'
import { buildCashRequestMetricCards } from '../../../config/cashRequestMetrics'
import CreateCashRequestModal from '../../../features/request/CreateCashRequestModal'
import ViewCashRequestModal from '../../../features/request/ViewCashRequestModal'
import ApproveCashRequestModal from '../../../features/request/ApproveCashRequestModal'
import DisburseCashRequestModal from '../../../features/request/DisburseCashRequestModal'
import CreateLiquidationModal from '../../../features/liquidation/CreateLiquidationModal'
import ViewLiquidationModal from '../../../features/liquidation/ViewLiquidationModal'
import useCashRequests from '../../../hooks/useCashRequests'
import { useAuth } from '../../../context/AuthContext'
import { useCashRequestLookups } from '../../../hooks/useCashRequestLookups'
import useLiquidationMasterData from '../../../hooks/useLiquidationMasterData'
import { useCashRequestEligibility } from '../../../hooks/useCashRequestEligibility'
import { useLiquidationWorkflow } from '../../../hooks/useLiquidationWorkflow'
import { useSlinkTicketStatus, TICKET_STATUS } from '../../../hooks/useSlinkTicketStatus'
import { useSlinkLiquidationCheck } from '../../../hooks/useSlinkLiquidationCheck'
import { useCashRequestWallet } from '../../../hooks/useCashRequestWallet'

export const Route = createFileRoute('/_authenticated/workbench/request')({
  component: CashRequestPage,
})

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const CREATE_ROLES = ['ADMINISTRATOR', 'REQUESTER']
const STATUS_FILTER_ROLES = ['ADMINISTRATOR', 'REQUESTER', 'DEVELOPER']

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending Team Leader' },
  { value: 'APPROVED', label: 'Pending Fund Custodian' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Rejected' },
]

const MESSAGES = {
  ticketChecking: 'Checking your ticket status with Slink — please try again in a moment.',
  ticketFailed: (reason) =>
    `Could not verify your ticket status with Slink (${reason}). Please try again.`,
  notEligible:
    'You cannot create a new Cash Request until your previous Cash Request has been fully liquidated.',
  slinkUnreachable: 'Could not reach Slink to verify tickets. Please try again.',
  liquidationNotCleared: (status) =>
    `Slink hasn't cleared this request for liquidation yet${
      status ? ` (status: ${status})` : ''
    }. Resolve your open tickets first.`,
}

const INITIAL_TOAST = { isOpen: false, message: '', variant: 'warning' }
const CLOSED_MODAL = { type: null, request: null }

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

const filterRequests = (requests, { searchTerm, statusFilter, getEmployeeName }) => {
  const query = searchTerm.toLowerCase()

  return requests.filter((req) => {
    const requesterName = getEmployeeName(req.employee_id).toLowerCase()
    const matchesSearch =
      (req.reference_id || '').toLowerCase().includes(query) ||
      (req.project || '').toLowerCase().includes(query) ||
      (req.purpose || '').toLowerCase().includes(query) ||
      requesterName.includes(query)
    const matchesStatus =
      statusFilter === 'ALL' || String(req.status || '').toUpperCase() === statusFilter

    return matchesSearch && matchesStatus
  })
}

const buildStatusFilter = (value, onChange) => ({
  key: 'status',
  label: 'Status',
  value,
  onChange,
  options: STATUS_FILTER_OPTIONS,
})

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val || 0)

/* ------------------------------------------------------------------ */
/* Small hooks                                                         */
/* ------------------------------------------------------------------ */

function useToast() {
  const [toast, setToast] = useState(INITIAL_TOAST)

  const showToast = useCallback((message, variant = 'warning') => {
    setToast({ isOpen: true, message, variant })
  }, [])

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isOpen: false }))
  }, [])

  return { toast, showToast, closeToast }
}

/**
 * Gate in front of the liquidation modal: asks Slink first and only opens
 * the modal when allowed. Holds the ticket rows that prefill the form
 * (travel requests only).
 */
function useLiquidationGate({
  checkLiquidation,
  isChecking,
  openLiquidate,
  closeLiquidate,
  showToast,
}) {
  const [ticketRows, setTicketRows] = useState([])

  const handleLiquidate = useCallback(
    async (row) => {
      if (isChecking) return
      const result = await checkLiquidation(row)

      if (result.error) {
        showToast(MESSAGES.slinkUnreachable, 'warning')
        return
      }
      if (!result.allowed) {
        showToast(MESSAGES.liquidationNotCleared(result.status), 'warning')
        return
      }

      setTicketRows(result.rows)
      openLiquidate(row)
    },
    [checkLiquidation, isChecking, openLiquidate, showToast],
  )

  const handleCloseLiquidate = useCallback(() => {
    setTicketRows([])
    closeLiquidate()
  }, [closeLiquidate])

  return { ticketRows, handleLiquidate, handleCloseLiquidate }
}

/* ------------------------------------------------------------------ */
/* Presentational pieces                                               */
/* ------------------------------------------------------------------ */

function PageHeader({ canCreate, onCreate }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
      <div>
        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
          Cash Requests & Advances
        </h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Submit cash requisitions and process the Team Leader approval and Fund Custodian
          disbursement pipeline.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
          Export
        </Button>
        {canCreate && (
          <Button variant="primary" onClick={onCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Cash Request
          </Button>
        )}
      </div>
    </div>
  )
}

function MetricsBanner({ cards, walletCard }) {
  const allCards = walletCard ? [...cards, walletCard] : cards
  const columns = allCards.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${columns} gap-3 shrink-0`}>
      {allCards.map((card) => (
        <StatCard key={card.title} {...card} />
      ))}
    </div>
  )
}

function TableLoading() {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
      <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
      <p className="text-xs font-medium text-slate-500">Loading cash requests...</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function CashRequestPage() {
  /* ── Current user ─────────────────────────────────────────────── */
  const { user: currentUser } = useAuth()
  const userRole = currentUser?.access_name || null
  const positionName = currentUser?.position_name || currentUser?.position || ''

  // Local id (master_employee.me_id): used for our own backend.
  const currentEmployeeId = currentUser?.employee_id || currentUser?.id || null
  // HRMIS code: Slink identifies agents by this, not the local id.
  const slinkEmployeeId = currentUser?.employee_code || null

  const canCreate = CREATE_ROLES.includes(userRole)
  const showStatusFilter = STATUS_FILTER_ROLES.includes(userRole)

  /* ── UI state ─────────────────────────────────────────────────── */
  const [dateRange, setDateRange] = useState(getTodayRange)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])
  const [modal, setModal] = useState(CLOSED_MODAL)
  const { toast, showToast, closeToast } = useToast()

  const openModal = useCallback((type, request = null) => setModal({ type, request }), [])
  const closeModal = useCallback(() => setModal(CLOSED_MODAL), [])

  /* ── Data ─────────────────────────────────────────────────────── */
  const {
    revolvingFunds,
    departments,
    employees,
    particulars,
    activeProjects,
    teamLeads,
    getDepartmentName,
    getEmployeeName,
    getFundLabel,
    searchParticulars,
  } = useCashRequestLookups()

  const {
    requests = [],
    metrics = {},
    isLoading,
    isMutating,
    fetchCashRequests,
    createRequest,
    editRequest,
    approveRequest,
    rejectRequest,
    disburseRequest,
  } = useCashRequests({
    role: userRole,
    employeeId: currentEmployeeId,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  })

  const { districts, modes, searchStores, searchModes } = useLiquidationMasterData()
  const eligibility = useCashRequestEligibility(currentEmployeeId, requests)

  /* ── Slink: request type ──────────────────────────────────────── */
  // Open ticket -> TRAVEL EXPENSES, otherwise BUDGET (not chosen by the user).
  // Only creators need this, so other roles never call Slink for it.
  const ticketRequired = isTicketRequiredPosition(positionName)
  const {
    ticketStatus,
    requestType,
    error: ticketError,
    refresh: refreshTicketStatus,
  } = useSlinkTicketStatus({
    employeeId: slinkEmployeeId,
    ticketRequired,
    enabled: canCreate,
  })

  /* ── Liquidation ──────────────────────────────────────────────── */
  const { checkLiquidation, isChecking: isCheckingLiquidation } = useSlinkLiquidationCheck({
    employeeId: slinkEmployeeId,
    positionName,
  })

  // Refetch after a liquidation is created so the row's liquidation_id /
  // liquidation_status (and the Liquidate button) update.
  const {
    liquidateTarget,
    isLiquidating,
    liquidationView,
    openLiquidate,
    closeLiquidate,
    createLiquidation,
    viewLiquidation,
    closeLiquidationView,
  } = useLiquidationWorkflow({ onLiquidationCreated: fetchCashRequests })

  const { ticketRows, handleLiquidate, handleCloseLiquidate } = useLiquidationGate({
    checkLiquidation,
    isChecking: isCheckingLiquidation,
    openLiquidate,
    closeLiquidate,
    showToast,
  })

  /* ── Handlers: create / edit ──────────────────────────────────── */
  const handleCreateClick = useCallback(() => {
    // Slink couldn't be reached (or is still answering): don't guess the
    // request type. Retry and let the user try again.
    if (ticketStatus === TICKET_STATUS.UNKNOWN) {
      showToast(
        ticketError ? MESSAGES.ticketFailed(ticketError) : MESSAGES.ticketChecking,
        'warning',
      )
      refreshTicketStatus()
      return
    }
    if (!eligibility.eligible) {
      showToast(eligibility.message || MESSAGES.notEligible, 'warning')
      return
    }
    openModal('create')
  }, [ticketStatus, ticketError, eligibility, openModal, showToast, refreshTicketStatus])

  // Inject the Slink-derived request_type into the payload. The backend still
  // forces Rotation/Pick-up to TRAVEL EXPENSES and falls back to its purpose
  // regex if no type is sent.
  const handleCreateRequest = useCallback(
    async (payload) => {
      const result = await createRequest({ ...payload, request_type: requestType })
      if (result?.success) refreshTicketStatus()
      return result
    },
    [createRequest, requestType, refreshTicketStatus],
  )

  // When Slink is unreachable, omit request_type so the backend keeps the stored one.
  const handleUpdateRequest = useCallback(
    (payload) =>
      editRequest(
        payload.id,
        ticketStatus === TICKET_STATUS.UNKNOWN
          ? payload
          : { ...payload, request_type: requestType },
      ),
    [editRequest, ticketStatus, requestType],
  )

  /* ── Derived data ─────────────────────────────────────────────── */
  const filteredRequests = useMemo(
    () => filterRequests(requests, { searchTerm, statusFilter, getEmployeeName }),
    [requests, searchTerm, statusFilter, getEmployeeName],
  )

  const columns = useMemo(
    () =>
      createRequestColumns({
        userRole,
        currentEmployeeId,
        onView: (row) => openModal('view', row),
        onEdit: (row) => openModal('edit', row),
        onApprove: (row) => openModal('approve', row),
        onComplete: (row) => openModal('disburse', row),
        onLiquidate: handleLiquidate,
        onViewLiquidation: viewLiquidation,
        getEmployeeName,
        getDepartmentName,
        getFundLabel,
      }),
    [
      userRole,
      currentEmployeeId,
      openModal,
      handleLiquidate,
      viewLiquidation,
      getEmployeeName,
      getDepartmentName,
      getFundLabel,
    ],
  )

  const metricCards = useMemo(() => buildCashRequestMetricCards(metrics), [metrics])

  /* ── Wallet ───────────────────────────────────────────────────── */
  // Refetch when any request's status/liquidation state changes.
  const walletRefreshKey = useMemo(
    () =>
      requests
        .map((r) => `${r.id}:${r.status}:${r.disbursement_status}:${r.liquidation_status}`)
        .join('|'),
    [requests],
  )
  const { wallet } = useCashRequestWallet(canCreate ? currentEmployeeId : null, walletRefreshKey)

  const walletCard = useMemo(
    () =>
      canCreate
        ? {
            title: 'My Wallet',
            value: formatCurrency(wallet.balance),
            icon: Wallet,
            subtitle: wallet.balance > 0 ? 'Cash on hand' : 'No cash on hand',
            variant: 'emerald',
          }
        : null,
    [canCreate, wallet.balance],
  )

  const toolbarFilters = showStatusFilter ? [buildStatusFilter(statusFilter, setStatusFilter)] : []

  const emptyMessage =
    searchTerm || statusFilter !== 'ALL'
      ? 'No cash requests match your filter criteria.'
      : 'No cash requests found.'

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        variant={toast.variant}
        onClose={closeToast}
      />

      <PageHeader canCreate={canCreate} onCreate={handleCreateClick} />

      <MetricsBanner cards={metricCards} walletCard={walletCard} />

      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Reference, Project, Purpose, Requester..."
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        filters={toolbarFilters}
      />

      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <TableLoading />
        ) : (
          <DataTable
            columns={columns}
            data={filteredRequests}
            keyExtractor={(row) => row.id}
            selectable
            selectedRows={selectedIds}
            onSelectionChange={setSelectedIds}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={emptyMessage}
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>
                  Showing {filteredRequests.length} entries
                  {selectedIds.length > 0 && ` (${selectedIds.length} selected)`}
                </span>
              </div>
            }
          />
        )}
      </div>

      {/* Request modals */}
      {(modal.type === 'create' || modal.type === 'edit') && (
        <CreateCashRequestModal
          isOpen
          onClose={closeModal}
          onCreate={handleCreateRequest}
          onUpdate={handleUpdateRequest}
          isSubmitting={isMutating}
          currentUser={currentUser}
          employees={employees}
          departments={departments}
          projects={activeProjects}
          teamLeads={teamLeads}
          editingRequest={modal.type === 'edit' ? modal.request : null}
        />
      )}

      {modal.type === 'view' && (
        <ViewCashRequestModal
          isOpen
          onClose={closeModal}
          request={modal.request}
          getEmployeeName={getEmployeeName}
          getDepartmentName={getDepartmentName}
          getFundLabel={getFundLabel}
        />
      )}

      {modal.type === 'approve' && (
        <ApproveCashRequestModal
          isOpen
          onClose={closeModal}
          request={modal.request}
          onApprove={(payload) => approveRequest(modal.request.id, payload)}
          onReject={(payload) => rejectRequest(modal.request.id, payload)}
          isSubmitting={isMutating}
          getDepartmentName={getDepartmentName}
          getEmployeeName={getEmployeeName}
        />
      )}

      {modal.type === 'disburse' && (
        <DisburseCashRequestModal
          isOpen
          onClose={closeModal}
          cashRequest={modal.request}
          revolvingFunds={revolvingFunds}
          onDisburse={(payload) => disburseRequest(modal.request.id, payload)}
          onReject={(payload) => rejectRequest(modal.request.id, payload)}
          isSubmitting={isMutating}
          getFundLabel={getFundLabel}
          getEmployeeName={getEmployeeName}
        />
      )}

      {/* Liquidation modals */}
      {liquidateTarget && (
        <CreateLiquidationModal
          isOpen
          onClose={handleCloseLiquidate}
          onCreate={createLiquidation}
          isSubmitting={isLiquidating}
          cashRequest={liquidateTarget}
          liquidationType={getLiquidationTypeForRequest(liquidateTarget)}
          ticketRows={ticketRows}
          cashReceived={liquidateTarget.disbursement_amount}
          districts={districts}
          particulars={particulars}
          modes={modes}
          searchStores={searchStores}
          searchParticulars={searchParticulars}
          searchModes={searchModes}
        />
      )}

      {liquidationView && (
        <ViewLiquidationModal
          isOpen
          onClose={closeLiquidationView}
          liquidation={liquidationView.detail}
          activity={liquidationView.activity}
          getEmployeeName={getEmployeeName}
        />
      )}
    </div>
  )
}
