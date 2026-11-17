import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu,
  Bell,
  Search,
  Plus,
  LogOut,
  FileText,
  Banknote,
  User as UserIcon,
  HelpCircle,
  ChevronDown,
  Command,
  Clock,
  ArrowUpRight,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const HELP_FAQS = [
  {
    q: 'Why can’t I submit a new Cash Request?',
    a: 'You must fully liquidate your previous disbursed Cash Request and resolve any open Slink tickets before creating a new requisition.',
  },
  {
    q: 'When does a request move to "For Liquidation"?',
    a: 'Once approved by your Team Leader and disbursed by the Fund Custodian, the request moves to "For Liquidation" so you can upload receipts and expenses.',
  },
  {
    q: 'How are Return vs. Reimbursement variances handled?',
    a: 'If your total expenses are less than the cash received, return the excess to the custodian. If expenses exceed the cash advance, a reimbursement will be processed upon verification.',
  },
  {
    q: 'Why is Slink blocking my liquidation?',
    a: 'Positions requiring Slink verification must have all assigned tickets cleared or closed before submitting liquidation details.',
  },
]

const SAMPLE_NOTIFICATIONS = [
  {
    id: 'n1',
    title: 'Liquidation Due',
    desc: 'CR-2026-079 (₱3,200.00) is awaiting receipt submission.',
    badge: 'Action Required',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'n2',
    title: 'Approval Needed',
    desc: 'CR-2026-086 from Field Operations is pending review.',
    badge: 'Pending',
    badgeColor: 'bg-rose-50 text-[#E31837] border-rose-200',
  },
]

export default function Navbar({ onToggleMobile }) {
  const { user, logout } = useAuth()

  const [openMenu, setOpenMenu] = useState(null)
  const [openFaqIndex, setOpenFaqIndex] = useState(0)
  const navRightRef = useRef(null)

  const toggleMenu = (menuName) => {
    setOpenMenu((prev) => (prev === menuName ? null : menuName))
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (navRightRef.current && !navRightRef.current.contains(event.target)) {
        setOpenMenu(null)
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
      if (e.key === 'Escape') {
        setOpenMenu(null)
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
    setOpenMenu(null)
    console.log('Open Create Cash Disbursement Modal')
  }

  const handleGenerateReport = () => {
    setOpenMenu(null)
    console.log('Open Generate Report Modal')
  }

  return (
    <header className="relative flex h-16 items-center justify-between border-b border-slate-200/80 bg-[#F1F3F5] px-4 sm:px-6 shadow-xs shrink-0 z-20 gap-4 text-slate-800">
      {/* ------------------------------------------------------------- */}
      {/* LEFT SECTION: Mobile Menu Button                              */}
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
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CENTER SECTION: Global Search Bar                             */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-xs lg:max-w-md hidden sm:flex px-4 pointer-events-auto z-10">
        <button
          type="button"
          onClick={() => console.log('Open search modal')}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-500 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs rounded-lg transition-all cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
            <span className="truncate">Search references, projects, or staff...</span>
          </div>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT SECTION: Quick Actions, Help, Notifications, Profile    */}
      {/* ------------------------------------------------------------- */}
      <div
        ref={navRightRef}
        className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 flex-1 sm:flex-initial z-10"
      >
        {/* Mobile Search Icon */}
        <button
          type="button"
          onClick={() => console.log('Open search modal')}
          className="sm:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Quick Actions Dropdown */}
        <div className="relative group">
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => toggleMenu('quick')}
            className="h-9 w-9 bg-[#4A0404] text-white hover:bg-[#3B0303] font-semibold rounded-lg transition-colors shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none flex items-center justify-center"
            aria-label="Create Quick Action"
            aria-expanded={openMenu === 'quick'}
          >
            <motion.div
              animate={{ rotate: openMenu === 'quick' ? 45 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
            </motion.div>
          </motion.button>

          {openMenu !== 'quick' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block pointer-events-none z-50">
              <div className="bg-slate-900 text-white text-[11px] font-medium px-2 py-1 rounded shadow-md whitespace-nowrap">
                Quick Action
              </div>
            </div>
          )}

          <AnimatePresence>
            {openMenu === 'quick' && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 bg-[#3B0303] p-1.5 shadow-xl z-50 text-stone-100"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Help & FAQ Popover */}
        <div className="relative group">
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => toggleMenu('help')}
            className={`h-9 w-9 rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none flex items-center justify-center ${
              openMenu === 'help'
                ? 'bg-slate-200/80 text-slate-900'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
            aria-label="Help and FAQs"
            aria-expanded={openMenu === 'help'}
          >
            <HelpCircle className="h-4.5 w-4.5" />
          </motion.button>

          {openMenu !== 'help' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block pointer-events-none z-50">
              <div className="bg-slate-900 text-white text-[11px] font-medium px-2 py-1 rounded shadow-md whitespace-nowrap">
                Help & FAQs
              </div>
            </div>
          )}

          <AnimatePresence>
            {openMenu === 'help' && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl z-50 text-slate-800"
              >
                <div className="px-2 py-2 border-b border-slate-100 mb-1.5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-900">Quick Help & FAQs</h3>
                    <p className="text-[11px] text-slate-500">Workflow guidelines & rules</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-[#E31837] border border-rose-200">
                    Guide
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto custom-scrollbar">
                  {HELP_FAQS.map((item, idx) => {
                    const isExpanded = openFaqIndex === idx
                    return (
                      <div key={idx} className="py-1">
                        <button
                          type="button"
                          onClick={() => setOpenFaqIndex(isExpanded ? null : idx)}
                          className="w-full flex items-start justify-between gap-2 px-2 py-2 text-left rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <span
                            className={`text-xs font-semibold leading-snug ${
                              isExpanded ? 'text-[#E31837]' : 'text-slate-800'
                            }`}
                          >
                            {item.q}
                          </span>
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                          </motion.div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-2 pb-2 pt-0.5 text-[11px] text-slate-600 leading-relaxed">
                                {item.a}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications Popover */}
        <div className="relative group">
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => toggleMenu('notifications')}
            className={`relative h-9 w-9 rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none flex items-center justify-center ${
              openMenu === 'notifications'
                ? 'bg-slate-200/80 text-slate-900'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
            aria-label="View notifications"
            aria-expanded={openMenu === 'notifications'}
          >
            <Bell className="h-4.5 w-4.5" />
            {SAMPLE_NOTIFICATIONS.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#E31837] text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-[#F1F3F5]">
                {SAMPLE_NOTIFICATIONS.length}
              </span>
            )}
          </motion.button>

          {openMenu !== 'notifications' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block pointer-events-none z-50">
              <div className="bg-slate-900 text-white text-[11px] font-medium px-2 py-1 rounded shadow-md whitespace-nowrap">
                Notifications
              </div>
            </div>
          )}

          <AnimatePresence>
            {openMenu === 'notifications' && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl z-50 text-slate-800"
              >
                <div className="px-2 py-1.5 border-b border-slate-100 mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">Notifications</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-[#E31837]">
                    {SAMPLE_NOTIFICATIONS.length} Unread
                  </span>
                </div>

                <div className="space-y-1.5">
                  {SAMPLE_NOTIFICATIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setOpenMenu(null)}
                      className="w-full text-left p-2 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all cursor-pointer group/item"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          {item.title}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${item.badgeColor}`}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug flex items-center justify-between gap-2">
                        <span>{item.desc}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover/item:text-[#E31837] shrink-0 transition-colors" />
                      </p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-200 mx-1 self-center" aria-hidden="true" />

        {/* User Profile Dropdown Menu */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => toggleMenu('profile')}
            className="flex items-center gap-2.5 p-1.5 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
            aria-expanded={openMenu === 'profile'}
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
          </motion.button>

          <AnimatePresence>
            {openMenu === 'profile' && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 bg-[#3B0303] p-1.5 shadow-xl z-50 text-stone-100"
              >
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
                  onClick={() => setOpenMenu(null)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-100 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer text-left"
                >
                  <UserIcon className="h-4 w-4 text-stone-300 shrink-0" />
                  <span>My Profile</span>
                </button>

                <div className="h-px bg-white/10 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null)
                    logout()
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium text-stone-100 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer text-left"
                >
                  <LogOut className="h-4 w-4 text-stone-300 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
