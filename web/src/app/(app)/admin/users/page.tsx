'use client';
import { useKart } from '@/mock/StoreProvider';
import { Badge, DataTable, kc, Notice, PageHead } from '@/components/ui';
import { permissionsOf } from '@/rbac/policy';

export default function Users() {
  const { k } = useKart();
  return (
    <>
      <PageHead kicker="PLATFORM ADMIN" title="Users & roles" sub="Who can do what. Permissions come from roles in one policy file, never from individual flags." />
      <Notice>Role editing is not enabled in the demo. In production, role changes will be server-side and audited.</Notice>
      <DataTable head={['User', 'Roles', 'Capabilities', 'Permissions', 'Wallet']} rows={k.db.users.map(u => [
        <b key="n">{u.name}</b>,
        u.roles.map(r => <Badge key={r} tone="blue">{r.replace('_', ' ')}</Badge>),
        <span key="c" className="flex gap-1">{u.providerEnabled && <Badge>provider</Badge>}{u.storeType && <Badge tone="amber">{u.storeType}</Badge>}</span>,
        <span key="p" className="text-muted">{permissionsOf(u).size}</span>,
        u.roles.includes('student') ? kc(k.balance(u.id)) : '—'])} />
    </>
  );
}
