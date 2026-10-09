import { describe, expect, it } from 'vitest';
import preset from '../tailwind.preset';
import { PRIORITY_KEYS, STATUS_KEYS } from './tokens';

describe('tailwind preset — design tokens', () => {
  const colors = preset.theme?.extend?.colors as
    | Record<string, unknown>
    | undefined;

  it('exposes theme.extend.colors.primary', () => {
    expect(colors?.primary).toBeDefined();
    expect(typeof (colors?.primary as Record<string, string>)?.[500]).toBe(
      'string',
    );
  });

  it('exposes a color token for each of the 4 priorities', () => {
    const priorityColors = colors?.priority as
      | Record<string, string>
      | undefined;
    expect(priorityColors).toBeDefined();
    for (const key of PRIORITY_KEYS) {
      expect(priorityColors?.[key], `priority.${key}`).toBeDefined();
      expect(typeof priorityColors?.[key]).toBe('string');
    }
    expect(Object.keys(priorityColors ?? {})).toHaveLength(
      PRIORITY_KEYS.length,
    );
  });

  it('exposes a color token for each of the 10 statuses', () => {
    const statusColors = colors?.status as Record<string, string> | undefined;
    expect(statusColors).toBeDefined();
    for (const key of STATUS_KEYS) {
      expect(statusColors?.[key], `status.${key}`).toBeDefined();
      expect(typeof statusColors?.[key]).toBe('string');
    }
    expect(Object.keys(statusColors ?? {})).toHaveLength(STATUS_KEYS.length);
  });

  it('defines exact breakpoints via theme.screens', () => {
    expect(preset.theme?.screens).toEqual({
      xs: '320px',
      sm: '375px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px',
    });
  });
});
