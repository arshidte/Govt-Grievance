import { describe, it, expect } from 'vitest';
import { locales, defaultLocale, loadMessages } from './index';

describe('i18n index', () => {
  it('exposes the supported locales and default locale', () => {
    expect(locales).toEqual(['en', 'ml']);
    expect(defaultLocale).toBe('en');
  });

  it('loads the en message catalog', async () => {
    const messages = await loadMessages('en');
    expect(messages.common.appName).toBeTypeOf('string');
    expect(messages.status.submitted).toBeTypeOf('string');
  });

  it('loads the ml message catalog', async () => {
    const messages = await loadMessages('ml');
    expect(messages.common.appName).toBeTypeOf('string');
    expect(messages.status.submitted).toBeTypeOf('string');
  });
});
