import { useState, useEffect, useMemo } from 'react'
import { Modal } from '../../components/ui/Modal'
import { amountToWords } from '../../utils/numberToWords'

const getTodayDate = () => new Date().toISOString().slice(0, 10)

const PURPOSE_OPTIONS = [
  'Travel Allowance',
  'Purchase',
  'Meal Allowance',
  'Representation',
  'Miscellaneous',
  'Personal',
  'RFID/Fuel/Parking',
  'Maintenance',
  'Rotation/Pick-up',
]

const EMPTY_FORM = {
  project: '',
  purpose: '',
  amount: '',
  employee_id: '',
  department_id: '',
  position_name: '',
  team_lead: '',
  request_date: getTodayDate(),
}

export default function CreateCashRequestModal({
  isOpen,
  onClose,
  onCreate,
  onUpdate,
  isSubmitting,
  currentUser = null,
  employees = [],
  departments = [],
  projects = [],
  teamLeads = [],
  editingRequest = null,
}) {
  const isEditMode = Boolean(editingRequest)

  const [formData, setFormData] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setFormData(EMPTY_FORM)
      setFormError(null)
      return
    }

    if (editingRequest) {
      const employee = employees.find(
        (emp) => String(emp.id) === String(editingRequest.employee_id),
      )
      setFormData({
        project: editingRequest.project || '',
        purpose: editingRequest.purpose || '',
        amount: editingRequest.amount ?? '',
        employee_id: editingRequest.employee_id ?? '',
        department_id: editingRequest.department_id ?? '',
        position_name: employee?.position_name || employee?.position || '',
        team_lead: editingRequest.team_lead || '',
        request_date: getTodayDate(),
      })
    } else {
      const loggedInEmployee = employees.find(
        (emp) => String(emp.id) === String(currentUser?.employee_id || currentUser?.id),
      )

      const employeeId = loggedInEmployee?.id || currentUser?.employee_id || currentUser?.id || ''
      const departmentId = loggedInEmployee?.department_id || currentUser?.department_id || ''
      const positionName =
        loggedInEmployee?.position_name ||
        loggedInEmployee?.position ||
        currentUser?.position_name ||
        currentUser?.position ||
        ''

      setFormData({
        ...EMPTY_FORM,
        employee_id: employeeId,
        department_id: departmentId,
        position_name: positionName,
        request_date: getTodayDate(),
      })
    }
  }, [isOpen, editingRequest, currentUser, employees])

  const handleAmountKeyDown = (e) => {
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault()
    }
  }

  const amountInWords = useMemo(
    () => (formData.amount ? amountToWords(formData.amount) : ''),
    [formData.amount],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Amount must be greater than zero.')
      return
    }
    if (
      !formData.project ||
      !formData.purpose ||
      !formData.employee_id ||
      !formData.department_id ||
      !formData.team_lead
    ) {
      setFormError('Please fill out all required fields.')
      return
    }

    const payload = {
      project: formData.project,
      purpose: formData.purpose,
      amount,
      employee_id: formData.employee_id,
      department_id: formData.department_id,
      team_lead: formData.team_lead,
      request_date: formData.request_date,
    }

    const result = isEditMode
      ? await onUpdate({ id: editingRequest.id, ...payload })
      : await onCreate(payload)

    if (result?.success) {
      onClose()
    } else {
      setFormError(result?.message || `Failed to ${isEditMode ? 'update' : 'create'} cash request.`)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Cash Request' : 'New Cash Request'}
      subtitle={
        isEditMode
          ? `${editingRequest?.reference_id || `#${editingRequest?.id}`} — update and resubmit for review.`
          : 'Submit a cash requisition for operational expenses and processing.'
      }
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-3.5">
        {formError && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
            {formError}
          </div>
        )}

        {isEditMode && editingRequest?.status === 'REJECTED' && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg font-medium">
            This request was rejected. Correct the details below and resubmit — it will return to
            Team Leader approval.
          </div>
        )}

        {/* PROJECT & PURPOSE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Project <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.project}
              onChange={(e) => setFormData({ ...formData, project: e.target.value })}
              disabled={projects.length === 0}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">
                {projects.length === 0 ? 'No projects configured yet' : 'Select Project...'}
              </option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.name}>
                  {proj.name}
                </option>
              ))}
              {isEditMode &&
                formData.project &&
                !projects.some((p) => p.name === formData.project) && (
                  <option value={formData.project}>{formData.project} (archived)</option>
                )}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Purpose <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent transition-all cursor-pointer"
            >
              <option value="">Select Purpose...</option>
              {PURPOSE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {isEditMode && formData.purpose && !PURPOSE_OPTIONS.includes(formData.purpose) && (
                <option value={formData.purpose}>{formData.purpose} (custom)</option>
              )}
            </select>
          </div>
        </div>

        {/* REQUESTER & DEPARTMENT */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Requester
            </label>
            <select
              disabled
              value={formData.employee_id}
              className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 cursor-not-allowed appearance-none"
            >
              <option value="">Select Employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullname || emp.name || emp.full_name || `${emp.id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Department
            </label>
            <select
              disabled
              value={formData.department_id}
              className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 cursor-not-allowed appearance-none"
            >
              <option value="">Select Department...</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* POSITION & REQUEST DATE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Position
            </label>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              value={formData.position_name}
              placeholder="Auto-filled from Requester"
              className="w-full px-3 py-1.5 bg-slate-100/80 border border-slate-200/90 rounded-lg text-xs font-medium text-slate-600 cursor-not-allowed select-none focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Request Date
            </label>
            <input
              type="date"
              readOnly
              tabIndex={-1}
              value={formData.request_date}
              className="w-full px-3 py-1.5 bg-slate-100/80 border border-slate-200/90 rounded-lg text-xs font-medium text-slate-600 cursor-not-allowed select-none focus:outline-none pointer-events-none"
            />
          </div>
        </div>

        {/* TEAM LEAD & AMOUNT */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3">
          <div className="sm:col-span-8">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Team Leader <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.team_lead}
              onChange={(e) => setFormData({ ...formData, team_lead: e.target.value })}
              disabled={teamLeads.length === 0}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">
                {teamLeads.length === 0 ? 'No Team Leaders found' : 'Select Team Leader...'}
              </option>
              {teamLeads.map((tl) => (
                <option key={tl.id} value={tl.fullname || tl.name || tl.full_name}>
                  {tl.fullname || tl.name || tl.full_name || `${tl.id}`}
                </option>
              ))}
              {isEditMode &&
                formData.team_lead &&
                !teamLeads.some(
                  (tl) => (tl.fullname || tl.name || tl.full_name) === formData.team_lead,
                ) && (
                  <option value={formData.team_lead}>
                    {formData.team_lead} (no longer a Team Leader)
                  </option>
                )}
            </select>
          </div>
          <div className="sm:col-span-4">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                ₱
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={formData.amount}
                onKeyDown={handleAmountKeyDown}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full pl-6 pr-2.5 py-1.5 bg-slate-550 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent transition-all appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
        </div>

        {/* AMOUNT IN WORDS (Auto-derived, given clear labeling and wider visual presentation) */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Amount in Words{' '}
            <span className="text-[10px] font-normal text-slate-400">(Auto-generated)</span>
          </label>
          <input
            type="text"
            readOnly
            tabIndex={-1}
            value={amountInWords}
            placeholder="Auto-generated from Amount..."
            className="w-full px-3 py-1.5 bg-slate-100/80 border border-slate-200/90 rounded-lg text-xs font-semibold text-slate-600 italic cursor-not-allowed select-none focus:outline-none truncate"
          />
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-[#E31837] hover:bg-[#c4122e] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isSubmitting
              ? isEditMode
                ? 'Resubmitting...'
                : 'Submitting...'
              : isEditMode
                ? 'Resubmit Request'
                : 'Submit Request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
