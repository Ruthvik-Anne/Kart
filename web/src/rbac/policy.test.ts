import { describe, expect, it } from 'vitest';
import { can, canVisit, guardFor, homeFor, navFor, type User } from './policy';

const base = { campusId: 'c1' };
const student: User = { id: 's1', name: 'Alex', roles: ['student'], ...base };
const provider: User = { ...student, id: 's2', providerEnabled: true };
const canteen: User = { id: 'v1', name: 'Campus Bites', roles: ['vendor'], storeId: 'st1', storeType: 'canteen', ...base };
const xerox: User = { id: 'v2', name: 'Library Xerox', roles: ['vendor'], storeId: 'st2', storeType: 'xerox', ...base };
const campusAdmin: User = { id: 'a1', name: 'Dean', roles: ['campus_admin'], ...base };
const platformAdmin: User = { id: 'p1', name: 'Ops', roles: ['platform_admin'], ...base };

const labels = (u: User) => navFor(u).map(n => n.label);

describe('can()', () => {
  it('denies without a session', () => expect(can(null, 'catalog:view')).toBe(false));
  it('lets students post and bid but not administer', () => {
    expect(can(student, 'task:post')).toBe(true);
    expect(can(student, 'task:bid')).toBe(true);
    expect(can(student, 'ledger:view:all')).toBe(false);
    expect(can(student, 'store:manage')).toBe(false);
  });
  it('grants provider hub only to enabled student providers', () => {
    expect(can(student, 'provider:hub')).toBe(false);
    expect(can(provider, 'provider:hub')).toBe(true);
  });
  it('scopes approval to the task owner', () => {
    expect(can(student, 'task:approve', { ownerId: 's1' })).toBe(true);
    expect(can(student, 'task:approve', { ownerId: 'other' })).toBe(false);
  });
  it('scopes task threads to poster and assignee', () => {
    expect(can(student, 'thread:use', { ownerId: 'x', assigneeId: 's1' })).toBe(true);
    expect(can(student, 'thread:use', { ownerId: 'x', assigneeId: 'y' })).toBe(false);
  });
  it('scopes vendor actions to their own store', () => {
    expect(can(canteen, 'store:orders:update', { storeId: 'st1' })).toBe(true);
    expect(can(canteen, 'store:orders:update', { storeId: 'st2' })).toBe(false);
  });
  it('keeps admin powers separate', () => {
    expect(can(platformAdmin, 'dispute:resolve')).toBe(true);
    expect(can(campusAdmin, 'dispute:resolve')).toBe(false);
    expect(can(campusAdmin, 'user:verify')).toBe(true);
  });
});

describe('dynamic navigation', () => {
  it('shows students the shopping and task items, and Food and Xerox as separate entries', () => {
    const l = labels(student);
    expect(l).toContain('Food & Canteen');
    expect(l).toContain('Xerox & Print');
    expect(l).toContain('Task Board');
    expect(l).toContain('Notifications');
    expect(l).not.toContain('Provider Hub');
    expect(l).not.toContain('Ledger explorer');
  });
  it('adds Provider Hub for providers', () => expect(labels(provider)).toContain('Provider Hub'));
  it('shows canteens a menu and queue, but no print queue', () => {
    const l = labels(canteen);
    expect(l).toContain('Menu & stock');
    expect(l).toContain('Order queue');
    expect(l).not.toContain('Print queue');
    expect(l).not.toContain('Food & Canteen');
    expect(l).not.toContain('KC Wallet'); // vendor money lives in settlements, not a student wallet
    expect(l).not.toContain('Task Board');
  });
  it('shows xerox vendors the print queue and pricing', () => {
    const l = labels(xerox);
    expect(l).toContain('Print queue');
    expect(l).toContain('Pricing');
    expect(l).not.toContain('Menu & stock');
  });
  it('gives admins only admin tooling', () => {
    expect(labels(platformAdmin)).toEqual(expect.arrayContaining(['Disputes', 'Ledger explorer', 'Audit chain']));
    expect(labels(platformAdmin)).not.toContain('Task Board');
    expect(labels(campusAdmin)).toContain('Verification');
    expect(labels(campusAdmin)).not.toContain('Ledger explorer');
  });
});

describe('route guard', () => {
  it('blocks a student from admin routes', () => {
    expect(canVisit(student, '/admin/ledger')).toBe(false);
    expect(canVisit(platformAdmin, '/admin/ledger')).toBe(true);
  });
  it('blocks a canteen from the xerox print queue', () => {
    expect(canVisit(canteen, '/vendor/print-queue')).toBe(false);
    expect(canVisit(xerox, '/vendor/print-queue')).toBe(true);
  });
  it('uses the longest matching prefix, so /vendor/queue does not fall back to /vendor', () => {
    expect(guardFor('/vendor/queue')?.href).toBe('/vendor/queue');
    expect(guardFor('/tasks/T-1')?.href).toBe('/tasks');
  });
  it('requires a session everywhere', () => expect(canVisit(null, '/dashboard')).toBe(false));
  it('sends each role to its own home', () => {
    expect(homeFor(student)).toBe('/dashboard');
    expect(homeFor(canteen)).toBe('/vendor');
    expect(homeFor(campusAdmin)).toBe('/admin/verification');
    expect(homeFor(platformAdmin)).toBe('/admin/disputes');
  });
});
