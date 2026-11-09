'use client';

// NavItem attaches an onClick handler and supports `asChild` (Radix Slot, so
// the app can slot a framework Link while keeping styling), exactly like
// Button. Merging a handler onto a slotted Client Component child requires a
// client boundary, hence the directive. Server Components can still render
// these and pass a `<Link>` child; the sidebar chrome itself stays purely
// presentational (no routing/auth lives here).
import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface NavItemProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick' | 'children'> {
  /** Optional leading icon (e.g. a lucide icon). Rendered decoratively. */
  icon?: React.ReactNode;
  /** Visible, already-translated label (callers do their own i18n). */
  label: string;
  /** Marks the current route — applies the solid selected style + aria-current. */
  active?: boolean;
  /** When rendering a plain `<a>`, the destination. Ignored under `asChild`. */
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  /**
   * Render the caller's element instead of an `<a>` (Radix Slot), so the app
   * can pass its own `<Link href=...>` and keep all NavItem styling. Under
   * `asChild`, pass that single element (e.g. `<Link href="/x" />`) as the
   * child; NavItem injects the icon + label into it. Without `asChild`,
   * children are ignored (the component builds its own icon + label row).
   */
  asChild?: boolean;
  /** Under `asChild`, the single element (e.g. a `<Link>`) to slot. */
  children?: React.ReactNode;
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * Base row styling shared by every state. `min-h-11` (44px) meets the
 * WCAG 2.5.5 touch-target minimum; `rounded-lg` + `px-3` match the spec's
 * nav item recipe. A visible focus ring keeps it keyboard-navigable.
 */
const base =
  'group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'focus-visible:ring-offset-2';

// Selected = solid brand fill (design spec's chosen variant); unselected =
// chromeless neutral text that lifts to neutral-100 on hover. Disabled dims
// and blocks pointer activation.
const activeClasses = 'bg-primary-600 text-white';
const inactiveClasses = 'text-neutral-700 hover:bg-neutral-100';
const disabledClasses = 'pointer-events-none opacity-50';

/**
 * A single sidebar navigation row: leading icon + label. Presentational only
 * — it knows nothing about routing or roles. Pass `active` to light it up as
 * the current page, and either `href` (renders an `<a>`) or `asChild` (slots
 * the caller's own `<Link>`).
 */
export const NavItem = React.forwardRef<HTMLElement, NavItemProps>(
  (
    {
      className,
      icon,
      label,
      active = false,
      href,
      onClick,
      asChild = false,
      children,
      disabled = false,
      'data-testid': dataTestId = 'nav-item',
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'a';

    const handleClick: React.MouseEventHandler<HTMLElement> = (event) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    // Leading (decorative) icon + the text label. The label already conveys
    // meaning, so the icon is `aria-hidden`.
    const content = (
      <>
        {icon != null && (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </>
    );

    // Under `asChild`, Radix Slot clones the caller's single element child
    // (e.g. a `<Link>`) and renders OUR `content` as that element's children.
    // We wrap the caller's element so the icon + label live inside their
    // `<Link>`. Without `asChild`, we render a plain `<a>` ourselves.
    const slotted =
      asChild && React.isValidElement(children)
        ? React.cloneElement(children, undefined, content)
        : content;

    return (
      <Comp
        // `ref` is typed as HTMLElement because the rendered element is either
        // an <a> or (under asChild) the caller's slotted element.
        ref={ref as React.Ref<HTMLAnchorElement>}
        data-testid={dataTestId}
        href={!asChild ? href : undefined}
        aria-current={active ? 'page' : undefined}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        className={cn(
          base,
          active ? activeClasses : inactiveClasses,
          disabled && disabledClasses,
          className,
        )}
        {...props}
      >
        {slotted}
      </Comp>
    );
  },
);
NavItem.displayName = 'NavItem';

export interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  /** Brand/logo slot pinned to the top of the rail. */
  brand?: React.ReactNode;
  /** The NavItems (and any section labels) for the scrollable middle. */
  children: React.ReactNode;
  /** Footer slot pinned to the bottom (e.g. user card / logout). */
  footer?: React.ReactNode;
  /** Required accessible name for the landmark (callers pass translated text). */
  'aria-label': string;
  'data-testid'?: string;
}

/**
 * The shared desktop sidebar chrome used by both apps: a fixed-width vertical
 * `<nav>` landmark with a brand slot on top, a scrollable list of NavItems in
 * the middle, and a footer pinned to the bottom. White surface + hairline
 * right border per the design spec. Presentational and app-agnostic.
 */
export const SidebarNav = React.forwardRef<HTMLElement, SidebarNavProps>(
  (
    {
      brand,
      children,
      footer,
      className,
      'data-testid': dataTestId = 'sidebar-nav',
      ...props
    },
    ref,
  ) => {
    return (
      <nav
        ref={ref}
        data-testid={dataTestId}
        className={cn(
          'flex h-full w-64 flex-col border-r border-neutral-200 bg-white',
          className,
        )}
        {...props}
      >
        {brand != null && <div className="flex-shrink-0 px-4 py-4">{brand}</div>}
        {/* Scrollable middle: the nav items. `min-h-0` lets it shrink inside
            the flex column so overflow scrolls instead of pushing the footer
            off-screen. */}
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {children}
        </div>
        {/* `mt-auto` pins the footer to the bottom even with a short list. */}
        {footer != null && (
          <div className="mt-auto flex-shrink-0 border-t border-neutral-200 px-3 py-3">
            {footer}
          </div>
        )}
      </nav>
    );
  },
);
SidebarNav.displayName = 'SidebarNav';
