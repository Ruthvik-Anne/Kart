import { describe, expect, it } from 'vitest';
import { isThemeChoice, resolveTheme } from './theme';

describe('theme', () => {
  it('resolves explicit choices regardless of system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('follows the system preference for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('validates stored values', () => {
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('blue')).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});
