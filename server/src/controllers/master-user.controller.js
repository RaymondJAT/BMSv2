const { Query, Transaction, SQLQueryBuilder } = require('../database/utilities/queries.util')
const { Master } = require('../database/models/Master')
const { EncryptString } = require('../utilities/cryptography.util')
const SQL = new SQLQueryBuilder()

const accessRoleExists = async (accessId) => {
  const rows = await Query(
    `SELECT ${Master.Access.pk} AS id
     FROM ${Master.Access.table}
     WHERE ${Master.Access.pk} = ? AND ${Master.Access.cols.status} = 'ACTIVE'`,
    [accessId],
  )
  return Boolean(rows?.[0]?.id)
}

const upsertMasterUser = async (req, res) => {
  // #swagger.tags = ['Master User']
  // #swagger.description = 'Create a Master User (no id) or update an existing one (id). The access role must exist and be ACTIVE. On create, username, password and access (role) are required.'
  // #swagger.autoBody = false
  // #swagger.consumes = ['application/x-www-form-urlencoded', 'application/json']
  /*
    #swagger.parameters['id'] = { in: 'formData', type: 'integer', required: false, description: 'User id (update if present, create if blank)' }
    #swagger.parameters['employee_id'] = { in: 'formData', type: 'integer', required: false, description: 'Employee id (master_employee.me_id)' }
    #swagger.parameters['username'] = { in: 'formData', type: 'string', required: false, description: 'Username (required on create)' }
    #swagger.parameters['password'] = { in: 'formData', type: 'string', required: false, description: 'Plain password, stored encrypted (required on create)' }
    #swagger.parameters['access'] = { in: 'formData', type: 'integer', required: false, description: 'Access role id (master_access). Required on create. access_id is accepted as an alias.' }
    #swagger.parameters['access_id'] = { in: 'formData', type: 'integer', required: false, description: 'Alias of access, used only when access is not sent' }
    #swagger.parameters['status'] = { in: 'formData', type: 'string', required: false, description: 'ACTIVE or INACTIVE (defaults to ACTIVE on create)' }
  */

  const { id, employee_id, username, password, access, access_id, status } = req.body
  const roleAccess = access !== undefined ? access : access_id
  const currentUserId = req.user?.id || req.user?.user_id || null

  let query

  try {
    if (roleAccess !== undefined) {
      const valid = await accessRoleExists(roleAccess)
      if (!valid) {
        return res.status(400).json({ message: 'Invalid or inactive access role' })
      }
    }

    if (id) {
      let updateData = {}
      if (employee_id !== undefined) updateData[Master.User.cols.employee_id] = employee_id
      if (username !== undefined) updateData[Master.User.cols.username] = username
      if (password !== undefined) updateData[Master.User.cols.password] = EncryptString(password)
      if (roleAccess !== undefined) updateData[Master.User.cols.access_id] = roleAccess
      if (status !== undefined) updateData[Master.User.cols.status] = status

      if (Master.User.cols.updatedAt) updateData[Master.User.cols.updatedAt] = new Date()
      if (Master.User.cols.updatedBy && currentUserId)
        updateData[Master.User.cols.updatedBy] = currentUserId

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: 'No data to update' })
      } else {
        query = SQL.model(Master.User).update(updateData).where(Master.User.pk, id).build()
      }
    } else {
      if (!username || !password) {
        return res.status(400).json({ message: 'Missing required fields' })
      }
      if (roleAccess === undefined) {
        return res.status(400).json({ message: 'access (role) is required' })
      }

      query = SQL.model(Master.User)
        .insert({
          [Master.User.cols.employee_id]: employee_id,
          [Master.User.cols.username]: username,
          [Master.User.cols.password]: EncryptString(password),
          [Master.User.cols.access_id]: roleAccess,
          [Master.User.cols.status]: status || 'ACTIVE',
          ...(Master.User.cols.createdBy && currentUserId
            ? { [Master.User.cols.createdBy]: currentUserId }
            : {}),
          ...(Master.User.cols.createdAt ? { [Master.User.cols.createdAt]: new Date() } : {}),
        })
        .build()
    }

    const result = await Query(query.sql, query.bindings)
    const affected = result?.affectedRows || result?.[0]?.affectedRows || 0

    if (id && affected === 0) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.status(200).json({
      message: id ? 'Updated successfully' : 'Created successfully',
    })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: 'Error processing User' })
  }
}

/**
 * @name getMasterUser
 * @description Get all Master User records, joined with Employee and
 *              Access for display purposes.
 *
 *              IMPORTANT: `employee_id` here is unconditionally
 *              master_user.mu_employee_id — the actual foreign key
 *              pointing at master_employee.me_id. This is the value
 *              every downstream consumer needs (Cash Request's
 *              cr_employee_id, Cash Disbursement, the logged-in user's
 *              session payload used to auto-populate the Requester field
 *              on the Cash Request form, etc.).
 *
 *              Previously this column was conditionally overwritten with
 *              master_employee.me_employee_id (the human-readable HR
 *              code, e.g. "EMP-1024") under the SAME "employee_id"
 *              alias whenever the Employee join was available — which
 *              silently broke every FK lookup that expected an me_id
 *              integer. That HR code is now returned separately as
 *              `employee_code` so it's still available if a display
 *              label ever needs it, without shadowing the FK.
 */
const getMasterUser = async (req, res) => {
  // #swagger.tags = ['Master User']
  // #swagger.description = 'Get all Master User records joined with Employee and Access. employee_id is the FK to master_employee.me_id; the human-readable HR code is returned separately as employee_code.'
  /*
    #swagger.responses[200] = {
      description: 'List of users',
      schema: [
        {
          id: 1,
          user_id: 1,
          username: 'string',
          status: 'ACTIVE',
          access_id: 1,
          access_name: 'string',
          employee_id: 1,
          employee_code: 'string',
          fullname: 'string',
          department_id: 1,
          position_id: 1,
          createdAt: '2026-10-30T08:00:00.000Z'
        }
      ]
    }
  */
  try {
    const selectCols = [
      `${Master.User.table}.${Master.User.cols.id} AS id`,
      `${Master.User.table}.${Master.User.cols.id} AS user_id`,
      `${Master.User.table}.${Master.User.cols.username} AS username`,
      `${Master.User.table}.${Master.User.cols.status} AS status`,
      `${Master.User.table}.${Master.User.cols.access_id} AS access_id`,
      // The FK to master_employee.me_id — what every other controller
      // (Cash Request, Cash Disbursement, etc.) actually expects.
      `${Master.User.table}.${Master.User.cols.employee_id} AS employee_id`,
    ]

    // Human-readable HR code — kept under a distinct alias so it never
    // collides with the FK above.
    if (Master.Employee?.table && Master.Employee.cols.employee_id) {
      selectCols.push(
        `${Master.Employee.table}.${Master.Employee.cols.employee_id} AS employee_code`,
      )
    }

    if (Master.Access?.table && Master.Access.cols.name) {
      selectCols.push(`${Master.Access.table}.${Master.Access.cols.name} AS access_name`)
    }

    if (Master.Employee?.table && Master.Employee.cols.fullname) {
      selectCols.push(`${Master.Employee.table}.${Master.Employee.cols.fullname} AS fullname`)
    }

    if (Master.Employee?.table && Master.Employee.cols.department_id) {
      selectCols.push(
        `${Master.Employee.table}.${Master.Employee.cols.department_id} AS department_id`,
      )
    }

    if (Master.Employee?.table && Master.Employee.cols.position_id) {
      selectCols.push(`${Master.Employee.table}.${Master.Employee.cols.position_id} AS position_id`)
    }

    if (Master.User.cols.createdAt) {
      selectCols.push(`${Master.User.table}.${Master.User.cols.createdAt} AS createdAt`)
    }

    let builder = SQL.model(Master.User).select(selectCols)

    if (Master.Employee?.table) {
      builder = builder.leftJoin(
        Master.Employee.table,
        `${Master.User.table}.${Master.User.cols.employee_id}`,
        `${Master.Employee.table}.${Master.Employee.pk}`,
      )
    }

    if (Master.Access?.table) {
      builder = builder.leftJoin(
        Master.Access.table,
        `${Master.User.table}.${Master.User.cols.access_id}`,
        `${Master.Access.table}.${Master.Access.pk}`,
      )
    }

    const { sql, bindings } = builder.build()
    const result = await Query(sql, bindings)

    const usersData = Array.isArray(result)
      ? Array.isArray(result[0])
        ? result[0]
        : result
      : result?.data || []

    return res.status(200).json(usersData)
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: 'Error retrieving User records' })
  }
}

module.exports = {
  getMasterUser,
  upsertMasterUser,
}
