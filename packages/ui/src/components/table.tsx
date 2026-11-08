'use client';

// The table rows accept an optional `onRowClick` handler and are keyboard
// activatable, so this is a Client Component (event handlers can't cross the
// server/client boundary as props). It stays purely presentational otherwise:
// the caller supplies data, column definitions, renderers and handlers.
import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * A single column definition. `T` is the row shape so `render` is fully typed.
 * `key` is a stable identifier for the column (also used for React keys of the
 * mobile label/value pairs). If `render` is omitted, the raw `row[key]` value
 * is shown (coerced to a string) — handy for simple string/number columns.
 */
export interface TableColumn<T> {
  /** Stable column identifier; doubles as the default value accessor. */
  key: string;
  /** Visible, already-translated column header. */
  header: string;
  /** Custom cell renderer; receives the whole row for full control. */
  render?: (row: T) => React.ReactNode;
  /** Extra classes for the body cell (`<td>` / mobile value). */
  className?: string;
  /** Extra classes for the header cell (`<th>`). */
  headerClassName?: string;
  /**
   * Label shown before the value in the mobile stacked card. Falls back to
   * `header` when omitted — lets long headers shorten on small screens.
   */
  mobileLabel?: string;
}

export interface TableProps<T> {
  /** Ordered column definitions. */
  columns: Array<TableColumn<T>>;
  /** The rows to render. When empty, `emptyState` is shown instead. */
  rows: T[];
  /** Returns a stable React key for a row (e.g. its id). */
  getRowKey: (row: T) => string;
  /** When provided, rows become clickable + keyboard-activatable. */
  onRowClick?: (row: T) => void;
  /** Accessible caption for the table (visually subtle, screen-reader useful). */
  caption?: string;
  /** Rendered in place of the table/cards when `rows` is empty. */
  emptyState?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Reads the default cell value for a column when no `render` is supplied.
 * We only coerce primitives (string/number) to text; anything else renders
 * nothing to avoid "[object Object]". Columns with non-primitive data should
 * provide a `render`. Using `Record<string, unknown>` (not `any`) keeps this
 * type-safe while allowing an arbitrary row shape.
 */
function defaultCell<T>(row: T, key: string): React.ReactNode {
  const value = (row as Record<string, unknown>)[key];
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return null;
}

/**
 * A responsive data table, generic over the row type `T`.
 *
 * Responsive behavior:
 *  - **Desktop (`md+`):** a semantic `<table>` (`hidden md:table`) with a
 *    `<thead>` (uppercase muted headers on `bg-neutral-50`) and `<tbody>`
 *    rows separated by hairline top borders, comfortable padding and a
 *    hover tint. When `onRowClick` is set, each `<tr>` becomes a focusable
 *    `role="button"` row (Enter/Space activate it) with a visible focus ring.
 *  - **Mobile (`<md`):** the same rows render as stacked cards (`md:hidden`),
 *    one label/value pair per column so the column context is preserved
 *    without a horizontal scroll. The whole card is clickable when
 *    `onRowClick` is set.
 *
 * `emptyState` replaces both layouts when there are no rows.
 */
export function Table<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  caption,
  emptyState,
  className,
  'data-testid': dataTestId = 'table',
}: TableProps<T>) {
  const clickable = onRowClick != null;

  // Shared keyboard handler for clickable rows/cards: Enter or Space triggers
  // the row (Space is prevent-defaulted so the page doesn't scroll).
  const handleKeyDown = (row: T): React.KeyboardEventHandler => {
    return (event) => {
      if (!clickable) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onRowClick?.(row);
      }
    };
  };

  // Interaction props applied to a clickable row (desktop <tr>) or card
  // (mobile <div>). Kept in one place so both layouts behave identically.
  const interactiveProps = (row: T) =>
    clickable
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: () => onRowClick?.(row),
          onKeyDown: handleKeyDown(row),
        }
      : {};

  if (rows.length === 0) {
    // Empty: show the caller's EmptyState in place of either layout. We still
    // tag it with the table testid so callers can locate the region.
    return (
      <div data-testid={dataTestId} className={className}>
        {emptyState}
      </div>
    );
  }

  return (
    <div data-testid={dataTestId} className={className}>
      {/* ---- Desktop: semantic table (md and up) ---- */}
      <table className="hidden w-full border-collapse overflow-hidden rounded-xl border border-neutral-200 bg-white text-left text-sm md:table">
        {caption != null && (
          // Visible but subtle caption; still announced to screen readers.
          <caption className="px-4 py-3 text-left text-sm text-neutral-500">
            {caption}
          </caption>
        )}
        <thead>
          <tr className="bg-neutral-50 text-xs uppercase text-neutral-500">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn('px-4 py-3 font-medium', column.headerClassName)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              data-testid="table-row"
              className={cn(
                'border-t border-neutral-200',
                clickable &&
                  'cursor-pointer hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500',
              )}
              {...interactiveProps(row)}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn('px-4 py-3 text-neutral-700', column.className)}
                >
                  {column.render ? column.render(row) : defaultCell(row, column.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---- Mobile: stacked cards (below md) ---- */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <div
            key={getRowKey(row)}
            data-testid="table-row"
            className={cn(
              'rounded-xl border border-neutral-200 bg-white p-4',
              clickable &&
                'cursor-pointer hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            )}
            {...interactiveProps(row)}
          >
            <dl className="flex flex-col gap-2">
              {columns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-3">
                  {/* The column label preserves context the desktop header
                      would otherwise provide. */}
                  <dt className="text-xs uppercase text-neutral-500">
                    {column.mobileLabel ?? column.header}
                  </dt>
                  <dd className={cn('text-right text-sm text-neutral-700', column.className)}>
                    {column.render ? column.render(row) : defaultCell(row, column.key)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
Table.displayName = 'Table';
