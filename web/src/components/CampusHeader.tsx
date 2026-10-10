'use client';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { COLLEGE_IMAGE, COLLEGE_LOGO, useCampusName } from '@/lib/campus';

/** The branded hero every role's dashboard opens with: campus photo, college logo and who you are. */
export function CampusHeader({ campusId, kicker, title, sub, role, actions, children }: {
  campusId?: string;
  kicker: string;
  title: ReactNode;
  sub?: string;
  role?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const college = useCampusName(campusId);
  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-brand-950 text-white shadow-sm">
      <Image src={COLLEGE_IMAGE} alt={`${college} campus`} fill priority sizes="(max-width: 768px) 100vw, 1200px"
        className="object-cover object-center" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-brand-950/96 via-brand-950/80 to-brand-950/35" />
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#1d4536] blur-2xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-5 p-6 md:p-8">
        <div className="flex min-w-0 items-start gap-4">
          <Image src={COLLEGE_LOGO} alt={`${college} logo`} width={64} height={64} priority
            className="h-14 w-14 flex-none rounded-xl bg-white object-contain p-1 ring-1 ring-white/40 md:h-16 md:w-16" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-[#9dc3a8]">{kicker}</p>
              {role && <span className="rounded-full bg-[#eeac54] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-brand-950">{role}</span>}
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight tracking-tight text-white md:text-3xl">{title}</h1>
            {sub && <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-[#d6e7da] md:text-sm">{sub}</p>}
            <p className="mt-3 truncate text-[11px] font-bold uppercase tracking-wider text-[#a9c9b3]">{college}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
