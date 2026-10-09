// Single source of truth for roles, permissions, navigation and route guards.
// Front-end checks are UX only; the future FastAPI backend must re-enforce them.

export type Role = 'student' | 'vendor' | 'campus_admin' | 'platform_admin';
export type StoreType = 'canteen' | 'xerox' | 'stationery' | 'merch';

export type Permission =
  | 'catalog:view' | 'order:create' | 'order:view:own' | 'print:create'
  | 'task:view' | 'task:post' | 'task:bid' | 'task:approve' | 'thread:use'
  | 'service:offer' | 'listing:create' | 'event:register' | 'event:create' | 'wallet:view:own'
  | 'provider:hub'
  | 'store:manage' | 'store:orders:update' | 'store:settlements'
  | 'user:verify' | 'vendor:approve' | 'event:approve' | 'campus:report'
  | 'dispute:resolve' | 'ledger:view:all' | 'chain:audit' | 'fraud:view' | 'user:roles' | 'fees:edit';

const STUDENT: Permission[] = [
  'catalog:view', 'order:create', 'order:view:own', 'print:create', 'task:view', 'task:post',
  'task:bid', 'task:approve', 'thread:use', 'service:offer', 'listing:create', 'event:register',
  'event:create', 'wallet:view:own',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  student: STUDENT,
  vendor: ['catalog:view', 'store:manage', 'store:orders:update', 'store:settlements'],
  campus_admin: ['catalog:view', 'user:verify', 'vendor:approve', 'event:approve', 'campus:report'],
  platform_admin: [
    'catalog:view', 'dispute:resolve', 'ledger:view:all', 'chain:audit', 'fraud:view',
    'user:roles', 'fees:edit', 'user:verify',
  ],
};

export interface User {
  id: string;
  name: string;
  roles: Role[];
  providerEnabled?: boolean; // capability on a student, granted after verification
  storeId?: string;
  storeType?: StoreType;
  campusId: string;
}

export interface Resource { ownerId?: string; assigneeId?: string; storeId?: string }

export function permissionsOf(user: User): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of user.roles) ROLE_PERMISSIONS[role].forEach(p => set.add(p));
  if (user.providerEnabled && user.roles.includes('student')) set.add('provider:hub');
  return set;
}

/** Permission check with optional ownership scoping for resource-bound actions. */
export function can(user: User | null | undefined, permission: Permission, resource?: Resource): boolean {
  if (!user || !permissionsOf(user).has(permission)) return false;
  if (!resource) return true;
  switch (permission) {
    case 'task:approve':
      return resource.ownerId === user.id;
    case 'thread:use':
      return resource.ownerId === user.id || resource.assigneeId === user.id;
    case 'store:orders:update':
    case 'store:manage':
    case 'store:settlements':
      return !!user.storeId && resource.storeId === user.storeId;
    case 'order:view:own':
    case 'wallet:view:own':
      return resource.ownerId === user.id;
    default:
      return true;
  }
}

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  requires: Permission;
  section: 'Campus' | 'More' | 'Work' | 'Store' | 'Admin';
  storeTypes?: StoreType[]; // vendor-only visibility by store type
  roles?: Role[];           // restrict to roles even if the permission is shared
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦', requires: 'catalog:view', section: 'Campus', roles: ['student'] },
  { href: '/food', label: 'Food & Canteen', icon: '🍽️', requires: 'order:create', section: 'Campus' },
  { href: '/xerox', label: 'Xerox & Print', icon: '🖨️', requires: 'print:create', section: 'Campus' },
  { href: '/shop', label: 'Supplies & Merch', icon: '📐', requires: 'order:create', section: 'Campus' },
  { href: '/services', label: 'Student Services', icon: '✦', requires: 'catalog:view', section: 'Campus', roles: ['student'] },
  { href: '/tasks', label: 'Task Board', icon: '⚡', requires: 'task:view', section: 'Campus' },
  { href: '/my-tasks', label: 'My Tasks', icon: '☑', requires: 'task:post', section: 'Campus' },
  { href: '/marketplace', label: 'Buy / Sell / Rent', icon: '⇄', requires: 'listing:create', section: 'More' },
  { href: '/events', label: 'Events', icon: '◇', requires: 'event:register', section: 'More' },
  { href: '/orders', label: 'My Orders', icon: '◫', requires: 'order:view:own', section: 'More' },
  { href: '/messages', label: 'Messages', icon: '✉', requires: 'thread:use', section: 'More' },
  { href: '/wallet', label: 'KC Wallet', icon: '◉', requires: 'wallet:view:own', section: 'More' },
  { href: '/notifications', label: 'Notifications', icon: '🔔', requires: 'catalog:view', section: 'More' },
  { href: '/provider', label: 'Provider Hub', icon: '★', requires: 'provider:hub', section: 'Work' },

  { href: '/vendor', label: 'Console', icon: '▤', requires: 'store:manage', section: 'Store' },
  { href: '/vendor/menu', label: 'Menu & stock', icon: '🍴', requires: 'store:manage', section: 'Store', storeTypes: ['canteen'] },
  { href: '/vendor/inventory', label: 'Inventory', icon: '📦', requires: 'store:manage', section: 'Store', storeTypes: ['stationery', 'merch'] },
  { href: '/vendor/queue', label: 'Order queue', icon: '⏱', requires: 'store:orders:update', section: 'Store', storeTypes: ['canteen', 'stationery', 'merch'] },
  { href: '/vendor/print-queue', label: 'Print queue', icon: '🖨️', requires: 'store:orders:update', section: 'Store', storeTypes: ['xerox'] },
  { href: '/vendor/pricing', label: 'Pricing', icon: '₹', requires: 'store:manage', section: 'Store', storeTypes: ['xerox'] },
  { href: '/vendor/settlements', label: 'Settlements', icon: '◉', requires: 'store:settlements', section: 'Store' },

  { href: '/admin/verification', label: 'Verification', icon: '✔', requires: 'user:verify', section: 'Admin' },
  { href: '/admin/vendors', label: 'Vendors', icon: '🏪', requires: 'vendor:approve', section: 'Admin' },
  { href: '/admin/events', label: 'Event approvals', icon: '◇', requires: 'event:approve', section: 'Admin' },
  { href: '/admin/reports', label: 'Campus reports', icon: '▥', requires: 'campus:report', section: 'Admin' },
  { href: '/admin/disputes', label: 'Disputes', icon: '⚖', requires: 'dispute:resolve', section: 'Admin' },
  { href: '/admin/ledger', label: 'Ledger explorer', icon: '≣', requires: 'ledger:view:all', section: 'Admin' },
  { href: '/admin/chain', label: 'Audit chain', icon: '⛓', requires: 'chain:audit', section: 'Admin' },
  { href: '/admin/fraud', label: 'Fraud alerts', icon: '⚠', requires: 'fraud:view', section: 'Admin' },
  { href: '/admin/users', label: 'Users & roles', icon: '☰', requires: 'user:roles', section: 'Admin' },
  { href: '/admin/fees', label: 'Fees & weights', icon: '%', requires: 'fees:edit', section: 'Admin' },
];

function visible(user: User, item: NavItem): boolean {
  if (!can(user, item.requires)) return false;
  if (item.roles && !item.roles.some(r => user.roles.includes(r))) return false;
  if (item.storeTypes && (!user.storeType || !item.storeTypes.includes(user.storeType))) return false;
  return true;
}

export const navFor = (user: User): NavItem[] => NAV.filter(item => visible(user, item));

/** Most specific nav entry for a pathname decides the guard (longest href prefix). */
export function guardFor(pathname: string): NavItem | undefined {
  return NAV.filter(n => pathname === n.href || pathname.startsWith(n.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function canVisit(user: User | null | undefined, pathname: string): boolean {
  if (!user) return false;
  const entry = guardFor(pathname);
  return entry ? visible(user, entry) : true; // unknown routes need only a session
}

export function homeFor(user: User): string {
  if (user.roles.includes('platform_admin')) return '/admin/disputes';
  if (user.roles.includes('campus_admin')) return '/admin/verification';
  if (user.roles.includes('vendor')) return '/vendor';
  return '/dashboard';
}
