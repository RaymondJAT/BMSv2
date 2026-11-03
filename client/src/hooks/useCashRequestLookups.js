import { useState, useEffect, useCallback, useMemo } from 'react'
import { revolvingFundApi } from '../api/revolvingFundApi'
import { budgetApi } from '../api/budgetApi'
import { masterDepartmentApi } from '../api/masterDepartmentApi'
import { masterEmployeeApi } from '../api/masterEmployeeApi'
import { masterParticularsApi } from '../api/masterParticularsApi'
import { masterUserApi } from '../api/masterUserApi'
import { masterProjectApi } from '../api/masterProjectApi'
import { unwrapSettled, unwrapList } from '../utils/apiResponse'
import { findDepartmentName, findEmployeeName, findFundLabel } from '../utils/lookupHelpers'
import { getAllTimeRange } from '../utils/dateRange'

const INITIAL_PARTICULARS_LIMIT = 20
const SEARCH_PARTICULARS_LIMIT = 20

const toParticularOption = (p) => ({
  value: p.id,
  label: p.code ? `${p.code} ${p.name || p.description}` : p.name || p.description,
})

// Strips spaces/punctuation and upper-cases — so "Team Leader" /
// "TEAM_LEAD" / "team-leader" all match. getMasterUser already joins
// access_name onto each user row, so no separate role-id lookup needed.
const normalizeRoleName = (name) =>
  String(name || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

/**
 * Cash Request page's lookup hook. Scoped to what the Create/Edit/
 * Approve/Disburse modals and the embedded Liquidate flow's cash-side
 * lookups actually read: revolvingFunds + budgets (for getFundLabel),
 * departments, employees, particulars (search-on-type — see
 * searchParticulars, handed to CreateLiquidationModal), projects (for
 * activeProjects), and users (for teamLeads).
 *
 * accessRoles/routeAccess are deliberately NOT fetched — nothing on this
 * page reads a roles map. districts/modes/searchStores/searchModes still
 * come from useLiquidationMasterData, untouched by this hook.
 *
 * Funds are fetched ALL-TIME: the backend defaults to today's funds when
 * no date range is sent, which would make getFundLabel miss any fund
 * started on an earlier date.
 */
export function useCashRequestLookups() {
  const [revolvingFunds, setRevolvingFunds] = useState([])
  const [budgets, setBudgets] = useState([])
  const [departments, setDepartments] = useState([])
  const [employees, setEmployees] = useState([])
  const [particulars, setParticulars] = useState([])
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const allTime = getAllTimeRange()
      const [rfRes, budgetRes, deptRes, empRes, partRes, userRes, projectRes] =
        await Promise.allSettled([
          revolvingFundApi.getAll({ dateFrom: allTime.from, dateTo: allTime.to }),
          budgetApi.getAll(),
          masterDepartmentApi.getAll(),
          masterEmployeeApi.getAll(),
          masterParticularsApi.getAll({ status: 'ACTIVE', limit: INITIAL_PARTICULARS_LIMIT }),
          masterUserApi.getAll(),
          // Master Project controller isn't wired up yet — fails soft via
          // Promise.allSettled so the rest of the page still loads.
          masterProjectApi?.getAll ? masterProjectApi.getAll() : Promise.resolve([]),
        ])

      setRevolvingFunds(unwrapSettled(rfRes))
      setBudgets(unwrapSettled(budgetRes))
      setDepartments(unwrapSettled(deptRes))
      setEmployees(unwrapSettled(empRes))
      setParticulars(unwrapSettled(partRes))
      setUsers(unwrapSettled(userRes))
      setProjects(unwrapSettled(projectRes))
    } catch (err) {
      console.error('Failed to fetch cash request lookups:', err)
      setError('Failed to load reference data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const searchParticulars = useCallback(async (term) => {
    try {
      const res = await masterParticularsApi.getAll({
        status: 'ACTIVE',
        search: term,
        limit: SEARCH_PARTICULARS_LIMIT,
      })
      return unwrapList(res).map(toParticularOption)
    } catch (err) {
      console.error('Failed to search particulars:', err)
      return []
    }
  }, [])

  // Cash Request "Project" dropdown should only offer ACTIVE projects.
  const activeProjects = useMemo(
    () => projects.filter((p) => String(p.status).toUpperCase() === 'ACTIVE'),
    [projects],
  )

  // Users with Team Leader access, filtered directly against the
  // already-joined access_name. Only ACTIVE users are offered as leads.
  const teamLeads = useMemo(() => {
    return users.filter((u) => {
      if (String(u.status).toUpperCase() !== 'ACTIVE') return false
      return normalizeRoleName(u.access_name).includes('TEAMLEAD')
    })
  }, [users])

  const getDepartmentName = useCallback((id) => findDepartmentName(departments, id), [departments])
  const getEmployeeName = useCallback((id) => findEmployeeName(employees, id), [employees])
  const getFundLabel = useCallback(
    (id) => findFundLabel(revolvingFunds, budgets, departments, id),
    [revolvingFunds, budgets, departments],
  )

  return {
    revolvingFunds,
    budgets,
    departments,
    employees,
    particulars,
    users,
    projects,
    activeProjects,
    teamLeads,
    isLoading,
    error,
    refetch: fetchAll,
    searchParticulars,
    getDepartmentName,
    getEmployeeName,
    getFundLabel,
  }
}

export default useCashRequestLookups
