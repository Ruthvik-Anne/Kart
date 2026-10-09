import { Card, PageHead } from '@/components/ui';

/** Honest placeholder for modules that are on the roadmap but not built in this release. */
export function ComingSoon({ kicker, title, icon, points }: { kicker: string; title: string; icon: string; points: string[] }) {
  return (
    <>
      <PageHead kicker={kicker} title={title} />
      <Card className="max-w-xl">
        <div className="mb-3 text-4xl" aria-hidden>{icon}</div>
        <p className="mb-3 text-sm font-bold">Not built yet in this release. Planned:</p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{points.map(p => <li key={p}>{p}</li>)}</ul>
      </Card>
    </>
  );
}
