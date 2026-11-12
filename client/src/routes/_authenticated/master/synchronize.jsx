import { createFileRoute } from '@tanstack/react-router'
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Users,
  Building,
  Briefcase,
  KeyRound,
} from 'lucide-react'
import StatCard from '../../../components/ui/StatCard'
import Button from '../../../components/ui/Button'
import useSynchronize from '../../../hooks/useSynchronize'

export const Route = createFileRoute('/_authenticated/master/synchronize')({
  component: SynchronizePage,
})

function SynchronizePage() {
  const { runSync, isSyncing, lastResult, error } = useSynchronize()

  const handleRun = () => {
    runSync()
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
      <div>
        <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
          HRMIS Synchronization
        </h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Pull departments, positions, employees, and user accounts from HRMIS into this system.
        </p>
      </div>

      <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2.5 shrink-0">
        <p className="text-xs text-slate-500">
          Fetches a fresh token from HRMIS and pulls the latest data automatically — no manual token
          needed.
        </p>
        <Button variant="primary" onClick={handleRun} disabled={isSyncing} className="shrink-0">
          {isSyncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          {isSyncing ? 'Synchronizing...' : 'Run Synchronization'}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl shrink-0">
          {error}
        </div>
      )}

      {lastResult && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {lastResult.fetch_errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                <AlertTriangle className="w-3.5 h-3.5" />
                HRMIS Endpoints Unreachable
              </div>
              <div className="text-[11px] text-red-800 space-y-1">
                {lastResult.fetch_errors.map((e, i) => (
                  <div key={`fetch-err-${i}`}>
                    <strong>{e.endpoint}</strong>: {e.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              title="Departments Added"
              value={lastResult.departments_added ?? 0}
              icon={Building}
              subtitle="New this sync"
              variant="blue"
            />
            <StatCard
              title="Positions Added"
              value={lastResult.positions_added ?? 0}
              icon={Briefcase}
              subtitle="New this sync"
              variant="amber"
            />
            <StatCard
              title="Employees Added"
              value={lastResult.employees_added ?? 0}
              icon={Users}
              subtitle={`${lastResult.employees_skipped?.length || 0} skipped`}
              variant="emerald"
            />
            <StatCard
              title="Accounts Added"
              value={lastResult.users_added ?? 0}
              icon={KeyRound}
              subtitle={`${lastResult.users_skipped?.length || 0} skipped`}
              variant="blue"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Last synced{' '}
            {lastResult.synced_at
              ? new Date(lastResult.synced_at).toLocaleString('en-PH')
              : 'just now'}
          </div>

          {(lastResult.employees_skipped?.length > 0 || lastResult.users_skipped?.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5" />
                Skipped Records — Needs Attention
              </div>
              <div className="text-[11px] text-amber-800 space-y-1">
                {lastResult.employees_skipped?.map((s, i) => (
                  <div key={`emp-${i}`}>
                    Employee <strong>{s.name || s.id}</strong>: {s.reason}
                  </div>
                ))}
                {lastResult.users_skipped?.map((s, i) => (
                  <div key={`user-${i}`}>
                    User <strong>{s.username || s.employee_id}</strong>: {s.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
