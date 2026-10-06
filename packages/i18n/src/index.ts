export const locales = ['en', 'ml'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const loadMessages = async (locale: Locale) =>
  (await import(`../messages/${locale}.json`)).default;
export * from './enumLabels';
