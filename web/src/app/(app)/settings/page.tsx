'use client';
import { useEffect, useState } from 'react';
import { Card, PageHead, cx } from '@/components/ui';
import { THEME_KEY, isThemeChoice, resolveTheme, type ThemeChoice } from '@/lib/theme';

const OPTIONS: { id: ThemeChoice; label: string; note: string }[] = [
  { id: 'light', label: 'Light', note: 'Bright surfaces' },
  { id: 'dark', label: 'Dark', note: 'Easier on the eyes at night' },
  { id: 'system', label: 'System', note: 'Match your device' },
];

export default function SettingsPage() {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the persisted choice after mount
    if (isThemeChoice(stored)) setChoice(stored);
  }, []);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = resolveTheme(choice, mq.matches); };
    apply();
    if (choice !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [choice]);

  const pick = (c: ThemeChoice) => { setChoice(c); localStorage.setItem(THEME_KEY, c); };

  return (
    <>
      <PageHead kicker="PREFERENCES" title="Settings" sub="Saved on this device." />
      <Card>
        <h2 className="mb-3 font-display text-lg font-bold">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map(o => (
            <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} onClick={() => pick(o.id)}
              className={cx('rounded-xl border-2 p-4 text-left text-xs', choice === o.id ? 'border-forest-800' : 'border-line')}>
              <b className="block font-display text-base">{o.label}</b><span className="text-muted">{o.note}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}
