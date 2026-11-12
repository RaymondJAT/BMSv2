import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { authApi } from '../api/authApi'
import { routeAccessApi } from '../api/routeAccessApi'

const AuthContext = createContext(null)

// Old versions stored the JWT here. It is removed on load so nobody keeps a
// stale 20-day token; authentication now lives only in the session cookie.
const LEGACY_TOKEN_KEY = 'bms_token'

const PROTECTED_ACCESS_NAMES = ['ADMINISTRATOR']
const isProtectedAccessName = (name) => PROTECTED_ACCESS_NAMES.includes((name || '').toUpperCase())

// One shared empty Map. Setting state to this same reference again is a
// no-op in React, so repeated clearSession() calls (e.g. from the
// 'auth:unauthorized' event) don't trigger re-render loops.
const EMPTY_PERMISSIONS = new Map()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState(EMPTY_PERMISSIONS)
  const [isLoading, setIsLoading] = useState(true)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  const loadPermissions = useCallback(async (accessId, accessName) => {
    if (!accessId) {
      setPermissions(EMPTY_PERMISSIONS)
      setPermissionsLoaded(true)
      return
    }
    try {
      const rows = await routeAccessApi.getPermissionsForAccess(accessId)
      const protectedRole = isProtectedAccessName(accessName)
      setPermissions(
        new Map(rows.map((row) => [row.name, protectedRole ? 'FULL-ACCESS' : row.permission])),
      )
    } catch (err) {
      console.error('Failed to load route permissions:', err)
      setPermissions(EMPTY_PERMISSIONS)
    } finally {
      setPermissionsLoaded(true)
    }
  }, [])

  const clearSession = useCallback(() => {
    // Same-value updates bail out, so calling this repeatedly is harmless.
    setUser(null)
    setPermissions(EMPTY_PERMISSIONS)
    setPermissionsLoaded(true)
  }, [])

  // On load/refresh the server decides, using the session cookie. If the
  // browser was closed the cookie is gone, /auth/me returns 401, and the
  // user lands on the login page. isLoading stays true until this finishes,
  // so protected pages never flash.
  useEffect(() => {
    localStorage.removeItem(LEGACY_TOKEN_KEY)

    const hydrate = async () => {
      try {
        const profile = await authApi.checkSession()
        setUser(profile)
        await loadPermissions(profile.access_id, profile.access_name)
      } catch {
        clearSession() // no session, expired, or account deactivated
      } finally {
        setIsLoading(false)
      }
    }
    hydrate()
  }, [loadPermissions, clearSession])

  useEffect(() => {
    window.addEventListener('auth:unauthorized', clearSession)
    return () => window.removeEventListener('auth:unauthorized', clearSession)
  }, [clearSession])

  const login = useCallback(
    async ({ username, password }) => {
      try {
        const data = await authApi.login(username, password)
        if (!data?.success) {
          return { success: false, message: data?.message || 'Login failed.' }
        }
        setUser(data.data) // the server has already created the session
        await loadPermissions(data.data.access_id, data.data.access_name)
        return { success: true }
      } catch (err) {
        return {
          success: false,
          message: err.response?.data?.message || 'Login failed. Please try again.',
        }
      }
    },
    [loadPermissions],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout() // the server destroys the session and clears the cookie
    } catch (err) {
      console.error('Logout request failed (clearing local session anyway):', err)
    } finally {
      clearSession()
    }
  }, [clearSession])

  const refreshPermissions = useCallback(() => {
    if (!user) return Promise.resolve()
    return loadPermissions(user.access_id, user.access_name)
  }, [user, loadPermissions])

  const hasRole = useCallback(
    (allowedRoles = []) => {
      if (!user || !user.access_name) return false
      return allowedRoles.includes(user.access_name)
    },
    [user],
  )

  const canAccessRoute = useCallback(
    (routeName) => {
      if (!user) return false
      if (isProtectedAccessName(user.access_name)) return true
      return permissions.get(routeName) === 'FULL-ACCESS'
    },
    [user, permissions],
  )

  const value = useMemo(
    () => ({
      user,
      setUser,
      isAuthenticated: Boolean(user),
      isLoading,
      permissionsLoaded,
      permissions,
      hasRole,
      canAccessRoute,
      login,
      logout,
      refreshPermissions,
    }),
    [
      user,
      isLoading,
      permissionsLoaded,
      permissions,
      hasRole,
      canAccessRoute,
      login,
      logout,
      refreshPermissions,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
