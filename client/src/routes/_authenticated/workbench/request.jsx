import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback } from 'react'
import DataTable from '../../../components/ui/DataTable'
import TableToolbar from '../../../components/ui/TableToolbar'
import Toast from '../../../components/ui/Toast'
import { getTodayRange } from '../../../utils/dateRange'
import { getLiquidationTypeForRequest } from '../../../utils/requestType'
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

export const Route = createFileRoute('/_authenticated/workbench/request')({
  component: CashRequestPage,
})

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

  // Toast State
  const [toast, setToast] = useState({ isOpen: false, message: '', variant: 'warning' })
  const showToast = (message, variant = 'warning') => {
    setToast({ isOpen: true, message, variant })
  }

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
    if (!eligibility.eligible) {
      showToast(
        eligibility.message ||
          'You cannot create a new Cash Request until your previous Cash Request has been fully liquidated.',
        'warning',
      )
      return
    }
    openModal('create')
  }, [eligibility, openModal])

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
          liquidationType={getLiquidationTypeForRequest(liquidateTarget)}
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
