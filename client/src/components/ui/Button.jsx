export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'sm',
  className = '',
  disabled = false,
  onClick,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-[#E31837] hover:bg-[#c4122e] text-white font-bold',
    outline: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700',
    'outline-emerald':
      'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  }

  const variantClass = variants[variant] || variants.primary
  const sizeClass = sizes[size] || sizes.sm

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
