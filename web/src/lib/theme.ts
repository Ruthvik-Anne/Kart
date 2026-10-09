export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_KEY = 'kart-theme';

export const isThemeChoice = (v: unknown): v is ThemeChoice => v === 'light' || v === 'dark' || v === 'system';
export const resolveTheme = (choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' =>
  choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;

/** Inline script run before first paint so the page never flashes the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_KEY}');var d=c==='dark'||((c!=='light')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
