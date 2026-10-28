import { useState, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@tanstack/react-router'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronDown, Layers, X } from 'lucide-react'
import { NAVIGATION_ITEMS } from '../../config/navigation.config'
import { sidebarVariants, labelVariants, dropdownVariants } from './layout.variants'
import { useAuth } from '../../context/AuthContext'

export default function Sidebar({ isOpen, onCloseMobile, isMobile = false }) {
  const shouldReduceMotion = useReducedMotion()
  const { canAccessRoute } = useAuth()

  const visibleNavItems = useMemo(() => {
    return NAVIGATION_ITEMS.reduce((acc, item) => {
      if (item.type === 'link') {
        if (canAccessRoute(item.permissionKey)) acc.push(item)
        return acc
      }
      if (item.type === 'dropdown') {
        const visibleChildren = (item.children || []).filter((child) =>
          canAccessRoute(child.permissionKey),
        )
        if (visibleChildren.length > 0) {
          acc.push({ ...item, children: visibleChildren })
        }
        return acc
      }
      return acc
    }, [])
  }, [canAccessRoute])

  const [openMenus, setOpenMenus] = useState(() => {
    const initialState = {}
    visibleNavItems.forEach((item) => {
      if (item.type === 'dropdown') {
        initialState[item.id] = false
      }
    })
    return initialState
  })

  const [flyout, setFlyout] = useState(null)
  const closeTimeoutRef = useRef(null)

  const isCollapsed = !isOpen && !isMobile

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  const handleFlyoutOpen = useCallback(
    (item, e) => {
      if (!isCollapsed) return
      clearCloseTimeout()
      const rect = e.currentTarget.getBoundingClientRect()
      setFlyout({
        id: item.id,
        type: item.type,
        title: item.title,
        to: item.to,
        children: item.children || [],
        top: rect.top,
        left: rect.right + 8,
      })
    },
    [isCollapsed],
  )

  const handleFlyoutCloseScheduled = useCallback(() => {
    if (!isCollapsed) return
    clearCloseTimeout()
    closeTimeoutRef.current = setTimeout(() => setFlyout(null), 150)
  }, [isCollapsed])

  const toggleDropdown = (key) => {
    setOpenMenus((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleLinkClick = () => {
    if (isMobile && onCloseMobile) {
      onCloseMobile()
    }
    setFlyout(null)
  }

  const currentVariant = isMobile
    ? isOpen
      ? 'expanded'
      : 'closedMobile'
    : isOpen
      ? 'expanded'
      : 'collapsed'

  return (
    <>
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCloseMobile}
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={currentVariant}
        variants={shouldReduceMotion ? {} : sidebarVariants}
        className={`
          fixed lg:static top-0 left-0 bottom-0 
          ${isMobile ? 'z-50 h-full w-72' : 'z-30'} 
          flex flex-col bg-[#4A0404] border-r border-rose-950/60 shadow-md
          shrink-0 select-none overflow-hidden text-[#FFE4E6]
        `}
        aria-label="Main Navigation"
      >
        {/* Header Branding */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-rose-900/40 shrink-0">
          <Link
            to="/dashboard"
            onClick={handleLinkClick}
            className="flex items-center gap-3 overflow-hidden outline-none"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white border border-white/10 shadow-xs">
              <Layers className="h-5 w-5" />
            </div>

            <motion.div
              variants={shouldReduceMotion ? {} : labelVariants}
              initial={false}
              animate={isOpen || isMobile ? 'expanded' : 'collapsed'}
              className="whitespace-nowrap min-w-0"
            >
              <span className="font-extrabold text-white tracking-tight text-base block leading-tight">
                BMS Admin
              </span>
              <span className="block text-[10px] text-rose-200 font-bold tracking-wider uppercase">
                Enterprise
              </span>
            </motion.div>
          </Link>

          {isMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-rose-100 hover:text-white hover:bg-white/10 transition-colors lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav className="custom-scrollbar flex-1 space-y-1 py-3 px-2.5 overflow-y-auto overflow-x-hidden">
          {visibleNavItems.map((item) => {
            const Icon = item.icon

            if (item.type === 'link') {
              return (
                <div
                  key={item.id}
                  onMouseEnter={(e) => handleFlyoutOpen(item, e)}
                  onMouseLeave={handleFlyoutCloseScheduled}
                >
                  <Link
                    to={item.to}
                    onClick={handleLinkClick}
                    activeProps={{ className: 'bg-white/20 text-white font-bold shadow-xs' }}
                    inactiveProps={{
                      className: 'text-[#FFE4E6] hover:bg-white/10 hover:text-white',
                    }}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ease-in-out focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:outline-none"
                  >
                    <motion.div
                      whileHover={shouldReduceMotion ? {} : { x: 2 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-center shrink-0"
                    >
                      <Icon className="h-5 w-5 transition-colors duration-200 text-rose-200 group-hover:text-white" />
                    </motion.div>

                    <motion.span
                      variants={shouldReduceMotion ? {} : labelVariants}
                      initial={false}
                      animate={isOpen || isMobile ? 'expanded' : 'collapsed'}
                      className="whitespace-nowrap"
                    >
                      {item.title}
                    </motion.span>
                  </Link>
                </div>
              )
            }

            if (item.type === 'dropdown') {
              const isDropdownOpen = !!openMenus[item.id]

              return (
                <div
                  key={item.id}
                  onMouseEnter={(e) => handleFlyoutOpen(item, e)}
                  onMouseLeave={handleFlyoutCloseScheduled}
                >
                  <button
                    onClick={(e) => {
                      if (isCollapsed) {
                        handleFlyoutOpen(item, e)
                        return
                      }
                      toggleDropdown(item.id)
                    }}
                    className="group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-[#FFE4E6] transition-all duration-200 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:outline-none"
                    aria-expanded={isCollapsed ? flyout?.id === item.id : isDropdownOpen}
                    aria-haspopup={isCollapsed ? 'menu' : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <motion.div
                        whileHover={shouldReduceMotion ? {} : { x: 2 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-center shrink-0"
                      >
                        <Icon className="h-5 w-5 transition-colors duration-200 text-rose-200 group-hover:text-white" />
                      </motion.div>
                      <motion.span
                        variants={shouldReduceMotion ? {} : labelVariants}
                        initial={false}
                        animate={isOpen || isMobile ? 'expanded' : 'collapsed'}
                        className="whitespace-nowrap"
                      >
                        {item.title}
                      </motion.span>
                    </div>

                    {(isOpen || isMobile) && (
                      <motion.div
                        animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="text-rose-200 shrink-0 group-hover:text-white"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.div>
                    )}
                  </button>

                  <AnimatePresence initial={false}>
                    {(isOpen || isMobile) && isDropdownOpen && (
                      <motion.div
                        key={`${item.id}-sub`}
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={shouldReduceMotion ? {} : dropdownVariants}
                        className="ml-6 mt-1 space-y-0.5 border-l border-rose-700/60 pl-2 overflow-hidden"
                      >
                        {item.children?.map((child) => (
                          <Link
                            key={child.id}
                            to={child.to}
                            onClick={handleLinkClick}
                            activeProps={{ className: 'text-white font-bold bg-white/20' }}
                            inactiveProps={{
                              className: 'text-rose-100 hover:text-white hover:bg-white/10',
                            }}
                            className="block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:translate-x-0.5 focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:outline-none"
                          >
                            {child.title}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            }

            return null
          })}
        </nav>
      </motion.aside>

      {/* Flyout Portal for Collapsed Sidebar */}
      {isCollapsed &&
        flyout &&
        createPortal(
          <div
            style={{ position: 'fixed', top: flyout.top, left: flyout.left, zIndex: 60 }}
            onMouseEnter={clearCloseTimeout}
            onMouseLeave={handleFlyoutCloseScheduled}
            className="min-w-40 rounded-xl border border-[#E8E5DF] bg-white p-2 shadow-lg"
          >
            {flyout.type === 'link' ? (
              <Link
                to={flyout.to}
                onClick={handleLinkClick}
                activeProps={{ className: 'text-[#800020] font-bold bg-[#F7EBEB]' }}
                inactiveProps={{
                  className: 'text-slate-800 hover:text-[#660019] hover:bg-[#F3EFE6]',
                }}
                className="block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
              >
                {flyout.title}
              </Link>
            ) : (
              <>
                <div className="px-2 pb-1.5 mb-1 border-b border-[#E8E5DF] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {flyout.title}
                </div>
                <div className="space-y-0.5">
                  {flyout.children.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-slate-400">No items</p>
                  ) : (
                    flyout.children.map((child) => (
                      <Link
                        key={child.id}
                        to={child.to}
                        onClick={handleLinkClick}
                        activeProps={{ className: 'text-[#800020] font-bold bg-[#F7EBEB]' }}
                        inactiveProps={{
                          className: 'text-slate-700 hover:text-[#660019] hover:bg-[#F3EFE6]',
                        }}
                        className="block rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
                      >
                        {child.title}
                      </Link>
                    ))
                  )}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
