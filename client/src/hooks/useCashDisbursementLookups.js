import { useState, useEffect, useCallback } from 'react'
import { revolvingFundApi } from '../api/revolvingFundApi'
import { budgetApi } from '../api/budgetApi'
import { masterDepartmentApi } from '../api/masterDepartmentApi'
import { masterEmployeeApi } from '../api/masterEmployeeApi'
import { getAllTimeRange } from '../utils/dateRange'

/**
 * Cash Disbursement page's lookup hook. Trimmed from the original
 * shared version to only what the Disbursements list + Create/Edit/
 * Submit modals actually read: revolvingFunds, budgets (needed
 * internally by getFundLabel — the page never touches `budgets`
 * itself), departments, and employees.
 *
 * particulars/users/accessRoles/routeAccess/projects were fetched here
 * before but had no consumer on this page — they now live in
 * useCashRequestLookups / useLiquidationLookups / useAccessLookups,
 * scoped to the routes that actually read them. Same fetch pattern
 * (Promise.allSettled + unwrap) as before, just fewer calls.
 *
 * Funds are fetched ALL-TIME: the backend defaults to today's funds when
 * no date range is sent, which would make getFundLabel return "Unknown
 * Fund" for any disbursement from an earlier date.
 */
export function useCashDisbursementLookups() {
  const [revolvingFunds, setRevolvingFunds] = useState([])
  const [budgets, setBudgets] = useState([])
  const [departments, setDepartments] = useState([])
  const [employees, setEmployees] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const allTime = getAllTimeRange()
      const [rfRes, budgetRes, deptRes, empRes] = await Promise.allSettled([
        revolvingFundApi.getAll({ dateFrom: allTime.from, dateTo: allTime.to }),
        budgetApi.getAll(),
        masterDepartmentApi.getAll(),
        masterEmployeeApi.getAll(),
      ])

      const unwrap = (res) => {
        if (res.status !== 'fulfilled') return []
        const val = res.value
        return Array.isArray(val) ? val : val?.data || val?.result || []
      }

      setRevolvingFunds(unwrap(rfRes))
      setBudgets(unwrap(budgetRes))
      setDepartments(unwrap(deptRes))
      setEmployees(unwrap(empRes))
    } catch (err) {
      console.error('Failed to fetch cash disbursement lookups:', err)
      setError('Failed to load reference data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const getDepartmentName = useCallback(
    (id) => {
      const match = departments.find((d) => String(d.id || d.md_id) === String(id))
      return match?.name || match?.md_name || `Department #${id ?? 'N/A'}`
    },
    [departments],
  )

  const getEmployeeName = useCallback(
    (id) => {
      const match = employees.find((e) => String(e.id || e.me_id) === String(id))
      return match?.fullname || match?.me_fullname || `${id ?? 'N/A'}`
    },
    [employees],
  )

  const getFundLabel = useCallback(
    (id) => {
      const fund = revolvingFunds.find((f) => String(f.id || f.rf_id) === String(id))
      if (!fund) return 'Unknown Fund'

      const budget = budgets.find(
        (b) => String(b.id || b.b_id) === String(fund.budget_id || fund.rf_budget_id),
      )
      if (!budget) return 'Unknown Fund'

      const deptName = getDepartmentName(budget.department_id || budget.b_department_id)
      return budget.type ? `${deptName} — ${budget.type}` : deptName
    },
    [revolvingFunds, budgets, getDepartmentName],
  )

  return {
    revolvingFunds,
    budgets,
    departments,
    employees,
    isLoading,
    error,
    refetch: fetchAll,
    getDepartmentName,
    getEmployeeName,
    getFundLabel,
  }
}

export default useCashDisbursementLookups
