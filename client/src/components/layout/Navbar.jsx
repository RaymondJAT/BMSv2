import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import {
  Menu,
  Bell,
  Search,
  Plus,
  ChevronRight,
  LogOut,
  FileText,
  Banknote,
  User as UserIcon,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function Navbar({ onToggleMobile }) {
  const { user, logout } = useAuth()
  const location = useLocation()

  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false)
  const quickActionRef = useRef(null)

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)

  const pathnames = location.pathname.split('/').filter((x) => x)

  // Handle outside clicks for dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (quickActionRef.current && !quickActionRef.current.contains(event.target)) {
        setIsQuickActionOpen(false)
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        console.log('Open Global Search Modal')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const userInitials = (user?.fullname || user?.username || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  const handleCashDisbursement = () => {
    setIsQuickActionOpen(false)
    console.log('Open Create Cash Disbursement Modal')
  }

  const handleGenerateReport = () => {
    setIsQuickActionOpen(false)
    console.log('Open Generate Report Modal')
  }

  return (
    <header className="relative flex h-16 items-center justify-between border-b border-slate-200/80 bg-[#F1F3F5] px-4 sm:px-6 shadow-xs shrink-0 z-20 gap-4 text-slate-800">
      {/* ------------------------------------------------------------- */}
      {/* LEFT SECTION: Mobile Menu + Breadcrumbs                        */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-3 min-w-0 flex-1 z-10">
        <button
          type="button"
          onClick={onToggleMobile}
          className="p-2 hover:bg-slate-200/60 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none lg:hidden shrink-0 flex items-center justify-center"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb / Page Title Indicator */}
        <nav
          aria-label="Breadcrumb"
          className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate"
        >
          <Link to="/dashboard" className="hover:text-slate-900 transition-colors shrink-0">
            Home
          </Link>

          {pathnames.map((value, index) => {
            const to = `/${pathnames.slice(0, index + 1).join('/')}`
            const isLast = index === pathnames.length - 1
            const formattedName = value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ')

            return (
              <React.Fragment key={to}>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                {isLast ? (
                  <span className="font-semibold text-slate-900 truncate">{formattedName}</span>
                ) : (
                  <Link
                    to={to}
                    className="hover:text-slate-900 transition-colors capitalize truncate"
                  >
                    {formattedName}
                  </Link>
                )}
              </React.Fragment>
            )
          })}
        </nav>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CENTER SECTION: Centered Search Bar Container                 */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-xs lg:max-w-md hidden sm:flex px-4 pointer-events-auto z-10">
        <button
          type="button"
          onClick={() => console.log('Open search modal')}
          className="w-full flex items-center justify-start gap-2 px-3 py-2 text-xs text-slate-500 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs rounded-lg transition-colors cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
        >
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="truncate">Search anything...</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT SECTION: Quick Actions, Notifications, Profile Dropdown */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center justify-end gap-2 shrink-0 flex-1 sm:flex-initial z-10">
        {/* Mobile Search Icon */}
        <button
          type="button"
          onClick={() => console.log('Open search modal')}
          className="sm:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none flex items-center justify-center"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Quick Actions Dropdown */}
        <div className="relative group" ref={quickActionRef}>
          <button
            type="button"
            onClick={() => setIsQuickActionOpen((prev) => !prev)}
            className="h-9 w-9 bg-[#4A0404] text-white hover:bg-[#3B0303] font-semibold rounded-lg transition-colors shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none flex items-center justify-center"
            aria-label="Create Quick Action"
            aria-expanded={isQuickActionOpen}
            aria-haspopup="true"
          >
            <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
          </button>

          {/* Hover Tooltip */}
          {!isQuickActionOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block pointer-events-none z-50">
              <div className="bg-slate-900 text-white text-[11px] font-medium px-2 py-1 rounded shadow-md whitespace-nowrap">
                Create Quick Action
              </div>
            </div>
          )}

          {/* Dropdown Menu */}
          {isQuickActionOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 bg-[#3B0303] p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-stone-100">
              <div className="px-2.5 py-1 text-[10px] font-bold text-stone-300 uppercase tracking-wider">
                Quick Actions
              </div>
              <button
                type="button"
                onClick={handleCashDisbursement}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-100 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer text-left"
              >
                <Banknote className="h-4 w-4 text-stone-300 shrink-0" />
                <span>Cash Disbursement</span>
              </button>
              <button
                type="button"
                onClick={handleGenerateReport}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-100 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer text-left"
              >
                <FileText className="h-4 w-4 text-stone-300 shrink-0" />
                <span>Generate Report</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications Button */}
        <button
          type="button"
          className="relative h-9 w-9 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none flex items-center justify-center"
          aria-label="View notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-[#f8f9fa]" />
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-200 mx-1 self-center" aria-hidden="true" />

        {/* User Profile Dropdown Menu */}
        <div className="relative" ref={profileMenuRef}>
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            className="flex items-center gap-2.5 p-1.5 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
            aria-expanded={isProfileMenuOpen}
            aria-haspopup="true"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4A0404] text-xs font-bold text-white border border-[#4A0404]/20 shadow-xs">
              {userInitials}
            </div>

            <div className="text-left hidden lg:block">
              <p className="text-xs font-bold text-slate-800 leading-tight">
                {user?.fullname || user?.username || 'User'}
              </p>
              <p className="text-[10px] text-slate-500 font-medium leading-none mt-0.5">
                {user?.access_name || '—'}
              </p>
            </div>
          </button>

          {/* Profile Dropdown Content */}
          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 bg-[#3B0303] p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-stone-100">
              {/* Mobile Profile Header Info (Visible only inside dropdown on small screens) */}
              <div className="px-3 py-2 border-b border-white/10 mb-1 lg:hidden">
                <p className="text-xs font-bold text-white leading-tight">
                  {user?.fullname || user?.username || 'User'}
                </p>
                <p className="text-[10px] text-stone-300 font-medium mt-0.5">
                  {user?.access_name || '—'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false)
                  console.log('Navigate to Profile / Settings')
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-100 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer text-left"
              >
                <UserIcon className="h-4 w-4 text-stone-300 shrink-0" />
                <span>My Profile</span>
              </button>

              <div className="h-px bg-white/10 my-1" />

              <button
                type="button"
                onClick={() => {
                  setIsProfileMenuOpen(false)
                  logout()
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-100 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer text-left"
              >
                <LogOut className="h-4 w-4 text-stone-300 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
