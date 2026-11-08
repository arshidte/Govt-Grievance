import * as React from 'react';
import { cn } from '../lib/cn';

const LENGTH = 6;

export interface OtpInputProps {
  /** Called on every change with the current (possibly partial) value, padded-free. */
  onChange?: (value: string) => void;
  /** Called once the value reaches LENGTH digits. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  /** Accessible group label, e.g. "Enter the 6-digit code sent to your phone". */
  label?: string;
  id?: string;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Six-cell one-time-passcode input. Each cell is an individually labeled
 * ("Digit N of 6") single-character numeric input. Typing a digit advances
 * focus to the next cell; Backspace on an empty cell moves focus back.
 * Pasting a full 6-digit string into any cell distributes it across all
 * cells starting from that cell's index.
 */
export const OtpInput = React.forwardRef<HTMLDivElement, OtpInputProps>(
  ({ onChange, onComplete, disabled, label = 'One-time passcode', id }, ref) => {
    const [digits, setDigits] = React.useState<string[]>(() => Array(LENGTH).fill(''));
    const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);
    const groupId = React.useId();
    const baseId = id ?? `otp-${groupId}`;

    const emit = (next: string[]) => {
      setDigits(next);
      const value = next.join('');
      onChange?.(value);
      if (value.length === LENGTH && next.every((d) => d !== '')) {
        onComplete?.(value);
      }
    };

    const focusCell = (index: number) => {
      inputRefs.current[index]?.focus();
    };

    const handleChange = (index: number, raw: string) => {
      const digit = onlyDigits(raw).slice(-1);
      const next = [...digits];
      next[index] = digit;
      emit(next);
      if (digit && index < LENGTH - 1) {
        focusCell(index + 1);
      }
    };

    const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
        event.preventDefault();
        focusCell(index - 1);
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        focusCell(index - 1);
      } else if (event.key === 'ArrowRight' && index < LENGTH - 1) {
        event.preventDefault();
        focusCell(index + 1);
      }
    };

    const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = onlyDigits(event.clipboardData.getData('text'));
      if (!pasted) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      const next = [...digits];
      let cursor = index;
      for (const char of pasted) {
        if (cursor >= LENGTH) break;
        next[cursor] = char;
        cursor += 1;
      }
      emit(next);
      focusCell(Math.min(cursor, LENGTH - 1));
    };

    return (
      <div ref={ref} role="group" aria-label={label} className="flex gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            id={`${baseId}-${index}`}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="\d*"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            // Revamp P2a — match the Input field surface: white bg, hairline
            // neutral-200 border, rounded-lg; focus draws the brand ring and
            // tints the border so the active cell is obvious during entry.
            className={cn(
              'h-11 w-11 min-h-11 rounded-lg border border-neutral-200 bg-white text-center text-lg font-medium text-neutral-900',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          />
        ))}
      </div>
    );
  },
);
OtpInput.displayName = 'OtpInput';
