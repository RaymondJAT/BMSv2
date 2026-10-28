import { useState, useEffect, useMemo, useRef } from 'react'
import { Image } from 'antd'
import { Modal } from '../../components/ui/Modal'
import { Plus, Trash2, Upload, X, Copy, ListPlus, AlertTriangle } from 'lucide-react'
import RemoteSearchSelect from '../../components/ui/RemoteSearchSelect'

const formatCurrency = (val) =>
  `₱${parseFloat(val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const MAX_FILE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const emptyItem = () => ({
  date: new Date().toISOString().slice(0, 10),
  rt: '',
  store_name: '',
  particulars: '',
  purpose: '',
  from: '',
  to: '',
  mode_of_transportation_id: '',
  amount: '',
  receipts: [],
})

const TRAVEL_GRID_COLS =
  'grid-cols-[110px_70px_190px_260px_260px_170px_170px_160px_110px_160px_110px]'
// fr-based, not fixed px — MISC_GRID_COLS' container is w-full (see below),
// so these need to actually stretch to fill it. Fixed px columns here was
// the bug: they summed to less than the modal's real width and just left
// blank space on the right instead of growing to fill it.
const MISC_GRID_COLS = 'grid-cols-[110px_2.5fr_2fr_120px_180px_110px]'

/**
 * One line's own field-level validation problems — required fields only.
 * The itinerary/chain rule (From must continue from the previous line's
 * To, and the trip must arrive at Store by its last leg) is a SEPARATE,
 * cross-row check — see getChainIssues below — since it can't be decided
 * by looking at one line in isolation.
 */
function getItemIssues(it, isTravel, isEditMode) {
  const issues = []
  if (!it.date) issues.push('Date is required')
  if (!it.particulars) issues.push('Particulars is required')
  if (!it.purpose?.trim()) issues.push('Purpose is required')

  if (isTravel) {
    if (!it.rt) issues.push('RT# is required')
    if (!it.store_name) issues.push('Store is required')
    if (!it.from) issues.push('From is required')
    if (!it.to) issues.push('To is required')
    if (!it.mode_of_transportation_id) issues.push('Mode of transportation is required')
  }

  if (!parseFloat(it.amount) || parseFloat(it.amount) <= 0) {
    issues.push('Amount must be greater than zero')
  }
  if (!isEditMode && (!it.receipts || it.receipts.length === 0)) {
    issues.push('At least one receipt is required')
  }

  return issues
}

/**
 * Itinerary/chain flag rule, across all lines: consecutive lines that
 * share the same Store Name form ONE trip made of one or more legs
 * (e.g. Store: PACITA — leg 1 VILLAGE→SAMPLE, leg 2 SAMPLE→PACITA).
 * Within each such group:
 *   - every leg after the first must start (From) exactly where the
 *     previous leg ended (To) — the chain can't skip or jump
 *   - the LAST leg in the group must end (To) at the group's Store —
 *     the trip has to actually arrive there
 * A group's first leg's From is never checked — that's the trip's real
 * starting point (village/home base), not something tied to the store.
 * Only contiguous rows with the same store_name form a group, so two
 * separate trips to the same store with something else in between are
 * validated as two independent single-leg trips, not one broken chain.
 * Returns { [itemIndex]: string[] } to merge alongside getItemIssues.
 */
function getChainIssues(items) {
  const chainIssues = {}
  const flag = (index, message) => {
    if (!chainIssues[index]) chainIssues[index] = []
    chainIssues[index].push(message)
  }

  let groupStart = 0
  for (let i = 1; i <= items.length; i++) {
    const sameGroup =
      i < items.length &&
      items[i].store_name &&
      items[i].store_name === items[groupStart].store_name
    if (sameGroup) continue

    // Group is items[groupStart..i-1] — validate its chain, then start
    // the next group at i.
    for (let j = groupStart + 1; j < i; j++) {
      const prevTo = items[j - 1].to
      if (prevTo && items[j].from && items[j].from !== prevTo) {
        flag(j, `From must continue from the previous line's To (${prevTo})`)
      }
    }
    const lastIndex = i - 1
    const last = items[lastIndex]
    if (last.store_name && last.to && last.to !== last.store_name) {
      flag(lastIndex, `To must arrive at Store (${last.store_name}) to complete the trip`)
    }

    groupStart = i
  }

  return chainIssues
}

// Small badge shown on a line with problems — icon + native title tooltip
// listing exactly what's wrong, so the person doesn't have to guess from
// a single form-level message which line and which field to fix.
function LineErrorBadge({ issues }) {
  if (!issues || issues.length === 0) return null
  return (
    <span
      className="absolute -top-2 -left-2 z-20 flex items-center justify-center w-5 h-5 bg-red-600 text-white rounded-full shadow-xs cursor-help"
      title={issues.join('\n')}
    >
      <AlertTriangle className="w-3 h-3" />
    </span>
  )
}

export default function CreateLiquidationModal({
  isOpen,
  onClose,
  onCreate,
  onUpdate,
  isSubmitting,
  cashRequest,
  cashReceived,
  editingLiquidation = null,
  districts = [],
  particulars = [],
  modes = [],
  searchStores,
  searchParticulars,
  searchModes,
}) {
  const isEditMode = Boolean(editingLiquidation)

  const [liquidationType, setLiquidationType] = useState('TRAVEL')
  const [items, setItems] = useState([emptyItem()])
  const [formError, setFormError] = useState(null)
  // { [itemIndex]: string[] } — only ever set on a submit attempt, and
  // cleared per-line the moment that line is edited (see updateItem) or
  // entirely on any structural change (add/remove/duplicate/insert),
  // since indexes shift and a stale error mapped to the wrong row would
  // be actively misleading.
  const [lineErrors, setLineErrors] = useState({})
  const rowRefs = useRef({})

  const initialStoreOptions = useMemo(
    () =>
      districts.map((d) => ({
        value: d.store_name,
        label: d.store_number ? `${d.store_number} ${d.store_name}` : d.store_name,
      })),
    [districts],
  )

  const initialLocationOptions = useMemo(
    () =>
      districts.map((d) => ({
        value: d.store_name,
        label: d.store_number ? `${d.store_number} ${d.store_name}` : d.store_name,
      })),
    [districts],
  )

  const particularOptions = useMemo(
    () =>
      particulars.map((p) => ({
        value: p.id,
        label: `${p.code ? p.code + ' ' : ''}${p.name || p.description}`,
      })),
    [particulars],
  )

  const modeOptions = useMemo(() => modes.map((m) => ({ value: m.id, label: m.name })), [modes])

  const searchParticularsLocal = async (term) => {
    const lower = term.toLowerCase()
    return particularOptions.filter((o) => o.label.toLowerCase().includes(lower))
  }
  const searchModesLocal = async (term) => {
    const lower = term.toLowerCase()
    return modeOptions.filter((o) => o.label.toLowerCase().includes(lower))
  }

  const resolvedSearchParticulars = searchParticulars || searchParticularsLocal
  const resolvedSearchModes = searchModes || searchModesLocal

  useEffect(() => {
    if (!isOpen) {
      setLiquidationType('TRAVEL')
      setItems([emptyItem()])
      setFormError(null)
      setLineErrors({})
      return
    }
    if (editingLiquidation) {
      const editItems = editingLiquidation.items || []
      setLiquidationType(editItems[0]?.type === 'MISCELLANEOUS' ? 'MISCELLANEOUS' : 'TRAVEL')
      setItems(
        editItems.length
          ? editItems.map((it) => ({
              date: it.date?.slice(0, 10) || '',
              rt: it.rt || '',
              store_name: it.store_name || '',
              particulars: it.particulars || '',
              purpose: it.purpose || '',
              from: it.from || '',
              to: it.to || '',
              mode_of_transportation_id: it.mode_of_transportation_id || '',
              amount: it.amount ?? '',
              receipts: Array.isArray(it.receipts) ? it.receipts : [],
            }))
          : [emptyItem()],
      )
      setLineErrors({})
    }
  }, [isOpen, editingLiquidation])

  const cashReceivedAmount =
    parseFloat(isEditMode ? editingLiquidation?.amount_obtained : cashReceived) || 0

  const totalExpended = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0),
    [items],
  )
  const difference = Math.round((cashReceivedAmount - totalExpended) * 100) / 100
  const summaryLabel =
    difference > 0 ? 'Cash to Return' : difference < 0 ? 'Reimbursement' : 'Fully Liquidated'

  const handleTypeChange = (newType) => {
    setLiquidationType(newType)
    setLineErrors({})
    if (newType === 'MISCELLANEOUS') {
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          rt: '',
          store_name: '',
          from: '',
          to: '',
          mode_of_transportation_id: '',
        })),
      )
    }
  }

  const updateItem = (index, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
    // Clear this line's flags optimistically the moment it's touched —
    // they're re-evaluated fresh on the next submit attempt anyway.
    setLineErrors((prev) => {
      if (!prev[index]) return prev
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const addItem = () => {
    setItems((prev) => [...prev, emptyItem()])
    setLineErrors({})
  }

  const removeItem = (index) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
    setLineErrors({})
  }

  const duplicateItem = (index) => {
    setItems((prev) => {
      const source = prev[index]
      const duplicate = {
        ...emptyItem(),
        date: source.date,
        rt: source.rt,
        store_name: source.store_name,
        purpose: source.purpose,
      }
      const next = [...prev]
      next.splice(index + 1, 0, duplicate)
      return next
    })
    setLineErrors({})
  }

  const insertItemAfter = (index) => {
    setItems((prev) => {
      const next = [...prev]
      next.splice(index + 1, 0, emptyItem())
      return next
    })
    setLineErrors({})
  }

  const handleItemReceiptsChange = (index, files) => {
    setFormError(null)
    if (!files || files.length === 0) return

    const fileList = Array.from(files)
    for (const file of fileList) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setFormError(`File "${file.name}" must be a JPEG, PNG, or WEBP image.`)
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        setFormError(`File "${file.name}" exceeds the 5MB limit.`)
        return
      }
    }

    const readPromises = fileList.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.readAsDataURL(file)
        }),
    )

    Promise.all(readPromises).then((newImages) => {
      setItems((prev) =>
        prev.map((it, i) =>
          i === index ? { ...it, receipts: [...(it.receipts || []), ...newImages] } : it,
        ),
      )
      setLineErrors((prev) => {
        if (!prev[index]) return prev
        const next = { ...prev }
        delete next[index]
        return next
      })
    })
  }

  const removeItemReceipt = (index, receiptIndex) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, receipts: it.receipts.filter((_, ri) => ri !== receiptIndex) } : it,
      ),
    )
  }

  const isTravel = liquidationType === 'TRAVEL'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    const errorsByIndex = {}
    items.forEach((it, index) => {
      const issues = getItemIssues(it, isTravel, isEditMode)
      if (issues.length > 0) errorsByIndex[index] = issues
    })
    if (isTravel) {
      const chainIssues = getChainIssues(items)
      Object.entries(chainIssues).forEach(([index, issues]) => {
        errorsByIndex[index] = [...(errorsByIndex[index] || []), ...issues]
      })
    }
    setLineErrors(errorsByIndex)

    const errorIndexes = Object.keys(errorsByIndex)
    if (errorIndexes.length > 0) {
      setFormError(
        errorIndexes.length === 1
          ? `Line ${Number(errorIndexes[0]) + 1} has a problem — see the highlighted row below.`
          : `${errorIndexes.length} lines have problems — see the highlighted rows below.`,
      )
      rowRefs.current[errorIndexes[0]]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    const derivedDescription = isEditMode
      ? editingLiquidation.description
      : cashRequest?.purpose ||
        cashRequest?.project ||
        `Liquidation for ${cashRequest?.reference_id || cashRequest?.id}`

    const itemsWithType = items.map((it) => ({ ...it, type: liquidationType }))
    const allReceipts = itemsWithType.flatMap((it) => it.receipts || [])
    const payload = {
      items: itemsWithType,
      receipts: allReceipts,
      receipt: allReceipts[0] || '',
      ...(isEditMode ? {} : { description: derivedDescription }),
    }

    const result = isEditMode
      ? await onUpdate({ id: editingLiquidation.id, ...payload })
      : await onCreate({ cash_request_id: cashRequest.id, ...payload })

    if (result?.success) onClose()
    else
      setFormError(result?.message || `Failed to ${isEditMode ? 'update' : 'submit'} liquidation.`)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Liquidation' : 'New Liquidation'}
      subtitle={
        isEditMode
          ? `${editingLiquidation?.reference_id} — correct and resubmit`
          : `Against Cash Request ${cashRequest?.reference_id || `#${cashRequest?.id}`}`
      }
      fullScreen
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
        {/* TOP HEADER SECTION WITH TYPE SELECTION */}
        <div className="shrink-0 space-y-3 px-4 pt-4 border-b border-slate-200 pb-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Liquidation Type
              </label>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs">
                <button
                  type="button"
                  onClick={() => handleTypeChange('TRAVEL')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    isTravel
                      ? 'bg-[#E31837] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Travel
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('MISCELLANEOUS')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    !isTravel
                      ? 'bg-[#E31837] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Miscellaneous
                </button>
              </div>
            </div>
          </div>

          {formError && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
              {formError}
            </div>
          )}
          {isEditMode && ['REJECTED', 'INCOMPLETE'].includes(editingLiquidation?.status) && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg font-medium">
              This liquidation was returned as {editingLiquidation.status}. Correct the details and
              resubmit.
            </div>
          )}
        </div>

        {/* SCROLLABLE TABLE BODY */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Expense Lines ({items.length})
            </span>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#E31837] bg-red-50 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>

          <Image.PreviewGroup>
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
              {/* Travel has 11 wide columns and needs to overflow-scroll
                  (w-max shrink-wraps to that content). Miscellaneous has
                  6 columns and should fill the modal (w-full) — the
                  columns themselves use fr units above so they actually
                  stretch to that full width instead of stopping short. */}
              <div className={isTravel ? 'w-max p-2 space-y-2' : 'w-full p-2 space-y-2'}>
                {/* TABLE HEADER */}
                <div
                  className={`sticky top-0 z-10 bg-white grid gap-2 px-2 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 ${
                    isTravel ? TRAVEL_GRID_COLS : MISC_GRID_COLS
                  }`}
                >
                  {isTravel ? (
                    <>
                      <div>Date</div>
                      <div>RT #</div>
                      <div>Store Name</div>
                      <div>Particulars</div>
                      <div>Purpose</div>
                      <div>From</div>
                      <div>To</div>
                      <div>Transport</div>
                      <div>Amount</div>
                      <div>Receipts</div>
                      <div className="text-center">Actions</div>
                    </>
                  ) : (
                    <>
                      <div>Date</div>
                      <div>Particulars</div>
                      <div>Purpose</div>
                      <div>Amount</div>
                      <div>Receipts</div>
                      <div className="text-center">Actions</div>
                    </>
                  )}
                </div>

                {/* TABLE ROWS */}
                {items.map((it, index) => {
                  const issues = lineErrors[index]
                  const hasError = Boolean(issues?.length)
                  return (
                    <div
                      key={index}
                      ref={(el) => {
                        rowRefs.current[index] = el
                      }}
                      className={`relative grid gap-2 items-start p-1.5 rounded-lg border transition-colors ${
                        isTravel ? TRAVEL_GRID_COLS : MISC_GRID_COLS
                      } ${
                        hasError
                          ? 'bg-red-50/70 border-red-300 ring-1 ring-red-200'
                          : 'bg-slate-50/70 hover:bg-slate-100/60 border-slate-200/60'
                      }`}
                    >
                      <LineErrorBadge issues={issues} />

                      {/* Date Input */}
                      <div>
                        <input
                          type="date"
                          required
                          value={it.date}
                          onChange={(e) => updateItem(index, 'date', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-[#E31837]"
                        />
                      </div>

                      {/* Travel Fields */}
                      {isTravel && (
                        <>
                          <div>
                            <input
                              type="text"
                              placeholder="RT#"
                              required
                              value={it.rt}
                              onChange={(e) => updateItem(index, 'rt', e.target.value)}
                              className="w-full px-1.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-[#E31837]"
                            />
                          </div>
                          <div>
                            <RemoteSearchSelect
                              value={it.store_name}
                              onChange={(val) => updateItem(index, 'store_name', val)}
                              fetchOptions={searchStores}
                              initialOptions={initialStoreOptions}
                              placeholder="Store..."
                            />
                          </div>
                        </>
                      )}

                      {/* Particulars */}
                      <div>
                        <RemoteSearchSelect
                          value={it.particulars}
                          onChange={(val) => updateItem(index, 'particulars', val)}
                          fetchOptions={resolvedSearchParticulars}
                          initialOptions={particularOptions}
                          placeholder="Select Particular..."
                        />
                      </div>

                      {/* Purpose */}
                      <div>
                        <input
                          type="text"
                          placeholder="What was this for?"
                          required
                          value={it.purpose}
                          onChange={(e) => updateItem(index, 'purpose', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-[#E31837]"
                        />
                      </div>

                      {/* Travel-only Location and Transport Inputs */}
                      {isTravel && (
                        <>
                          <div>
                            <RemoteSearchSelect
                              value={it.from}
                              onChange={(val) => updateItem(index, 'from', val)}
                              fetchOptions={searchStores}
                              initialOptions={initialLocationOptions}
                              placeholder="From..."
                            />
                          </div>
                          <div>
                            <RemoteSearchSelect
                              value={it.to}
                              onChange={(val) => updateItem(index, 'to', val)}
                              fetchOptions={searchStores}
                              initialOptions={initialLocationOptions}
                              placeholder="To..."
                            />
                          </div>
                          <div>
                            <RemoteSearchSelect
                              value={it.mode_of_transportation_id}
                              onChange={(val) =>
                                updateItem(index, 'mode_of_transportation_id', val)
                              }
                              fetchOptions={resolvedSearchModes}
                              initialOptions={modeOptions}
                              placeholder="Mode..."
                            />
                          </div>
                        </>
                      )}

                      {/* Amount Field - Arrow hidden & blocked invalid characters */}
                      <div>
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                            ₱
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            placeholder="0.00"
                            value={it.amount}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-'].includes(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            onChange={(e) => updateItem(index, 'amount', e.target.value)}
                            className="w-full pl-4 pr-1.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-[#E31837] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      </div>

                      {/* Receipt Upload & Previews - Remove icon positioned outside */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap py-1 max-w-full">
                          <label
                            className="inline-flex items-center justify-center h-8 px-2 gap-1 bg-white border border-slate-300 hover:border-slate-400 rounded-md cursor-pointer shrink-0 text-[11px] text-slate-600 font-medium"
                            title="Upload receipt(s) for this line"
                          >
                            <Upload className="w-3.5 h-3.5 text-slate-500" />
                            <input
                              type="file"
                              multiple
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => handleItemReceiptsChange(index, e.target.files)}
                              className="hidden"
                            />
                          </label>

                          {(it.receipts || []).map((src, ri) => (
                            <div
                              key={ri}
                              className="relative group w-8 h-8 rounded border border-slate-200 overflow-visible bg-slate-100 shrink-0"
                            >
                              <Image
                                src={src}
                                width={32}
                                height={32}
                                style={{ objectFit: 'cover', borderRadius: '4px' }}
                                preview={{
                                  mask: null,
                                }}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeItemReceipt(index, ri)
                                }}
                                className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-20 shadow-xs"
                                title="Remove"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex justify-center items-center gap-1 h-full">
                        <button
                          type="button"
                          onClick={() => duplicateItem(index)}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer shrink-0"
                          title="Duplicate line (copies Date, RT#, Store, and Purpose)"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertItemAfter(index)}
                          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer shrink-0"
                          title="Insert a blank line right after this one"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Image.PreviewGroup>
        </div>

        {/* BOTTOM FIXED FOOTER */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="flex items-center justify-between sm:justify-start sm:gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-slate-500 font-medium">Cash Received:</span>
              <span className="font-bold text-slate-800">{formatCurrency(cashReceivedAmount)}</span>
            </div>
            <div className="flex items-center justify-between sm:justify-start sm:gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-slate-500 font-medium">Total Liquidated:</span>
              <span className="font-bold text-slate-800">{formatCurrency(totalExpended)}</span>
            </div>
            <div className="flex items-center justify-between sm:justify-start sm:gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="font-bold text-slate-700">{summaryLabel}:</span>
              <span
                className={`font-extrabold ${difference < 0 ? 'text-orange-600' : difference > 0 ? 'text-blue-600' : 'text-emerald-600'}`}
              >
                {formatCurrency(Math.abs(difference))}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-1.5 bg-[#E31837] hover:bg-[#c4122e] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting
                ? isEditMode
                  ? 'Resubmitting...'
                  : 'Submitting...'
                : isEditMode
                  ? 'Resubmit Liquidation'
                  : 'Submit Liquidation'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
