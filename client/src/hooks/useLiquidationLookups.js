import { useState, useEffect, useCallback } from 'react'
import { revolvingFundApi } from '../api/revolvingFundApi'
import { budgetApi } from '../api/budgetApi'
import { masterDepartmentApi } from '../api/masterDepartmentApi'
import { masterEmployeeApi } from '../api/masterEmployeeApi'
import { masterParticularsApi } from '../api/masterParticularsApi'
import { unwrapSettled, unwrapList } from '../utils/apiResponse'
import { findDepartmentName, findEmployeeName, findFundLabel } from '../utils/lookupHelpers'
import { getAllTimeRange } from '../utils/dateRange'

// Same search-on-type pattern as useLiquidationMasterData's Store field —
// a small initial ACTIVE batch, then a fresh server search per call via
// searchParticulars, instead of loading and client-filtering the whole
// master_particulars table.
const INITIAL_PARTICULARS_LIMIT = 20
const SEARCH_PARTICULARS_LIMIT = 20

const toParticularOption = (p) => ({
  value: p.id,
  label: p.code ? `${p.code} ${p.name || p.description}` : p.name || p.description,
})

/**
 * Liquidation page's lookup hook. Scoped to what the Liquidation list +
 * Edit/Approve/Verify/Finance modals actually read: particulars
 * (search-on-type — see searchParticulars), employees + getEmployeeName,
 * and revolvingFunds + budgets + departments purely so getFundLabel can
 * resolve a disbursement's originating fund to a display name.
 *
 * Deliberately does NOT duplicate what the page fetches via its own
 * dedicated hooks, left untouched: useLiquidationMasterData
 * (districts/modes/searchStores/searchModes), useCashDisbursements
 * (disbursement rows, for the Verify modal's fund picker), and
 * useRevolvingFunds (full fund list with status, same picker).
 *
 * Funds are fetched ALL-TIME: the backend defaults to today's funds when
 * no date range is sent, which would make getFundLabel miss any fund
 * started on an earlier date.
 */
export function useLiquidationLookups() {
  const [revolvingFunds, setRevolvingFunds] = useState([])
  const [budgets, setBudgets] = useState([])
  const [departments, setDepartments] = useState([])
  const [employees, setEmployees] = useState([])
  const [particulars, setParticulars] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const allTime = getAllTimeRange()
      const [rfRes, budgetRes, deptRes, empRes, partRes] = await Promise.allSettled([
        revolvingFundApi.getAll({ dateFrom: allTime.from, dateTo: allTime.to }),
        budgetApi.getAll(),
        masterDepartmentApi.getAll(),
        masterEmployeeApi.getAll(),
        masterParticularsApi.getAll({ status: 'ACTIVE', limit: INITIAL_PARTICULARS_LIMIT }),
      ])

      setRevolvingFunds(unwrapSettled(rfRes))
      setBudgets(unwrapSettled(budgetRes))
      setDepartments(unwrapSettled(deptRes))
      setEmployees(unwrapSettled(empRes))
      setParticulars(unwrapSettled(partRes))
    } catch (err) {
      console.error('Failed to fetch liquidation lookups:', err)
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
    isLoading,
    error,
    refetch: fetchAll,
    searchParticulars,
    getDepartmentName,
    getEmployeeName,
    getFundLabel,
  }
}

export default useLiquidationLookups
