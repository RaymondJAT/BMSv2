const { Query, SQLQueryBuilder } = require('../database/utilities/queries.util')
const { Master } = require('../database/models/Master')
const { normalizeName, fetchAllHrmisData } = require('../services/hrmis.service.js')
const { EncryptString } = require('../utilities/cryptography.util.js')

const SQL = new SQLQueryBuilder()

// HRMIS's get-users payload carries no role/access info, but
// master_user.mu_access_id is NOT NULL with no DB default. Change this
// (or set HRMIS_SYNC_DEFAULT_ACCESS_NAME) to match a real row in
// master_access — this MUST exist in the table before sync will work.
const DEFAULT_SYNCED_ACCESS_NAME = process.env.HRMIS_SYNC_DEFAULT_ACCESS_NAME || 'REQUESTER'

/**
 * Resolves the master_access row every newly-synced user gets assigned,
 * since HRMIS gives us no role data to sync. Throws loudly instead of
 * silently defaulting to some arbitrary id, since assigning the wrong
 * access level is a security-relevant mistake.
 */
const resolveDefaultAccessId = async () => {
  const rows = await Query(
    `SELECT ${Master.Access.cols.id} AS id FROM ${Master.Access.table} WHERE ${Master.Access.cols.name} = ? LIMIT 1`,
    [DEFAULT_SYNCED_ACCESS_NAME],
  )
  const accessId = rows?.[0]?.id
  if (!accessId) {
    throw new Error(
      `No master_access row named "${DEFAULT_SYNCED_ACCESS_NAME}" found — cannot assign a default access level to synced users. Create that access role (e.g. POST /master-access with { "name": "${DEFAULT_SYNCED_ACCESS_NAME}" }), or set HRMIS_SYNC_DEFAULT_ACCESS_NAME to an existing role name.`,
    )
  }
  return accessId
}

// ==========================================
// DEPARTMENT / POSITION SYNC
// ==========================================

const syncNamedMasterTable = async ({
  model,
  nameCol,
  codeCol,
  codePrefix,
  tableName,
  rawCodeCol,
  hrmisRecords,
  getHrmisName,
}) => {
  const { sql, bindings } = SQL.model(model)
    .select([`${model.cols.id} AS id`, `${model.cols[nameCol]} AS ${nameCol}`])
    .build()
  const existing = await Query(sql, bindings)

  const byName = new Map(existing.map((row) => [normalizeName(row[nameCol]), row.id]))

  const seqRows = await Query(
    `SELECT MAX(CAST(SUBSTRING(${rawCodeCol}, ${codePrefix.length + 1}, 3) AS UNSIGNED)) AS max_seq FROM ${tableName}`,
  )
  let seq = seqRows?.[0]?.max_seq || 0
  let added = 0

  for (const record of hrmisRecords) {
    const displayName = getHrmisName(record)
    const key = normalizeName(displayName)
    if (!key || byName.has(key)) continue

    seq += 1
    const insertQuery = SQL.model(model)
      .insert({
        [model.cols[codeCol]]: `${codePrefix}${String(seq).padStart(3, '0')}`,
        [model.cols[nameCol]]: displayName,
        [model.cols.status]: 'ACTIVE',
      })
      .build()
    const result = await Query(insertQuery.sql, insertQuery.bindings)

    byName.set(key, result.insertId)
    added += 1
  }

  return { added, byName }
}

const syncDepartments = (hrmisDepartments) =>
  syncNamedMasterTable({
    model: Master.Department,
    nameCol: 'name',
    codeCol: 'code',
    codePrefix: 'MD-',
    tableName: 'master_department',
    rawCodeCol: 'md_code',
    hrmisRecords: hrmisDepartments,
    getHrmisName: (dept) => dept.departmentname,
  })

const syncPositions = (hrmisPositions) =>
  syncNamedMasterTable({
    model: Master.Position,
    nameCol: 'description',
    codeCol: 'code',
    codePrefix: 'MP-',
    tableName: 'master_position',
    rawCodeCol: 'mp_code',
    hrmisRecords: hrmisPositions,
    getHrmisName: (pos) => pos.positionname,
  })

// ==========================================
// EMPLOYEE SYNC
// ==========================================

const syncEmployees = async (hrmisEmployees, deptByName, posByName) => {
  const { sql, bindings } = SQL.model(Master.Employee)
    .select([
      `${Master.Employee.cols.id} AS id`,
      `${Master.Employee.cols.employee_id} AS employee_id`,
    ])
    .build()
  const existing = await Query(sql, bindings)
  const byEmployeeId = new Map(existing.map((row) => [String(row.employee_id), row.id]))

  const hrmisIdToLocalId = new Map()
  let added = 0
  const skipped = []

  for (const employee of hrmisEmployees) {
    const hrmisEmployeeId = String(employee.id)
    const fullname = `${employee.firstname || ''} ${employee.lastname || ''}`.trim()

    if (byEmployeeId.has(hrmisEmployeeId)) {
      hrmisIdToLocalId.set(hrmisEmployeeId, byEmployeeId.get(hrmisEmployeeId))
      continue
    }

    const departmentId = deptByName.get(normalizeName(employee.department))
    const positionId = posByName.get(normalizeName(employee.position))

    if (!departmentId || !positionId) {
      skipped.push({
        id: employee.id,
        name: fullname,
        reason: !departmentId
          ? `Unknown department "${employee.department}"`
          : `Unknown position "${employee.position}"`,
      })
      continue
    }

    const insertQuery = SQL.model(Master.Employee)
      .insert({
        [Master.Employee.cols.employee_id]: hrmisEmployeeId,
        [Master.Employee.cols.fullname]: fullname,
        [Master.Employee.cols.department_id]: departmentId,
        [Master.Employee.cols.position_id]: positionId,
        [Master.Employee.cols.status]: employee.jobstatus || 'ACTIVE',
      })
      .build()
    const result = await Query(insertQuery.sql, insertQuery.bindings)

    byEmployeeId.set(hrmisEmployeeId, result.insertId)
    hrmisIdToLocalId.set(hrmisEmployeeId, result.insertId)
    added += 1
  }

  return { added, skipped, hrmisIdToLocalId }
}

// ==========================================
// USER ACCOUNT SYNC
// ==========================================

const syncUsers = async (hrmisUsers, hrmisIdToLocalId, defaultAccessId) => {
  const { sql, bindings } = SQL.model(Master.User)
    .select([`${Master.User.cols.id} AS id`, `${Master.User.cols.employee_id} AS employee_id`])
    .build()
  const existing = await Query(sql, bindings)
  const existingByEmployeeId = new Set(existing.map((row) => String(row.employee_id)))

  let added = 0
  const skipped = []

  for (const user of hrmisUsers) {
    const { employee_id: hrmisEmployeeId, username, user_password } = user
    const localEmployeeId = hrmisIdToLocalId.get(String(hrmisEmployeeId))

    if (!localEmployeeId) {
      skipped.push({
        employee_id: hrmisEmployeeId,
        username,
        reason: 'No matching local employee record (see employees_skipped, or a fullname mismatch)',
      })
      continue
    }
    if (!username) {
      skipped.push({ employee_id: hrmisEmployeeId, reason: 'Missing username' })
      continue
    }
    if (existingByEmployeeId.has(String(localEmployeeId))) continue

    const insertQuery = SQL.model(Master.User)
      .insert({
        [Master.User.cols.employee_id]: localEmployeeId,
        [Master.User.cols.access_id]: defaultAccessId,
        [Master.User.cols.username]: username,
        [Master.User.cols.password]: EncryptString(user_password),
        [Master.User.cols.status]: 'ACTIVE',
      })
      .build()
    await Query(insertQuery.sql, insertQuery.bindings)

    existingByEmployeeId.add(String(localEmployeeId))
    added += 1
  }

  return { added, skipped }
}

// ==========================================
// ENTRY POINT
// ==========================================

/**
 * @name runSync
 * @description Pulls departments, positions, employees and user accounts
 *              from HRMIS and inserts any that don't exist locally yet
 *              (matched by name for departments/positions, by HRMIS
 *              employee id for employees and users). Existing records are
 *              never updated or deleted. New users are assigned the
 *              default access role (see DEFAULT_SYNCED_ACCESS_NAME).
 */
const runSync = async (req, res) => {
  // #swagger.tags = ['Synchronize']
  // #swagger.description = 'Sync departments, positions, employees, and user accounts from HRMIS. Insert-only: records that already exist locally are left untouched. New users get the default access role (env HRMIS_SYNC_DEFAULT_ACCESS_NAME, default REQUESTER), which must already exist in master_access.'
  // #swagger.autoBody = false
  /*
    #swagger.responses[200] = {
      description: 'Synchronization completed (check summary.fetch_errors, employees_skipped and users_skipped for partial failures)',
      schema: {
        message: 'Synchronization completed',
        summary: {
          departments_received: 0,
          positions_received: 0,
          employees_received: 0,
          users_received: 0,
          departments_added: 0,
          positions_added: 0,
          employees_added: 0,
          employees_skipped: [{ id: 1, name: 'string', reason: 'string' }],
          users_added: 0,
          users_skipped: [{ employee_id: 1, username: 'string', reason: 'string' }],
          fetch_errors: [],
          synced_at: '2026-10-30T08:00:00.000Z'
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Synchronization failed (e.g. default access role missing, HRMIS unreachable)',
      schema: { message: 'string' }
    }
  */
  try {
    const hrmis = await fetchAllHrmisData({ debug: true })

    const received = {
      departments_received: hrmis.departments.length,
      positions_received: hrmis.positions.length,
      employees_received: hrmis.employees.length,
      users_received: hrmis.users.length,
    }
    console.log('runSync — raw counts received from HRMIS:', received)

    const defaultAccessId = await resolveDefaultAccessId()

    const { added: departmentsAdded, byName: deptByName } = await syncDepartments(hrmis.departments)
    const { added: positionsAdded, byName: posByName } = await syncPositions(hrmis.positions)
    const {
      added: employeesAdded,
      skipped: employeesSkipped,
      hrmisIdToLocalId,
    } = await syncEmployees(hrmis.employees, deptByName, posByName)
    const { added: usersAdded, skipped: usersSkipped } = await syncUsers(
      hrmis.users,
      hrmisIdToLocalId,
      defaultAccessId,
    )

    return res.status(200).json({
      message:
        hrmis.errors.length > 0
          ? 'Synchronization completed with some HRMIS endpoints unreachable - see fetch_errors'
          : 'Synchronization completed',
      summary: {
        ...received,
        departments_added: departmentsAdded,
        positions_added: positionsAdded,
        employees_added: employeesAdded,
        employees_skipped: employeesSkipped,
        users_added: usersAdded,
        users_skipped: usersSkipped,
        fetch_errors: hrmis.errors,
        synced_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Error in runSync:', error)
    return res.status(500).json({ message: error.message || 'Synchronization failed' })
  }
}

module.exports = { runSync }
