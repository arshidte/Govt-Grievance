import type { Language } from '@pg/types';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface LanguageSwitcherProps {
  /** Currently active language. */
  value: Language;
  /** Called with the newly chosen language when the user picks a different one. */
  onChange: (language: Language) => void;
  /**
   * Translation function for the switcher's own accessible label and the
   * two language option labels. Keeps the component i18n-pure — no
   * hardcoded English. Keys resolved: `languageSwitcher.label`,
   * `languageSwitcher.en`, `languageSwitcher.ml`.
   */
  t: (key: string) => string;
  className?: string;
}

const LANGUAGES: Language[] = ['en', 'ml'];

/**
 * Toggles the UI language between `en` and `ml` (@pg/types' `Language`).
 * Rendered as a labeled `radiogroup` of two buttons (not a native <select>)
 * so both options are visible at once and the active one is exposed via
 * `aria-checked`, which reads better for a 2-option toggle than a dropdown.
 */
export function LanguageSwitcher({ value, onChange, t, className }: LanguageSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label={t('languageSwitcher.label')}
      className={cn('inline-flex rounded-md border border-neutral-200 p-0.5', className)}
    >
      {LANGUAGES.map((lang) => {
        const isActive = lang === value;
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(lang)}
            className={cn(
              'min-h-11 rounded-sm px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              isActive ? 'bg-primary-600 text-white' : 'bg-transparent text-neutral-700 hover:bg-neutral-100',
            )}
          >
            {t(`languageSwitcher.${lang}`)}
          </button>
        );
      })}
    </div>
  );
}
