import { useEffect, useRef } from 'react'
import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../context/AuthContext'
import UnifiedLayout from '../components/layout/UnifiedLayout'
import { getPermissionKeyForPath, getFirstAccessiblePath } from '../config/navigation.config'

export const Route = createFileRoute('/_authenticated')({
  validateSearch: (search) => ({
    selectPortal: search.selectPortal === true || undefined,
    redirect: search.redirect,
  }),
  component: AuthenticatedLayout,
})

function useRouteAccessGuard(pathname) {
  const { isAuthenticated, isLoading, permissionsLoaded, canAccessRoute } = useAuth()

  if (isLoading) return { status: 'authenticating' }
  if (!isAuthenticated) return { status: 'unauthenticated' }
  if (!permissionsLoaded) return { status: 'loading-permissions' }

  const permissionKey = getPermissionKeyForPath(pathname)
  if (!permissionKey || !canAccessRoute(permissionKey)) {
    return { status: 'denied', canAccessRoute }
  }

  return { status: 'allowed' }
}

function AuthenticatedLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const guard = useRouteAccessGuard(location.pathname)

  // Where (if anywhere) this layout needs to send the user. Computed as a
  // plain string so the redirect effect below fires once per target, not
  // once per render.
  const fallbackPath =
    guard.status === 'denied' ? getFirstAccessiblePath(guard.canAccessRoute) : null

  let redirectTarget = null
  if (guard.status === 'unauthenticated') {
    redirectTarget = '/login'
  } else if (guard.status === 'denied' && fallbackPath && fallbackPath !== location.pathname) {
    // Also guards against redirecting to a fallback that IS the current
    // denied path, which would otherwise loop.
    redirectTarget = fallbackPath
  }

  const pathnameRef = useRef(location.pathname)
  pathnameRef.current = location.pathname
  const lastRedirectRef = useRef(null)

  useEffect(() => {
    if (!redirectTarget) {
      lastRedirectRef.current = null
      return
    }
    if (lastRedirectRef.current === redirectTarget) return
    lastRedirectRef.current = redirectTarget

    if (redirectTarget === '/login') {
      navigate({ to: '/login', replace: true, search: { redirect: pathnameRef.current } })
    } else {
      navigate({ to: redirectTarget, replace: true })
    }
  }, [redirectTarget, navigate])

  if (guard.status === 'authenticating' || guard.status === 'loading-permissions') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#E31837] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">
            {guard.status === 'authenticating' ? 'Verifying access...' : 'Loading permissions...'}
          </p>
        </div>
      </div>
    )
  }

  // Redirect in flight (see effect above) — render nothing meanwhile.
  if (redirectTarget) return null

  if (guard.status === 'denied') {
    // No accessible fallback exists (role genuinely has nothing granted)
    // — nowhere sensible to redirect to, so show the restricted message.
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Restricted</h1>
          <p className="text-slate-500 max-w-sm">
            Your account doesn't have access to any configured routes yet. Contact an administrator
            to have your role's permissions set up.
          </p>
        </div>
      </div>
    )
  }

  return (
    <UnifiedLayout>
      <Outlet />
    </UnifiedLayout>
  )
}
