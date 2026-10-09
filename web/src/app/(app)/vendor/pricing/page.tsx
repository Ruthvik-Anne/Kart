'use client';
import { Card, DataTable, kc, Notice, PageHead } from '@/components/ui';

const RATES: [string, number][] = [['Black & white page', 2], ['Colour page', 8], ['Spiral binding (per job)', 30]];

export default function Pricing() {
  return (
    <>
      <PageHead kicker="XEROX" title="Print pricing" sub="Current rates students see when they send a print request." />
      <Notice>Rates are fixed platform defaults in this demo. Editable per-shop pricing arrives with the backend.</Notice>
      <DataTable head={['Item', 'Price']} rows={RATES.map(([n, p]) => [n, kc(p)])} />
      <Card className="mt-4 text-xs text-muted">Double-sided jobs are charged per sheet (two pages per sheet).</Card>
    </>
  );
}
