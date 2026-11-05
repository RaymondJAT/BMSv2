import React, { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

const VARIANTS = {
  success: {
    bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
  },
  error: {
    bg: 'bg-rose-50 border-rose-200 text-rose-900',
    icon: XCircle,
    iconColor: 'text-rose-600',
  },
  info: {
    bg: 'bg-slate-900 border-slate-800 text-white',
    icon: Info,
    iconColor: 'text-sky-400',
  },
}

export default function Toast({ isOpen, message, variant = 'info', onClose, duration = 4000 }) {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      const timer = setTimeout(() => {
        setIsAnimating(false)
        // Wait for exit transition to finish before calling parent close
        const closeTimer = setTimeout(() => onClose?.(), 200)
        return () => clearTimeout(closeTimer)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [isOpen, duration, onClose])

  if (!isOpen) return null

  const config = VARIANTS[variant] || VARIANTS.info
  const IconComponent = config.icon

  return (
    <div className="fixed bottom-5 right-5 z-50 pointer-events-none">
      <div
        role="alert"
        className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold max-w-sm transition-all duration-300 ease-out transform ${
          isAnimating ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95'
        } ${config.bg}`}
      >
        <IconComponent className={`w-4 h-4 shrink-0 ${config.iconColor}`} />
        <span className="flex-1 leading-snug">{message}</span>
        <button
          type="button"
          onClick={() => {
            setIsAnimating(false)
            setTimeout(() => onClose?.(), 200)
          }}
          className="p-1 rounded-md opacity-60 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
          aria-label="Close notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
