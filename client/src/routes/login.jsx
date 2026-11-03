import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ShieldCheck, CheckCircle2, FileSpreadsheet, Eye, EyeOff } from 'lucide-react'

export const Route = createFileRoute('/login')({
  validateSearch: (search) => ({
    redirect: search.redirect || '/dashboard',
  }),
  component: LoginPage,
})

function LoginPage() {
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ from: '/login' })

  const [formData, setFormData] = useState({ username: '', password: '' })
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errorMessage) setErrorMessage('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const result = await login(formData)

      if (result.success) {
        navigate({ to: search.redirect })
      } else {
        setErrorMessage(result.message || 'Invalid username or password.')
      }
    } catch (err) {
      setErrorMessage('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-[#F9F6F0] via-[#f1f3f5] to-[#e9ecef] p-3 sm:p-6 lg:p-8 antialiased">
      {/* Container: Stacked on Mobile/Tablet, 2-Column Grid on Desktop */}
      <div className="w-full max-w-md lg:max-w-4xl bg-[#F9F6F0] rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden flex flex-col lg:grid lg:grid-cols-2">
        {/* Sign In Form */}
        <div className="order-1 lg:order-2 p-6 sm:p-8 lg:p-10 flex flex-col justify-center bg-white">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              System Sign In
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Enter your authorized credentials to proceed
            </p>
          </div>

          {/* Error Alert Box */}
          {errorMessage && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl flex items-center gap-2.5">
              <span className="font-bold text-sm leading-none shrink-0">⚠️</span>
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                name="username"
                placeholder="Enter your username"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4A0404] focus:border-transparent transition-all text-sm text-slate-800 placeholder:text-slate-400 font-medium"
                value={formData.username}
                onChange={handleChange}
                disabled={isSubmitting || isLoading}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4A0404] focus:border-transparent transition-all text-sm text-slate-800 placeholder:text-slate-400 font-medium"
                  value={formData.password}
                  onChange={handleChange}
                  disabled={isSubmitting || isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full bg-[#4A0404] hover:bg-[#380303] disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-sm transition-all shadow-xs hover:shadow-sm active:scale-[0.99] cursor-pointer mt-2 flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-[#4A0404] focus-visible:outline-none"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Feature Highlights Panel (Order 2 on Mobile, Order 1 on Desktop) */}
        <div className="order-2 lg:order-1 relative bg-linear-to-br from-[#4A0404] via-[#380303] to-[#240202] text-white p-6 sm:p-8 lg:p-10 flex flex-col justify-between overflow-hidden">
          {/* Ambient Background Glows */}
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-black/30 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-[11px] font-bold text-white/90 uppercase tracking-wider mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-200" />
              Budget Management System
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              BMS
            </h1>
            <p className="text-xs sm:text-sm font-medium text-amber-100/80 mt-1 leading-relaxed">
              Streamlining Departmental & Project Expenditures
            </p>
          </div>

          {/* Feature Cards Grid */}
          <div className="relative z-10 my-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
            <div className="flex items-start gap-3 bg-white/10 border border-white/15 p-3 rounded-xl backdrop-blur-md">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/15 text-white shrink-0 flex items-center justify-center font-bold text-sm sm:text-base leading-none">
                ₱
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-white truncate">
                  Allocation & Fund Tracking
                </p>
                <p className="text-[11px] sm:text-xs text-amber-100/70 leading-normal mt-0.5 hidden sm:block lg:block">
                  Monitor real-time balance and burn rates per department.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-white/10 border border-white/15 p-3 rounded-xl backdrop-blur-md">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/15 text-white shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-amber-200" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-white truncate">
                  Approval Workflows
                </p>
                <p className="text-[11px] sm:text-xs text-amber-100/70 leading-normal mt-0.5 hidden sm:block lg:block">
                  Streamlined purchase requests and manager sign-offs.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-white/10 border border-white/15 p-3 rounded-xl backdrop-blur-md">
              <div className="p-1.5 sm:p-2 rounded-lg bg-white/15 text-white shrink-0 mt-0.5">
                <FileSpreadsheet className="w-4 h-4 text-amber-200" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-white truncate">
                  Reports & Audit Trail
                </p>
                <p className="text-[11px] sm:text-xs text-amber-100/70 leading-normal mt-0.5 hidden sm:block lg:block">
                  Generate summary reports and maintain compliance logs.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="relative z-10 flex items-center justify-between text-[11px] sm:text-xs text-amber-200/60 font-medium border-t border-white/10 pt-3">
            <span>Enterprise Finance Portal</span>
            <span>v2.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
