import { Card } from '@pg/ui';
import { Landmark } from 'lucide-react';
import type { ReactNode } from 'react';

import { PublicLanguageSwitcher } from './PublicLanguageSwitcher';

export interface AuthShellProps {
  /** App/brand name shown beside the civic mark (already translated). */
  appName: string;
  /** Card heading (already translated). */
  title: string;
  /** Optional supporting line under the title (already translated). */
  subtitle?: string;
  /** The screen's form / content, rendered inside the centered card. */
  children: ReactNode;
  /**
   * Optional footer rendered OUTSIDE the card, under it (e.g. the landing
   * page's secondary links). Kept out of the card so it reads as page-level
   * navigation rather than part of the form.
   */
  footer?: ReactNode;
}

/**
 * Shared centered layout for the PUBLIC / unauthenticated screens (login,
 * verify, register, track — and adapted by the landing page). Implements the
 * P3 design direction: a full-height `bg-neutral-50` canvas, the
 * `LanguageSwitcher` parked top-right, and a single centered white `Card`
 * (`rounded-xl border-neutral-200`, ~`max-w-md`) carrying a civic brand mark,
 * a title + subtitle, then the screen's own content.
 *
 * It owns ONLY chrome/layout — every form's logic, validation, API calls and
 * testids live in the feature components passed as `children`, untouched.
 */
export function AuthShell({ appName, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen flex-col bg-neutral-50">
      {/* Top bar: language toggle parked top-right, reachable before auth. */}
      <div className="flex justify-end p-4">
        <PublicLanguageSwitcher />
      </div>

      {/* Centered column: brand mark + card, vertically centered in the
          remaining space (flex-1) with comfortable gutters. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-16">
        {/* Civic brand mark: the Landmark glyph in a solid primary chip,
            mirroring the authed sidebar brand for cross-shell consistency. */}
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white"
            aria-hidden="true"
          >
            <Landmark className="h-5 w-5" />
          </span>
          <span className="text-base font-semibold text-neutral-900">{appName}</span>
        </div>

        <Card className="w-full max-w-md p-6 sm:p-8">
          <div className="mb-6 flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
            {subtitle && <p className="text-sm text-neutral-600">{subtitle}</p>}
          </div>

          {children}
        </Card>

        {footer && <div className="w-full max-w-md">{footer}</div>}
      </div>
    </main>
  );
}
