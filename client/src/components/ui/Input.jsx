const BASE_CLASS =
  'w-full h-8 px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-[#4A0404] text-slate-800 placeholder-slate-400'

const NUMBER_CLASS =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

const BLOCKED_NUMBER_KEYS = ['e', 'E', '+', '-']

export default function Input({
  type = 'text',
  prefix,
  onChange,
  className = '',
  wrapperClassName = '',
  onKeyDown,
  ...props
}) {
  const handleKeyDown = (e) => {
    if (type === 'number' && BLOCKED_NUMBER_KEYS.includes(e.key)) e.preventDefault()
    onKeyDown?.(e)
  }

  return (
    <div className={`relative flex items-center w-full ${wrapperClassName}`}>
      {prefix && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
          {prefix}
        </span>
      )}
      <input
        type={type}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`${BASE_CLASS} ${prefix ? 'pl-4' : ''} ${type === 'number' ? NUMBER_CLASS : ''} ${className}`}
        {...props}
      />
    </div>
  )
}
