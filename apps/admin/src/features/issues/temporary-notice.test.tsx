// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import enMessages from '@pg/i18n/messages/en.json';
import { TemporaryNotice } from './TemporaryNotice';

/**
 * Mirrors `login-form.test.tsx`'s NextIntlClientProvider wrapper. Pins down
 * that the interim-screen message (spec §12 "temporary staff triage
 * screen") is actually rendered, under the stable `temporary-notice`
 * testid Task 26's cross-app gate depends on.
 */
function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('TemporaryNotice', () => {
  it('renders the interim-screen message under the stable testid', () => {
    renderWithIntl(<TemporaryNotice />);

    const notice = screen.getByTestId('temporary-notice');
    expect(notice).toBeInTheDocument();
    expect(screen.getByText(enMessages.staffTriage.noticeBody)).toBeInTheDocument();
  });
});
