import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import DataTable from '../../../components/ui/DataTable'
import StatCard from '../../../components/ui/StatCard'
import EditDistrictModal from '../../../features/district/EditDistrictModal'
import {
  Search,
  Filter,
  FileSpreadsheet,
  FileUp,
  MapPin,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createDistrictsColumns } from '../../../table-columns/disctrictColumns'
import { useDistricts } from '../../../hooks/useDistricts'

export const Route = createFileRoute('/_authenticated/master/districts')({
  component: DistrictsPage,
})

export default function DistrictsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedIds, setSelectedIds] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const fileInputRef = useRef(null)

  const { districts, isLoading, isSubmitting, error, updateStatus, importDistricts } =
    useDistricts()

  const handleEdit = useCallback((row) => {
    setSelectedDistrict(row)
    setIsEditOpen(true)
  }, [])

  const handleSelectionChange = useCallback((keys) => {
    setSelectedIds(keys)
  }, [])

  // Metrics calculation based on mdt_status
  const metrics = useMemo(() => {
    const total = districts.length
    const active = districts.filter(
      (d) => (d.mdt_status || d.status || 'ACTIVE').toUpperCase() === 'ACTIVE',
    ).length
    const inactive = total - active
    return { total, active, inactive }
  }, [districts])

  // Search & Filter supporting DB schema fields and sheet headers
  const filteredDistricts = useMemo(() => {
    return districts.filter((item) => {
      const q = searchTerm.toLowerCase()
      const storeNumber = String(item.mdt_store_number || item.code || '').toLowerCase()
      const storeName = String(item.mdt_store_name || item.name || '').toLowerCase()
      const region = String(item.mdt_region || item.region || '').toLowerCase()
      const cityProvince = String(item.mdt_city_province || '').toLowerCase()

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
          `"${item.mdt_store_number || item.code || ''}"`,
          `"${(item.mdt_store_name || item.name || '').replace(/"/g, '""')}"`,
          `"${(item.mdt_region || item.region || '').replace(/"/g, '""')}"`,
          `"${(item.mdt_city_province || '').replace(/"/g, '""')}"`,
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

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <FileUp className="w-3.5 h-3.5 text-blue-600" />
            Import File
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export
          </button>
        </div>
      </div>

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

      {/* Toolbar & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white py-2 px-3 rounded-xl border border-slate-200/80 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Store No., Name, City/Province..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent transition-all"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

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
                : 'No districts found. Import a CSV or XLSX to populate entries.'
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
