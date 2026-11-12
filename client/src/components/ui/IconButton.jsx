const VARIANTS = {
  default: 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
  blue: 'text-slate-400 hover:text-blue-600 hover:bg-blue-50',
  emerald: 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50',
  red: 'text-slate-400 hover:text-red-600 hover:bg-red-50',
}

export default function IconButton({
  onClick,
  title,
  icon: Icon,
  variant = 'default',
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors cursor-pointer shrink-0 ${VARIANTS[variant] || VARIANTS.default} ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}
