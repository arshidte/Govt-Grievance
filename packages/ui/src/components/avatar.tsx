import * as React from 'react';
import { cn } from '../lib/cn';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Display name — used for the image alt text and to derive initials. */
  name?: string;
  /** Optional image URL. When present, an `<img>` is rendered. */
  src?: string;
  /** Size preset: sm 28px / md 36px / lg 44px. Defaults to `md`. */
  size?: AvatarSize;
  'data-testid'?: string;
}

/** Pixel size per preset — a round, consistent avatar scale. */
const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-xs', // 28px
  md: 'h-9 w-9 text-sm', // 36px
  lg: 'h-11 w-11 text-base', // 44px
};

/**
 * Derives up to two uppercase initials from a name: first letter of the
 * first and last whitespace-separated words (or the first two letters of a
 * single word). Returns an empty string for empty/whitespace-only input.
 */
function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/**
 * A round user avatar. With `src` it renders an `<img>` (alt = `name`, or
 * empty for a decorative image). Otherwise it renders initials derived from
 * `name` on a soft brand-tinted circle; that fallback carries an
 * `aria-label` so assistive tech announces the user even without an image.
 * Presentational and app-agnostic.
 */
export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  (
    {
      name,
      src,
      size = 'md',
      className,
      'data-testid': dataTestId = 'avatar',
      ...props
    },
    ref,
  ) => {
    const base = cn(
      'inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full',
      sizeClasses[size],
      className,
    );

    if (src) {
      return (
        <span ref={ref} data-testid={dataTestId} className={base} {...props}>
          <img
            src={src}
            alt={name ?? ''}
            className="h-full w-full object-cover"
          />
        </span>
      );
    }

    const initials = initialsFrom(name ?? '');

    return (
      <span
        ref={ref}
        data-testid={dataTestId}
        // Initials are decorative glyphs; the accessible name comes from
        // `aria-label` so screen readers announce the person, not "JD".
        role="img"
        aria-label={name || undefined}
        className={cn(base, 'bg-primary-100 font-medium text-primary-700')}
        {...props}
      >
        <span aria-hidden="true">{initials}</span>
      </span>
    );
  },
);
Avatar.displayName = 'Avatar';
