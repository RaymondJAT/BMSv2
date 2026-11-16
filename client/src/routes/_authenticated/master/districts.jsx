import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import Button from '../../../components/ui/Button'
import TableToolbar from '../../../components/ui/TableToolbar'
import EditDistrictModal from '../../../features/district/EditDistrictModal'
import {
  FileSpreadsheet,
  FileUp,
  MapPin,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Eye,
  X,
} from 'lucide-react'
import { createDistrictsColumns } from '../../../table-columns/disctrictColumns'
import { useDistricts } from '../../../hooks/useDistricts'

export const Route = createFileRoute('/_authenticated/master/districts')({
  component: DistrictsPage,
})

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

const FIELD_LABELS = {
  store_name: 'name',
  region: 'region',
  city_province: 'city/province',
  status: 'status',
}

const showValue = (value) => (value === '' || value == null ? '—' : value)

// Counts shown in the sync result banner. Labels change for a preview.
const getSyncResultFields = (result) => {
  const isPreview = Boolean(result.dry_run)
  return [
    ['total_from_slink', 'From Slink'],
    ['pages', 'Pages'],
    ['received', 'Received'],
    ['matched', 'Matched ours'],
    ['updated', isPreview ? 'To update' : 'Updated'],
    ['unchanged', 'Already aligned'],
    ['inserted', isPreview ? 'To add' : 'Added'],
    ['not_in_slink', 'Ours, not in Slink'],
    ['skipped_no_store_no', 'Skipped (no store no.)'],
    ['skipped_duplicates', 'Skipped (duplicates)'],
  ]
}

export default function DistrictsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const fileInputRef = useRef(null)

  const {
    districts,
    isLoading,
    isSubmitting,
    isSyncing,
    syncResult,
    error,
    updateStatus,
    importDistricts,
    syncFromSlink,
    clearSyncResult,
  } = useDistricts()

  const handleEdit = useCallback((row) => {
    setSelectedDistrict(row)
    setIsEditOpen(true)
  }, [])

  const handleSelectionChange = useCallback((keys) => {
    setSelectedIds(keys)
  }, [])

  // Preview: shows what would change, saves nothing.
  const handlePreviewSync = useCallback(async () => {
    await syncFromSlink({ dryRun: true })
  }, [syncFromSlink])

  // Real sync: aligns our stores with Slink and adds any that are missing.
  const handleSyncFromSlink = useCallback(async () => {
    await syncFromSlink({ dryRun: false })
  }, [syncFromSlink])

  // Metrics calculation based on mdt_status
  const metrics = useMemo(() => {
    const total = districts.length
    const active = districts.filter(
      (d) => (d.mdt_status || d.status || 'ACTIVE').toUpperCase() === 'ACTIVE',
    ).length
    const inactive = total - active
    return { total, active, inactive }
  }, [districts])

  // Search & Filter supporting DB schema fields and sheet headers.
  // The API returns aliased keys (store_number, store_name, city_province),
  // so those are accepted alongside the raw mdt_* names.
  const filteredDistricts = useMemo(() => {
    return districts.filter((item) => {
      const q = searchTerm.toLowerCase()
      const storeNumber = String(
        item.mdt_store_number || item.store_number || item.code || '',
      ).toLowerCase()
      const storeName = String(
        item.mdt_store_name || item.store_name || item.name || '',
      ).toLowerCase()
      const region = String(item.mdt_region || item.region || '').toLowerCase()
      const cityProvince = String(item.mdt_city_province || item.city_province || '').toLowerCase()

      const matchesSearch =
        storeNumber.includes(q) ||
        storeName.includes(q) ||
        region.includes(q) ||
        cityProvince.includes(q)

      const currentStatus = (item.mdt_status || item.status || 'ACTIVE').toUpperCase()
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [districts, searchTerm, statusFilter])

  // CSV Export Handler - Maps directly to DB column names
  const handleExportCSV = useCallback(() => {
    const exportItems =
      selectedIds.length > 0
        ? districts.filter((d) => selectedIds.includes(d.mdt_id || d.id))
        : filteredDistricts

    if (!exportItems.length) return

    const headers = ['STORE NO.', 'STORE NAME', 'REGION', 'CITY PROVINCE', 'STATUS']
    const csvRows = [
      headers.join(','),
      ...exportItems.map((item) =>
        [
          `"${item.mdt_store_number || item.store_number || item.code || ''}"`,
          `"${(item.mdt_store_name || item.store_name || item.name || '').replace(/"/g, '""')}"`,
          `"${(item.mdt_region || item.region || '').replace(/"/g, '""')}"`,
          `"${(item.mdt_city_province || item.city_province || '').replace(/"/g, '""')}"`,
          `"${item.mdt_status || item.status || 'ACTIVE'}"`,
        ].join(','),
      ),
    ]

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `districts_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [selectedIds, districts, filteredDistricts])

  // Helper to normalize and map raw row object keys to DB payload standard
  const mapRowToDistrict = useCallback((rowObj, idx) => {
    const normalized = {}
    Object.keys(rowObj).forEach((k) => {
      const cleanKey = String(k)
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
      normalized[cleanKey] = rowObj[k]
    })

    const storeNo =
      normalized['store no.'] ||
      normalized['store no'] ||
      normalized['mdt_store_number'] ||
      normalized['code']
    const storeName = normalized['store name'] || normalized['mdt_store_name'] || normalized['name']
    const cityProvince =
      normalized['city province'] ||
      normalized['city/province'] ||
      normalized['city_province'] ||
      normalized['mdt_city_province']
    const rawStatus = normalized['status'] || normalized['mdt_status']

    return {
      mdt_store_number: storeNo ? String(storeNo).trim() : `STORE-${idx + 100}`,
      mdt_store_name: storeName ? String(storeName).trim() : 'Unnamed Store',
      mdt_region: '',
      mdt_city_province: cityProvince ? String(cityProvince).trim() : '',
      mdt_status: rawStatus ? String(rawStatus).trim().toUpperCase() : 'ACTIVE',
    }
  }, [])

  // Unified CSV & XLSX File Upload Handler
  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

      if (isExcel) {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          try {
            const buffer = evt.target?.result
            const workbook = XLSX.read(buffer, { type: 'array' })
            const firstSheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[firstSheetName]
            const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

            const parsedItems = rawData
              .filter((rowObj) =>
                Object.values(rowObj).some((val) => val !== null && String(val).trim() !== ''),
              )
              .map(mapRowToDistrict)

            if (parsedItems.length > 0) {
              await importDistricts(parsedItems)
            }
          } catch (err) {
            console.error('XLSX Import Error:', err)
          } finally {
            if (fileInputRef.current) fileInputRef.current.value = ''
          }
        }
        reader.readAsArrayBuffer(file)
      } else {
        // Fallback for CSV files via PapaParse
        Papa.parse(file, {
          header: true,
          skipEmptyLines: 'greedy',
          complete: async (results) => {
            if (!results.data || results.data.length === 0) return

            const parsedItems = results.data
              .filter((rowObj) =>
                Object.values(rowObj).some((val) => val && String(val).trim() !== ''),
              )
              .map(mapRowToDistrict)

            try {
              if (parsedItems.length > 0) {
                await importDistricts(parsedItems)
              }
            } catch (err) {
              console.error('CSV Import Error:', err)
            } finally {
              if (fileInputRef.current) fileInputRef.current.value = ''
            }
          },
          error: (err) => {
            console.error('PapaParse error:', err)
            if (fileInputRef.current) fileInputRef.current.value = ''
          },
        })
      }
    },
    [importDistricts, mapRowToDistrict],
  )

  const columns = useMemo(() => createDistrictsColumns({ onEdit: handleEdit }), [handleEdit])

  const toolbarFilters = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        value: statusFilter,
        onChange: setStatusFilter,
        options: STATUS_FILTER_OPTIONS,
      },
    ],
    [statusFilter],
  )

  const isBusy = isSubmitting || isSyncing
  const isPreviewResult = Boolean(syncResult?.dry_run)

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv, .xlsx, .xls"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Master Districts & Stores
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Manage regional store divisions, district store numbers, branches, and locations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" onClick={handlePreviewSync} disabled={isBusy}>
            <Eye className="w-3.5 h-3.5 text-slate-600 mr-1.5" />
            Preview
          </Button>
          <Button variant="outline" onClick={handleSyncFromSlink} disabled={isBusy}>
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 text-[#E31837] mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#E31837] mr-1.5" />
            )}
            {isSyncing ? 'Working...' : 'Sync from Slink'}
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
            <FileUp className="w-3.5 h-3.5 text-blue-600 mr-1.5" />
            Import File
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Slink sync progress / result */}
      {isSyncing && (
        <div className="shrink-0 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-600">
          <Loader2 className="w-4 h-4 text-[#E31837] animate-spin shrink-0" />
          Reading stores from Slink page by page. This can take a moment...
        </div>
      )}

      {syncResult && !isSyncing && (
        <div
          className={`shrink-0 max-h-64 overflow-y-auto rounded-xl border p-3 text-xs ${
            !syncResult.success
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : isPreviewResult
                ? 'bg-sky-50 border-sky-200 text-sky-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold">
                {!syncResult.success
                  ? isPreviewResult
                    ? 'Preview failed'
                    : 'Sync from Slink failed'
                  : isPreviewResult
                    ? 'Preview — nothing was saved'
                    : 'Sync from Slink completed'}
              </p>

              {!syncResult.success && (
                <p className="mt-0.5">
                  {syncResult.message}
                  {syncResult.error ? ` (${syncResult.error})` : ''}
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-semibold">
                {getSyncResultFields(syncResult)
                  .filter(
                    ([field]) => syncResult[field] !== undefined && syncResult[field] !== null,
                  )
                  .map(([field, label]) => (
                    <span key={field}>
                      {label}: {syncResult[field]}
                    </span>
                  ))}
              </div>

              {syncResult.warning && (
                <p className="mt-1.5 font-semibold text-amber-700">⚠️ {syncResult.warning}</p>
              )}

              {syncResult.sample_changes?.length > 0 && (
                <div className="mt-2">
                  <p className="font-bold">
                    {isPreviewResult ? 'Would add' : 'Added'} (in Slink, not in our list, first{' '}
                    {syncResult.sample_missing.length}):
                  </p>
                  <ul className="mt-0.5 space-y-0.5 list-disc pl-4">
                    {syncResult.sample_changes.map((item) => (
                      <li key={`${item.store_number}-${item.changes.map((c) => c.field).join('')}`}>
                        <span className="font-mono font-semibold">{item.store_number}</span>{' '}
                        {item.changes.map((c) => (
                          <span key={c.field} className="mr-2">
                            {FIELD_LABELS[c.field] || c.field}: {showValue(c.from)} →{' '}
                            <strong>{showValue(c.to)}</strong>
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {syncResult.sample_missing?.length > 0 && (
                <div className="mt-2">
                  <p className="font-bold">
                    In Slink but not in our list (first {syncResult.sample_missing.length}):
                  </p>
                  <ul className="mt-0.5 space-y-0.5 list-disc pl-4">
                    {syncResult.sample_missing.map((item) => (
                      <li key={item.store_number}>
                        <span className="font-mono font-semibold">{item.store_number}</span>{' '}
                        {showValue(item.store_name)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={clearSyncResult}
              className="p-1 rounded-md hover:bg-black/5 cursor-pointer shrink-0"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <StatCard
          title="Total Districts"
          value={metrics.total}
          icon={MapPin}
          subtitle="Registered store areas"
          variant="blue"
        />
        <StatCard
          title="Active Districts"
          value={metrics.active}
          icon={CheckCircle2}
          subtitle="Operational branches"
          variant="emerald"
        />
        <StatCard
          title="Inactive Districts"
          value={metrics.inactive}
          icon={XCircle}
          subtitle="Closed or pending"
          variant="amber"
        />
      </div>

      {/* Toolbar & Filters (Date range omitted automatically) */}
      <TableToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search Store No., Name, City/Province..."
        filters={toolbarFilters}
      />

      {/* Data Table */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200/80 p-6">
            <Loader2 className="w-6 h-6 text-[#E31837] animate-spin mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading districts & stores...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-rose-200 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
            <p className="text-sm font-bold text-slate-800">Error Loading Data</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {typeof error === 'string' ? error : error?.message || 'Failed to fetch districts.'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredDistricts}
            keyExtractor={(row) => row.mdt_id || row.id}
            selectable={false}
            selectedRows={selectedIds}
            onSelectionChange={handleSelectionChange}
            maxHeight="h-full"
            containerClassName="h-full flex flex-col min-h-0"
            emptyMessage={
              searchTerm || statusFilter !== 'ALL'
                ? 'No districts or stores match your search parameters.'
                : 'No districts found. Import a CSV or XLSX, or sync from Slink, to populate entries.'
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>
                  Showing {filteredDistricts.length} entries
                  {selectedIds.length > 0 && ` (${selectedIds.length} selected)`}
                </span>
              </div>
            }
          />
        )}
      </div>

      {/* Edit Status Modal */}
      <EditDistrictModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        district={selectedDistrict}
        onUpdateStatus={updateStatus}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
