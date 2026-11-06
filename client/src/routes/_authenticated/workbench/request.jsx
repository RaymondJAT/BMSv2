import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import TableToolbar from '../../../components/ui/TableToolbar'
import Toast from '../../../components/ui/Toast'
import { getTodayRange } from '../../../utils/dateRange'
import { getLiquidationTypeForRequest } from '../../../utils/requestType'
import { isTicketRequiredPosition } from '../../../utils/liquidationTickets'
import StatCard from '../../../components/ui/StatCard'
import { Plus, FileSpreadsheet, Loader2 } from 'lucide-react'
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

export const Route = createFileRoute('/_authenticated/workbench/request')({
  component: CashRequestPage,
})

const CREATE_ROLES = ['ADMINISTRATOR', 'REQUESTER']
const STATUS_FILTER_ROLES = ['ADMINISTRATOR', 'REQUESTER', 'DEVELOPER']

function CashRequestPage() {
  const { user: currentUser } = useAuth()
  const userRole = currentUser?.access_name || null
  const currentEmployeeId = currentUser?.employee_id || currentUser?.id || null
  const positionName = currentUser?.position_name || currentUser?.position || ''

  const canCreate = CREATE_ROLES.includes(userRole)
  const showStatusFilter = STATUS_FILTER_ROLES.includes(userRole)

  const [dateRange, setDateRange] = useState(getTodayRange)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])

  // Toast State
  const [toast, setToast] = useState({ isOpen: false, message: '', variant: 'warning' })
  const showToast = useCallback((message, variant = 'warning') => {
    setToast({ isOpen: true, message, variant })
  }, [])

  // ── Slink ────────────────────────────────────────────────────────
  const ticketRequired = isTicketRequiredPosition(positionName)

  // Open ticket -> TRAVEL EXPENSES, otherwise BUDGET (not chosen by the user).
  // Only creators need this, so other roles never call Slink for it.
  const {
    ticketStatus,
    requestType,
    refresh: refreshTicketStatus,
  } = useSlinkTicketStatus({
    employeeId: currentEmployeeId,
    ticketRequired,
    enabled: canCreate,
  })

  const { checkLiquidation, isChecking: isCheckingLiquidation } = useSlinkLiquidationCheck({
    employeeId: currentEmployeeId,
    positionName,
  })

  // Ticket rows prefilled into the liquidation form (travel requests only).
  const [ticketRows, setTicketRows] = useState([])

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

  const [modal, setModal] = useState({ type: null, request: null })
  const openModal = useCallback((type, request = null) => setModal({ type, request }), [])
  const closeModal = useCallback(() => setModal({ type: null, request: null }), [])

  const handleCreateClick = useCallback(() => {
    // Slink couldn't be reached (or is still answering): don't guess the
    // request type. Retry and let the user try again.
    if (ticketStatus === TICKET_STATUS.UNKNOWN) {
      showToast('Checking your ticket status with Slink — please try again in a moment.', 'warning')
      refreshTicketStatus()
      return
    }
    if (!eligibility.eligible) {
      showToast(
        eligibility.message ||
          'You cannot create a new Cash Request until your previous Cash Request has been fully liquidated.',
        'warning',
      )
      return
    }
    openModal('create')
  }, [ticketStatus, eligibility, openModal, showToast, refreshTicketStatus])

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

  // Liquidate: ask Slink first. Only open the modal when allowed.
  const handleLiquidate = useCallback(
    async (row) => {
      if (isCheckingLiquidation) return
      const result = await checkLiquidation(row)

      if (result.error) {
        showToast('Could not reach Slink to verify tickets. Please try again.', 'warning')
        return
      }
      if (!result.allowed) {
        showToast(
          "Slink hasn't cleared this request for liquidation yet. Resolve your open tickets first.",
          'warning',
        )
        return
      }

      setTicketRows(result.rows)
      openLiquidate(row)
    },
    [checkLiquidation, isCheckingLiquidation, openLiquidate, showToast],
  )

  const handleCloseLiquidate = useCallback(() => {
    setTicketRows([])
    closeLiquidate()
  }, [closeLiquidate])

  const handleSelectionChange = useCallback((keys) => setSelectedIds(keys), [])

  const filteredRequests = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return requests.filter((req) => {
      const requesterName = getEmployeeName(req.employee_id).toLowerCase()
      const matchesSearch =
        (req.reference_id || '').toLowerCase().includes(q) ||
        (req.project || '').toLowerCase().includes(q) ||
        (req.purpose || '').toLowerCase().includes(q) ||
        requesterName.includes(q)
      const matchesStatus =
        statusFilter === 'ALL' || String(req.status || '').toUpperCase() === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [requests, searchTerm, statusFilter, getEmployeeName])

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

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Custom Toast Notification */}
      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Header */}
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
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={handleCreateClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E31837] hover:bg-[#c4122e] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              New Cash Request
            </button>
          )}
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {metricCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      {/* Toolbar & Filters */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Reference, Project, Purpose, Requester..."
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        filters={
          showStatusFilter
            ? [
                {
                  key: 'status',
                  label: 'Status',
                  value: statusFilter,
                  onChange: setStatusFilter,
                  options: [
                    { value: 'ALL', label: 'All Statuses' },
                    { value: 'PENDING', label: 'Pending Team Leader' },
                    { value: 'APPROVED', label: 'Pending Fund Custodian' },
                    { value: 'COMPLETED', label: 'Completed' },
                    { value: 'REJECTED', label: 'Rejected' },
                  ],
                },
              ]
            : []
        }
      />

      {/* Data Table */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading cash requests...</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRequests}
            keyExtractor={(row) => row.id}
            selectable={true}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No cash requests match your filter criteria.'
                : 'No cash requests found.'
            }
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

      {/* Modals */}
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
