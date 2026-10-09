'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor } from '@/rbac/policy';
import { useKart } from '@/mock/StoreProvider';

export default function Index() {
  const { ready, me } = useKart();
  const router = useRouter();
  useEffect(() => { if (ready) router.replace(me ? homeFor(me) : '/login'); }, [ready, me, router]);
  return null;
}
