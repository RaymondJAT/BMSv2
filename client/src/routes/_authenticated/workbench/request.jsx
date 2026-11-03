import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import TableToolbar from '../../../components/ui/TableToolbar'
import { getTodayRange } from '../../../utils/dateRange'
import StatCard from '../../../components/ui/StatCard'
import { Plus, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react'
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

export const Route = createFileRoute('/_authenticated/workbench/request')({
  component: CashRequestPage,
})

// Roles allowed to create/edit a Cash Request. Only Administrator sees
// the multi-status filter dropdown too — Team Leader/Fund Custodian/
// Finance are already server-scoped to one status by useCashRequests, so
// a status dropdown there would just offer choices that always return
// empty (see useCashRequests.js's roleParams).
const CREATE_ROLES = ['ADMINISTRATOR', 'REQUESTER']
const STATUS_FILTER_ROLES = ['ADMINISTRATOR', 'REQUESTER', 'DEVELOPER']

function CashRequestPage() {
  const { user: currentUser } = useAuth()
  const userRole = currentUser?.access_name || null
  const currentEmployeeId = currentUser?.employee_id || currentUser?.id || null

  const canCreate = CREATE_ROLES.includes(userRole)
  const showStatusFilter = STATUS_FILTER_ROLES.includes(userRole)

  const [dateRange, setDateRange] = useState(getTodayRange)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])

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
    error,
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

  // ── Modal state ──────────────────────────────────────────────────
  // One object instead of 4 separate booleans/values — "what's open and
  // for which row" is a single source of truth. `modal.type` is one of:
  // 'create' | 'edit' | 'view' | 'approve' | 'disburse' | null. The
  // Liquidate flow keeps its own state in useLiquidationWorkflow above,
  // since it's a distinct two-step flow with its own submitting state.
  const [modal, setModal] = useState({ type: null, request: null })
  const openModal = useCallback((type, request = null) => setModal({ type, request }), [])
  const closeModal = useCallback(() => setModal({ type: null, request: null }), [])

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
        onLiquidate: openLiquidate,
        onViewLiquidation: viewLiquidation,
        getEmployeeName,
        getDepartmentName,
        getFundLabel,
      }),
    [
      userRole,
      currentEmployeeId,
      openModal,
      openLiquidate,
      viewLiquidation,
      getEmployeeName,
      getDepartmentName,
      getFundLabel,
    ],
  )

  const metricCards = useMemo(() => buildCashRequestMetricCards(metrics), [metrics])

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
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

        <div className="flex flex-col items-end gap-1.5">
          {!eligibility.eligible && (
            <div className="w-full sm:w-auto p-2 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg font-medium max-w-xs text-right">
              {eligibility.message}
            </div>
          )}
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
                disabled={!eligibility.eligible}
                onClick={() => openModal('create')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E31837] hover:bg-[#c4122e] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                New Cash Request
              </button>
            )}
          </div>
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
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string'
                ? error
                : error?.message || 'Failed to fetch cash requests.'}
            </p>
            <button
              type="button"
              onClick={() => fetchCashRequests?.()}
              className="mt-3 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Retry
            </button>
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
          onCreate={createRequest}
          onUpdate={(payload) => editRequest(payload.id, payload)}
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
          onClose={closeLiquidate}
          onCreate={createLiquidation}
          isSubmitting={isLiquidating}
          cashRequest={liquidateTarget}
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
