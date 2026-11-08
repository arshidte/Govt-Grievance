'use client';

import { Landmark, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MeResponse } from '@pg/types';
import { LogoutButton } from '../features/auth/LogoutButton';
import { NavLinks, type SidebarProps } from './Sidebar';

/**
 * Below `lg`, the persistent Sidebar (Sidebar.tsx) is replaced by this
 * trigger-button + overlay-drawer pair, sharing the same `NavLinks` (same
 * item set/filtering/active-state as the desktop sidebar — see
 * Sidebar.tsx's module doc).
 *
 * This revamp restyles the trigger and drawer PANEL visuals to the design
 * language (branded panel header with a civic `Landmark` icon, lucide
 * `Menu`/`X` glyphs, white surface + `shadow-sm`-class floating drawer) but
 * leaves the accessibility behavior byte-for-byte intact, because the admin
 * Playwright shell spec asserts it exactly:
 *  - The trigger is a real `<button>` with `aria-expanded` reflecting open
 *    state and `aria-controls` pointing at the drawer's id.
 *  - The drawer is `role="dialog"` + `aria-modal="true"` with an
 *    `aria-label`; on open, focus moves to the drawer's close button, and
 *    on close focus returns to the trigger (standard dialog focus
 *    management) so keyboard/screen-reader users aren't dropped.
 *  - `Escape` closes the drawer while open and returns focus to the trigger.
 *  - Clicking a nav link closes the drawer (so the next route's content is
 *    immediately reachable rather than hidden behind the open overlay).
 *  - The overlay is `aria-hidden` and purely a click-to-close target; it
 *    carries no interactive semantics of its own.
 *  - `mobile-drawer` is mounted ONLY while open (`toHaveCount(0)` when
 *    closed), so the conditional render stays.
 *
 * `LogoutButton` is rendered at the bottom of the drawer panel (after
 * `NavLinks`, pushed down via `mt-auto` — same placement as the desktop
 * `Sidebar`). It is a plain render, not wired into the drawer's own
 * open/close state: logging out navigates to `/login` on success anyway,
 * which unmounts this drawer along with everything else.
 */
export function MobileDrawer({ roles }: SidebarProps & { roles: MeResponse['roles'] }) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="admin-mobile-drawer"
        data-testid="mobile-drawer-trigger"
        onClick={() => setOpen(true)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <Menu className="h-6 w-6" aria-hidden="true" />
        <span className="sr-only">{t('appName')}</span>
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            data-testid="mobile-drawer-overlay"
            onClick={close}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div
            id="admin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('appName')}
            data-testid="mobile-drawer"
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-4 border-r border-neutral-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white"
                  aria-hidden="true"
                >
                  <Landmark className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-neutral-900">{t('appName')}</span>
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                data-testid="mobile-drawer-close"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">{t('close')}</span>
              </button>
            </div>
            <NavLinks roles={roles} onNavigate={close} />

            <div className="mt-auto border-t border-neutral-200 pt-3">
              <LogoutButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
