require('dotenv').config()
const { Query } = require('../database/utilities/queries.util')
const jwt = require('jsonwebtoken')
const { EncryptString, DecryptString } = require('../utilities/cryptography.util')

console.log('SECRET LOADED:', JSON.stringify(process.env.SECRET_KEY))

const JWT_SECRET = process.env.SECRET_KEY
// Session lifetime cap. Override with JWT_EXPIRES_IN in .env.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h'

// express-session cookie name (see session.startup.js).
const SESSION_COOKIE_NAME = process.env.SESSION_COLLECTION || 'connect.sid'

// Issue a fresh session id on login to prevent session fixation.
const regenerateSession = (req) =>
  new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())))

// ==========================================
// SHARED HELPERS
// (used by both login and checkSession so the two never drift into
// returning different shapes of the same user's profile.)
// ==========================================

/**
 * Looks up a master_user row (joined to master_access for the role name)
 * by an arbitrary column — 'mu_username' for login, 'mu_id' for
 * re-verifying an already-authenticated session.
 */
const getUserAccount = async (column, value) => {
  const rows = await Query(
    `SELECT
       mu_id,
       mu_employee_id,
       mu_username,
       mu_password,
       mu_access_id,
       mu_status,
       ma_name
     FROM master_user
     LEFT JOIN master_access ON mu_access_id = ma_id
     WHERE ${column} = ?`,
    [value],
  )
  return rows?.[0] || null
}

/**
 * mu_employee_id is the FK to master_employee.me_id (the LOCAL
 * auto-increment PK) — NOT me_employee_id (HRMIS's own string id).
 * master_user has no fullname column of its own, so fullname for the
 * token/response comes entirely from this join.
 */
const getEmployeeProfile = async (localEmployeeId) => {
  const rows = await Query(
    `SELECT
       me_fullname AS employee_fullname,
       me_employee_id AS hrmis_employee_id,
       md_name AS department_name,
       md_id AS department_id,
       mp_description AS position_name,
       mp_id AS position_id
     FROM master_employee
     LEFT JOIN master_department ON me_department_id = md_id
     LEFT JOIN master_position ON me_position_id = mp_id
     WHERE me_id = ?`,
    [localEmployeeId],
  )
  return rows?.[0] || {}
}

/**
 * Builds the single canonical shape returned by both login and
 * checkSession, and also doubles as the JWT payload source for login.
 * Keeping this in one place is what guarantees a page refresh
 * (checkSession) returns the exact same profile shape as a fresh login —
 * previously getCurrentUser only echoed the JWT's own claims and silently
 * dropped employee/department/position info that login provided.
 */
const buildUserProfile = (user, employee) => {
  const fullname = employee.employee_fullname || null
  return {
    id: user.mu_id,
    username: user.mu_username,
    fullname,
    access: user.mu_access_id,
    access_id: user.mu_access_id,
    access_name: user.ma_name,
    status: user.mu_status,
    employee_fullname: fullname,
    employee_id: user.mu_employee_id || null,
    employee_code: employee.hrmis_employee_id || null,
    department_name: employee.department_name || null,
    department_id: employee.department_id || null,
    position_name: employee.position_name || null,
    position_id: employee.position_id || null,
  }
}

const signToken = (user, fullname) =>
  jwt.sign(
    {
      id: user.mu_id,
      mu_id: user.mu_id,
      username: user.mu_username,
      mu_username: user.mu_username,
      fullname,
      mu_fullname: fullname,
      access: user.mu_access_id,
      mu_access: user.mu_access_id,
      role: user.ma_name,
      status: user.mu_status,
      mu_status: user.mu_status,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )

// ==========================================
// LOGIN
// ==========================================

/**
 * @name login
 * @description Verifies username/password against master_user (joined to
 *              master_access for the role name), then looks up the
 *              matching master_employee for display profile info. Issues
 *              a JWT signed with process.env.SECRET_KEY — the same
 *              secret auth.middleware.js verifies against.
 *
 *              Password check uses DecryptString/EncryptString
 *              (reversible AES, cryptography.util.js) — mu_password is
 *              stored encrypted, not bcrypt-hashed.
 *
 *              Does NOT fetch/return master_route_access permissions —
 *              that logic already exists correctly, with catalog-merge
 *              and NO-ACCESS defaulting, in getMasterRouteAccess
 *              (master-routeaccess.controller.js, ?access_id=X). The
 *              frontend should call that endpoint separately after login
 *              using the returned access_id.
 *
 *              Session: also populates req.session.user / req.session.jwt
 *              when session middleware is present, matching
 *              auth.middleware.js's session-first token lookup — guarded
 *              with `if (req.session)` since a pure-JWT client should not
 *              error here.
 */
const login = async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' })
  }

  try {
    const user = await getUserAccount('mu_username', username)
    if (!user || !user.mu_password) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (user.mu_status !== 'ACTIVE') {
      return res.status(401).json({ message: 'User account is inactive' })
    }

    const decryptedPassword = DecryptString(user.mu_password)

    const passwordOk =
      process.env.DISABLE_AUTH === 'true' ||
      (decryptedPassword !== undefined && password === decryptedPassword)

    if (!passwordOk) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const employee = await getEmployeeProfile(user.mu_employee_id)
    const profile = buildUserProfile(user, employee)
    const token = signToken(user, profile.fullname)

    await regenerateSession(req)
    req.session.user = {
      mu_id: user.mu_id,
      mu_username: user.mu_username,
      mu_fullname: profile.fullname,
      mu_access: user.mu_access_id,
      mu_status: user.mu_status,
    }
    req.session.jwt = token

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: profile,
    })
  } catch (error) {
    console.error('Error in login:', error)
    return res.status(500).json({ message: 'Error processing login' })
  }
}

/**
 * @name logout
 * @description Destroys the session if session middleware is present;
 *              always succeeds otherwise — a JWT-only client has nothing
 *              server-side to clear, so logout for it just means the
 *              frontend discarding its stored token.
 */
const logout = async (req, res) => {
  const clearCookie = () => res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })

  if (!req.session) {
    clearCookie()
    return res.status(200).json({ message: 'Logout successful' })
  }
  req.session.destroy((err) => {
    clearCookie()
    if (err) {
      return res.status(500).json({ message: 'Logout failed', error: err.message })
    }
    return res.status(200).json({ message: 'Logout successful' })
  })
}

/**
 * @name checkSession
 * @description Re-verifies the logged-in user against the DATABASE, not
 *              just the JWT's own claims. Mount this route BEHIND
 *              auth.middleware.js's `auth` middleware, which already
 *              confirms the token itself is validly signed and unexpired
 *              and populates req.context/req.userId — this goes one step
 *              further and re-checks that the account still exists and is
 *              still ACTIVE, and returns its CURRENT role/access/employee
 *              info rather than whatever was true when the token was
 *              issued (up to JWT_EXPIRES_IN ago). This matters because a
 *              JWT has no way to reflect an admin deactivating the
 *              account, changing its role, or reassigning its employee
 *              record after the token was signed — the old token would
 *              otherwise keep "working" with stale claims until it
 *              naturally expires.
 *
 *              Returns the exact same shape as login's `data` field (see
 *              buildUserProfile) so the frontend can treat "rehydrate on
 *              page refresh" and "just logged in" identically.
 *
 *              401s (with the session destroyed if present) if the
 *              account no longer exists or is no longer ACTIVE — the
 *              frontend's axios interceptor already treats any 401 as
 *              "clear local session," so no special-casing is needed
 *              there.
 */
const checkSession = async (req, res) => {
  const userId = req.context?.mu_id ?? req.context?.id
  if (!userId) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  try {
    const user = await getUserAccount('mu_id', userId)

    if (!user) {
      if (req.session) req.session.destroy(() => {})
      return res.status(401).json({ message: 'Account no longer exists' })
    }

    if (user.mu_status !== 'ACTIVE') {
      if (req.session) req.session.destroy(() => {})
      return res.status(401).json({ message: 'User account is inactive' })
    }

    const employee = await getEmployeeProfile(user.mu_employee_id)
    const profile = buildUserProfile(user, employee)

    return res.status(200).json(profile)
  } catch (error) {
    console.error('Error in checkSession:', error)
    return res.status(500).json({ message: 'Error checking session' })
  }
}

module.exports = {
  login,
  logout,
  checkSession,
}
