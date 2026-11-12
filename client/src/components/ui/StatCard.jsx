import React from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

/**
 * Reusable Compact Stat Card for Dashboard & Module Metrics
 *
 * @param {string} title (e.g. "Total Budget", "Requests")
 * @param {string|number} value (e.g. "₱1,250,000", "48")
 * @param {React.ElementType} [icon] Lucide icon component
 * @param {string} [subtitle] Secondary helper text (e.g. "vs. last month")
 * @param {string|number} [trend] Trend percentage or label (e.g. "+12.5%")
 * @param {'up'|'down'|'neutral'} [trendDirection='up'] Direction of trend indicator
 * @param {'red'|'blue'|'emerald'|'amber'|'purple'|'slate'} [variant='red'] Color theme
 * @param {boolean} [loading=false] Skeleton loader state
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
      badge: 'bg-rose-50 text-rose-900 border-rose-200/80',
    },
    blue: {
      badge: 'bg-blue-50 text-blue-600 border-blue-100/80',
    },
    emerald: {
      badge: 'bg-emerald-50 text-emerald-600 border-emerald-100/80',
    },
    amber: {
      badge: 'bg-amber-50 text-amber-600 border-amber-100/80',
    },
    purple: {
      badge: 'bg-purple-50 text-purple-600 border-purple-100/80',
    },
    slate: {
      badge: 'bg-slate-100 text-slate-700 border-slate-200/80',
    },
  }

  const selectedVariant = variants[variant] || variants.red

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl border border-slate-200/80 bg-[#F9F6F0] p-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 rounded bg-slate-200/80" />
          <div className="h-7 w-7 rounded-lg bg-slate-200/80" />
        </div>
        <div className="mt-2 h-5 w-28 rounded-md bg-slate-200/80" />
        <div className="mt-2 h-2.5 w-16 rounded bg-slate-200/80" />
      </div>
    )
  }

  return (
    <motion.div
      whileHover={{ y: -1.5 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/80 bg-[#FFFFFF] p-3 shadow-2xs hover:shadow-xs hover:border-rose-900/20 transition-all duration-200"
    >
      {/* Top Row: Title & Icon Badge */}
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
          {title}
        </span>

        {Icon && (
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105 ${selectedVariant.badge}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      {/* Center & Bottom: Main Metric Value & Trend/Subtitle */}
      <div className="mt-1.5">
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
    </motion.div>
  )
}
