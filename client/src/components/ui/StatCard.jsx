import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

/**
 * Reusable Compact Stat Card with Subtly Faded Right-Side Watermark Icon (Non-Interactive)
 */
export default function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  trendDirection = 'up',
  variant = 'red',
  loading = false,
}) {
  const variants = {
    red: {
      text: 'text-rose-600',
    },
    blue: {
      text: 'text-blue-600',
    },
    emerald: {
      text: 'text-emerald-600',
    },
    amber: {
      text: 'text-amber-600',
    },
    purple: {
      text: 'text-purple-600',
    },
    slate: {
      text: 'text-slate-600',
    },
  }

  const selectedVariant = variants[variant] || variants.red

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl border border-slate-200/85 bg-white p-3.5 shadow-2xs">
        <div className="h-3 w-20 rounded bg-slate-200/80 mb-2" />
        <div className="h-5 w-28 rounded-md bg-slate-200/80 mb-2" />
        <div className="h-2.5 w-16 rounded bg-slate-200/80" />
      </div>
    )
  }

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/85 bg-white p-3.5 shadow-2xs">
      {/* Peeping Watermark Icon on the Right Edge (Faded more with opacity-10) */}
      {Icon && (
        <Icon
          className={`absolute -right-5 -bottom-5 w-24 h-24 ${selectedVariant.text} opacity-10 pointer-events-none select-none z-0`}
        />
      )}

      {/* Top Row: Title */}
      <div className="relative z-10">
        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate block">
          {title}
        </span>
      </div>

      {/* Center & Bottom: Main Metric Value & Trend/Subtitle */}
      <div className="relative z-10 mt-1">
        <div className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-slate-900 wrap-break-word">
          {value}
        </div>

        {/* Bottom Row: Trend Badge & Subtitle */}
        {(trend || subtitle) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {trend && (
              <span
                className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold shrink-0 ${
                  trendDirection === 'up'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                    : trendDirection === 'down'
                      ? 'bg-rose-50 text-rose-900 border border-rose-200/60'
                      : 'bg-slate-100 text-slate-600 border border-slate-200/60'
                }`}
              >
                {trendDirection === 'up' && <TrendingUp className="h-2.5 w-2.5" />}
                {trendDirection === 'down' && <TrendingDown className="h-2.5 w-2.5" />}
                {trendDirection === 'neutral' && <Minus className="h-2.5 w-2.5" />}
                {trend}
              </span>
            )}

            {subtitle && (
              <span className="truncate font-medium text-slate-400 text-[10px] sm:text-[11px]">
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
