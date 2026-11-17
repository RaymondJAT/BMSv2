import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import Button from '../../../components/ui/Button'
import TableToolbar from '../../../components/ui/TableToolbar'
import logoRed from '../../../assets/5L_logo(red).png'
import {
  FileText,
  Printer,
  Sliders,
  Banknote,
  TrendingUp,
  Wallet,
  CheckCircle2,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react'

export const Route = createFileRoute('/_authenticated/reports/reportBudget')({
  component: ReportBudgetPage,
})

const REPORT_MODULES = [
  { key: 'budget', label: 'Budget Utilization', icon: Banknote, count: 3 },
  { key: 'revolving', label: 'Revolving Funds', icon: Wallet, count: 3 },
  { key: 'disbursements', label: 'Cash Disbursements', icon: TrendingUp, count: 3 },
  { key: 'requests', label: 'Cash Requests', icon: Layers, count: 3 },
  { key: 'liquidations', label: 'Liquidations', icon: CheckCircle2, count: 2 },
]

export default function ReportBudgetPage() {
  const [selectedModule, setSelectedModule] = useState('revolving')

  // Date Range Filtering States (Side-by-side inputs)
  const [startDate, setStartDate] = useState('2026-11-01')
  const [endDate, setEndDate] = useState('2026-11-17')

  // Zoom state for preview canvas (scale percentage from 60% to 140%)
  const [zoomScale, setZoomScale] = useState(100)

  const printRef = useRef(null)

  // React-to-print hook configuration
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${selectedModule.toUpperCase()}_Report_${startDate}_to_${endDate}`,
  })

  // Dynamic Mock Dataset generator based on active module
  const reportContent = useMemo(() => {
    switch (selectedModule) {
      case 'revolving':
        return {
          title: 'Revolving Funds Reconciliation & Utilization Report',
          totalFloat: 200000,
          liquidated: 120000,
          unliquidated: 80000,
          headers: [
            'Reference ID',
            'Particulars / Accountable Officer',
            'Cash Float / Advance',
            'Liquidated',
            'Unliquidated Balance',
            'Status',
          ],
          rows: [
            [
              'REV-2026-011',
              'Office of the Regional Director (Petty Cash Float)',
              '₱100,000.00',
              '₱70,000.00',
              '₱30,000.00',
              'Balanced',
            ],
            [
              'REV-2026-012',
              'Administrative Services Division (Field Operations)',
              '₱60,000.00',
              '₱35,000.00',
              '₱25,000.00',
              'Balanced',
            ],
            [
              'REV-2026-013',
              'Financial Management Division (Supplies Float)',
              '₱40,000.00',
              '₱15,000.00',
              '₱25,000.00',
              'Balanced',
            ],
          ],
        }
      case 'disbursements':
        return {
          title: 'Cash Disbursements Summary',
          headers: ['DV Number', 'Payee / Particulars', 'Date', 'Amount'],
          rows: [
            ['DV-2026-089', 'Philippine Long Distance Telephone', 'Nov 12, 2026', '₱24,500.00'],
            ['DV-2026-090', 'Ace Hardware & Equipment Inc.', 'Nov 14, 2026', '₱185,000.00'],
            ['DV-2026-091', 'Meralco Utility Services', 'Nov 15, 2026', '₱92,400.00'],
          ],
        }
      case 'requests':
        return {
          title: 'Cash Request Registry (Liquidated & Unliquidated)',
          headers: ['Request ID', 'Department', 'Purpose', 'Requested Amount', 'Status'],
          rows: [
            [
              'CR-2026-102',
              'IT Infrastructure',
              'Server Cluster Maintenance',
              '₱150,000.00',
              'Liquidated',
            ],
            [
              'CR-2026-103',
              'Operations',
              'Quarterly Regional Workshop',
              '₱280,000.00',
              'Unliquidated',
            ],
            [
              'CR-2026-104',
              'Field Operations',
              'Emergency Travel Allowance',
              '₱95,000.00',
              'Liquidated',
            ],
          ],
        }
      case 'liquidations':
        return {
          title: 'Liquidation Status Report',
          headers: ['Liquid ID', 'Accountable Officer', 'Cash Advance', 'Liquidated', 'Variance'],
          rows: [
            ['LIQ-2026-041', 'Juan Dela Cruz', '₱50,000.00', '₱50,000.00', '₱0.00'],
            ['LIQ-2026-042', 'Ana Reyes', '₱120,000.00', '₱98,000.00', '₱22,000.00 (Due)'],
          ],
        }
      default: // Budget Utilization
        return {
          title: 'Budget Utilization & Allotment Report',
          headers: [
            'Particular / Category',
            'Allotment',
            'Obligations',
            'Disbursements',
            'Balance',
          ],
          rows: [
            [
              'Field Operations & Travel',
              '₱1,250,000.00',
              '₱1,100,000.00',
              '₱980,000.00',
              '₱270,000.00',
            ],
            [
              'Equipment & Hardware Upgrades',
              '₱3,500,000.00',
              '₱3,300,000.00',
              '₱3,100,000.00',
              '₱400,000.00',
            ],
            [
              'Special Project Allowances',
              '₱850,000.00',
              '₱700,000.00',
              '₱620,000.00',
              '₱230,000.00',
            ],
          ],
        }
    }
  }, [selectedModule])

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 15, 140))
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 15, 60))
  const handleResetZoom = () => setZoomScale(100)

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      {/* Page Header */}
      <div className="shrink-0">
        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
          Financial & Budgetary Reporting
        </h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Configure report parameters on the left and inspect print layouts on the right.
        </p>
      </div>

      {/* TableToolbar Component for Report Modules */}
      <TableToolbar
        tabs={REPORT_MODULES}
        activeTab={selectedModule}
        onTabChange={setSelectedModule}
      >
        <Button
          variant="primary"
          onClick={() => handlePrint()}
          className="bg-[#4A0404] hover:bg-[#3B0303] text-white text-xs py-1.5 px-3"
        >
          <Printer className="w-3.5 h-3.5 mr-1.5" />
          Print / Export PDF
        </Button>
      </TableToolbar>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* LEFT COLUMN: Pure Parameter Configuration Panel */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200/85 p-3.5 flex flex-col space-y-3 overflow-y-auto shadow-2xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Sliders className="w-4 h-4 text-[#4A0404]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Configuration
            </h2>
          </div>

          {/* Date Range Selector (Side-by-Side Layout) */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Date Range
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-600">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-[11px] rounded-lg border border-slate-300 bg-white p-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4A0404]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-600">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-[11px] rounded-lg border border-slate-300 bg-white p-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#4A0404]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Print Preview Panel */}
        <div className="lg:col-span-9 bg-slate-200/70 rounded-xl border border-slate-300/80 p-4 flex flex-col min-h-0 overflow-hidden">
          {/* Print Preview Top Toolbar (Zoom controls) */}
          <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-300 mb-3 shrink-0 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <FileText className="w-4 h-4 text-[#4A0404]" />
              <span>Print Layout Preview</span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleZoomOut}
                title="Zoom Out"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                title="Reset Zoom"
                className="px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
              >
                {zoomScale}%
              </button>
              <button
                onClick={handleZoomIn}
                title="Zoom In"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-4 w-px bg-slate-300 mx-1" />
              <button
                onClick={handleResetZoom}
                title="Reset View"
                className="p-1.5 rounded hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Scrollable Preview Canvas Container */}
          <div className="flex-1 overflow-auto flex justify-center p-4 bg-slate-300/50 rounded-lg border border-inner border-slate-300">
            {/* Printable Document Sheet with Ultra-Narrow Margins (px-6 py-5) */}
            <div
              ref={printRef}
              style={{ transform: `scale(${zoomScale / 100})`, transformOrigin: 'top center' }}
              className="w-[210mm] min-h-[297mm] bg-white px-6 py-5 rounded shadow-md border border-slate-300 text-slate-900 font-sans transition-transform duration-150 print:shadow-none print:border-none print:p-0 print:transform-none"
            >
              {/* Official Corporate Header with Compressed Gap & Tight Spacing */}
              <div className="flex items-center border-b-2 border-slate-900 pb-2 mb-3 gap-3">
                <img
                  src={logoRed}
                  alt="5L Solutions Logo"
                  className="w-12 h-12 object-contain shrink-0"
                />
                <div className="flex flex-col">
                  <h2 className="text-[11px] font-black tracking-tight text-slate-900 uppercase">
                    5L Solutions Supply & Allied Services Corp.
                  </h2>
                  <p className="text-[9px] text-slate-600 leading-tight">
                    Block 57 Lot 1 Phase 3B Macaria Avenue, Pacita Complex, Barangay San Francisco,
                    Biñan Laguna 4024
                  </p>
                  <p className="text-[9px] font-semibold text-slate-700 mt-0.5">
                    Contact No: (02) 87099896
                  </p>
                </div>
              </div>

              {/* Report Title Sub-header with Date Range */}
              <div className="text-center mb-3">
                <h1 className="text-xs font-extrabold tracking-tight text-[#4A0404]">
                  {reportContent.title}
                </h1>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  Period: {startDate} to {endDate}
                </p>
              </div>

              {/* Revolving Fund Specific Reconciliation Box (Balanced View) */}
              {selectedModule === 'revolving' && (
                <div className="mb-4 p-2.5 bg-slate-50 border border-slate-300 rounded text-[10px] grid grid-cols-4 gap-2 text-center">
                  <div>
                    <span className="block text-slate-500 font-medium">Total Cash Float</span>
                    <span className="font-bold text-slate-900">
                      ₱{reportContent.totalFloat.toLocaleString()}.00
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-medium">Total Liquidated</span>
                    <span className="font-bold text-emerald-700">
                      ₱{reportContent.liquidated.toLocaleString()}.00
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-medium">Total Unliquidated</span>
                    <span className="font-bold text-amber-700">
                      ₱{reportContent.unliquidated.toLocaleString()}.00
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-medium">Reconciliation Status</span>
                    <span className="font-bold text-blue-700">Balanced (100%)</span>
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className="mb-4">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      {reportContent.headers.map((hdr, idx) => (
                        <th
                          key={idx}
                          className="py-1.5 px-2 font-bold text-slate-800 uppercase tracking-wider text-[10px]"
                        >
                          {hdr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportContent.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-slate-200 hover:bg-slate-50/50">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`py-1.5 px-2 text-[10px] ${cIdx === 0 ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
