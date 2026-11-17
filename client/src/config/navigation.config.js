import {
  LayoutDashboard,
  Database,
  Wallet,
  FileCheck2,
  BarChart3,
  Building2,
  Banknote,
} from 'lucide-react'

export const NAVIGATION_ITEMS = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    type: 'link',
    to: '/dashboard',
    permissionKey: 'dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'master-files',
    title: 'Master Files',
    type: 'dropdown',
    icon: Database,
    children: [
      {
        id: 'master-access',
        title: 'User Access & Permissions',
        to: '/master/access',
        permissionKey: 'access',
      },
      { id: 'master-users', title: 'Users', to: '/master/users', permissionKey: 'users' },
      {
        id: 'master-route-access',
        title: 'Route Access',
        to: '/master/routeAccess',
        permissionKey: 'route-access',
      },
      {
        id: 'master-departments',
        title: 'Departments',
        to: '/master/departments',
        permissionKey: 'departments',
      },
      {
        id: 'master-employees',
        title: 'Employees',
        to: '/master/employees',
        permissionKey: 'employees',
      },
      {
        id: 'master-districts',
        title: 'Districts & Stores',
        to: '/master/districts',
        permissionKey: 'districts',
      },
      {
        id: 'master-transport',
        title: 'Modes of Transportation',
        to: '/master/transportation',
        permissionKey: 'transportation',
      },
      {
        id: 'master-particulars',
        title: 'Particulars & Expense Types',
        to: '/master/particulars',
        permissionKey: 'particulars',
      },
      {
        id: 'master-projects',
        title: 'Projects',
        to: '/master/project',
        permissionKey: 'project',
      },
      {
        id: 'master-synchronize',
        title: 'HRMIS Synchronize',
        to: '/master/synchronize',
        permissionKey: 'synchronize',
      },
    ],
  },
  {
    id: 'fund-management',
    title: 'Fund Management',
    type: 'dropdown',
    icon: Building2,
    children: [
      {
        id: 'fund-allocations',
        title: 'Budget Allocations',
        to: '/funds/budget',
        permissionKey: 'budget',
      },
      {
        id: 'fund-revolving',
        title: 'Revolving Funds',
        to: '/funds/revolving',
        permissionKey: 'revolving',
      },
      {
        id: 'fund-disbursements',
        title: 'Disbursement Register',
        to: '/funds/disbursements',
        permissionKey: 'disbursements',
      },
      // {
      //   id: 'fund-history',
      //   title: 'Audit History',
      //   to: '/funds/audit-history',
      //   permissionKey: 'audit-history',
      // },
    ],
  },
  {
    id: 'my-workbench',
    title: 'My Workbench',
    type: 'dropdown',
    icon: Wallet,
    children: [
      {
        id: 'wb-cash-requests',
        title: 'Cash Requests',
        to: '/workbench/request',
        permissionKey: 'requests',
      },
      {
        id: 'wb-liquidations',
        title: 'Liquidations',
        to: '/workbench/liquidation',
        permissionKey: 'liquidations',
      },
      // {
      //   id: 'wb-approvals',
      //   title: 'Approvals & Reviews',
      //   to: '/workbench/approvals',
      //   permissionKey: 'approvals',
      // },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Logs',
    type: 'dropdown',
    icon: BarChart3,
    children: [
      {
        id: 'report-budget',
        title: 'Budget Reports',
        to: '/reports/reportBudget',
        permissionKey: 'report-budget',
      },
      {
        id: 'report-flag-analysis',
        title: 'Flag Analysis',
        to: '/reports/flag-analysis',
        permissionKey: 'flag-analysis',
      },
    ],
  },
]

/**
 * Flat pathname -> permissionKey lookup, derived once from
 * NAVIGATION_ITEMS. Colocated here (rather than rebuilt in
 * _authenticated.jsx) so the sidebar and the router guard can never
 * drift apart on how a path maps to a permission key — there's only
 * one place that mapping is defined.
 */
const PATH_TO_PERMISSION_KEY = NAVIGATION_ITEMS.reduce((map, item) => {
  if (item.type === 'link') {
    map[item.to] = item.permissionKey
  } else if (item.type === 'dropdown') {
    ;(item.children || []).forEach((child) => {
      map[child.to] = child.permissionKey
    })
  }
  return map
}, {})

/**
 * Resolves the permissionKey a given router pathname maps to, or
 * undefined if the path isn't in NAVIGATION_ITEMS at all (e.g. a
 * dynamic sub-route not yet listed).
 */
export function getPermissionKeyForPath(pathname) {
  return PATH_TO_PERMISSION_KEY[pathname]
}

// Sub-routes that aren't sidebar entries but still need a permission key
// for the route guard — piggyback on their parent feature's permission.
const EXTRA_PATH_TO_PERMISSION_KEY = {
  '/workbench/liquidationDetail': 'liquidations',
}

Object.assign(PATH_TO_PERMISSION_KEY, EXTRA_PATH_TO_PERMISSION_KEY)

/**
 * Returns the `to` path of the first NAVIGATION_ITEMS entry (in
 * declared order) that canAccessRoute allows, or null if none are
 * accessible. Used as the redirect target when a denied route needs
 * somewhere to send the user — hardcoding /dashboard breaks for any
 * role that wasn't explicitly granted dashboard access.
 */
export function getFirstAccessiblePath(canAccessRoute) {
  for (const item of NAVIGATION_ITEMS) {
    if (item.type === 'link' && canAccessRoute(item.permissionKey)) {
      return item.to
    }
    if (item.type === 'dropdown') {
      const child = (item.children || []).find((c) => canAccessRoute(c.permissionKey))
      if (child) return child.to
    }
  }
  return null
}
