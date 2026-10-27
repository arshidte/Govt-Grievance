// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { IssueDetailDTO, IssueSummaryDTO, IssueStatus } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { IssuesDashboard } from './IssuesDashboard';
import { IssueDetail } from './IssueDetail';

/**
 * Mocks `@pg/api-client`'s `useIssues`/`useIssue` (the hooks the dashboard
 * and detail components import directly), plus the sibling `useApiClient`
 * (so no real fetch/BFF call happens). Mirrors `submit-wizard.test.tsx` /
 * `profile-form.test.tsx`'s mocking conventions.
 */
let issuesResult: {
  data: IssueSummaryDTO[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};
let issueResult: {
  data: IssueDetailDTO | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

const refetchIssues = vi.fn();
const refetchIssue = vi.fn();

vi.mock('@pg/api-client', async () => {
  const actual = await vi.importActual<typeof import('@pg/api-client')>('@pg/api-client');
  return {
    ...actual,
    useIssues: () => issuesResult,
    useIssue: () => issueResult,
  };
});

vi.mock('../auth/api-client', () => ({
  useApiClient: () => ({}),
}));

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

const ISSUE_SUMMARY_1: IssueSummaryDTO = {
  id: 'issue-1',
  referenceNo: 'PG-2026-000123',
  title: 'Pothole on main road',
  status: 'SUBMITTED',
  priority: 'MEDIUM',
  categoryId: 'cat-roads',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const ISSUE_SUMMARY_2: IssueSummaryDTO = {
  id: 'issue-2',
  referenceNo: 'PG-2026-000124',
  title: 'Water leak near ward office',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  categoryId: 'cat-water',
  createdAt: '2026-01-02T00:00:00.000Z',
};

const ISSUE_DETAIL: IssueDetailDTO = {
  id: 'issue-1',
  referenceNo: 'PG-2026-000123',
  title: 'Pothole on main road',
  status: 'SUBMITTED',
  priority: 'MEDIUM',
  categoryId: 'cat-roads',
  createdAt: '2026-01-01T00:00:00.000Z',
  description: 'There is a large pothole causing traffic issues.',
  panchayatId: 'pan-1',
  wardId: 'ward-1a',
  subcategoryId: null,
  onBehalfOf: false,
  timeline: [],
  attachment: null,
};

const ISSUE_DETAIL_WITH_ATTACHMENT: IssueDetailDTO = {
  ...ISSUE_DETAIL,
  attachment: {
    id: 'att-1',
    mimeType: 'image/jpeg',
    sizeBytes: 12345,
    originalName: 'pothole.jpg',
    createdAt: '2026-01-01T00:05:00.000Z',
  },
};

describe('IssuesDashboard', () => {
  beforeEach(() => {
    refetchIssues.mockClear();
    issuesResult = { data: undefined, isPending: true, isError: false, error: null, refetch: refetchIssues };
  });

  it('renders the loading state while useIssues is pending', () => {
    renderWithIntl(<IssuesDashboard />);
    expect(screen.getByTestId('issues-loading')).toBeInTheDocument();
  });

  it('renders the error state when useIssues fails', () => {
    issuesResult = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('network_error'),
      refetch: refetchIssues,
    };
    renderWithIntl(<IssuesDashboard />);
    expect(screen.getByTestId('issues-error')).toBeInTheDocument();
  });

  it('renders the empty state (with a link to report) when useIssues returns an empty list', () => {
    issuesResult = { data: [], isPending: false, isError: false, error: null, refetch: refetchIssues };
    renderWithIntl(<IssuesDashboard />);

    expect(screen.getByTestId('issues-empty-state')).toBeInTheDocument();
    const link = screen.getByTestId('issues-empty-report-link');
    expect(link).toHaveAttribute('href', expect.stringContaining('/report'));
  });

  it('renders an IssueCard with a StatusBadge for each returned issue', () => {
    issuesResult = {
      data: [ISSUE_SUMMARY_1, ISSUE_SUMMARY_2],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchIssues,
    };
    renderWithIntl(<IssuesDashboard />);

    const cards = screen.getAllByTestId('issue-card');
    expect(cards).toHaveLength(2);

    expect(within(cards[0]!).getByText('PG-2026-000123')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Pothole on main road')).toBeInTheDocument();
    expect(within(cards[0]!).getByText(enMessages.status.submitted)).toBeInTheDocument();

    expect(within(cards[1]!).getByText('PG-2026-000124')).toBeInTheDocument();
    expect(within(cards[1]!).getByText(enMessages.status.inProgress)).toBeInTheDocument();

    // Each card links to the issue's detail page.
    const cardLink = within(cards[0]!).getByTestId('issue-card-link');
    expect(cardLink).toHaveAttribute('href', expect.stringContaining('/issues/issue-1'));
  });

  // Brief requirement: an unrecognized status value must render gracefully
  // (no throw), using StatusBadge's/statusLabelKey's fallback.
  it('renders gracefully (no throw) when an issue has an unrecognized status value', () => {
    const weirdIssue: IssueSummaryDTO = {
      ...ISSUE_SUMMARY_1,
      status: 'SOME_FUTURE_STATUS' as IssueStatus,
    };
    issuesResult = { data: [weirdIssue], isPending: false, isError: false, error: null, refetch: refetchIssues };

    expect(() => renderWithIntl(<IssuesDashboard />)).not.toThrow();
    // Falls back to the submitted status label/badge.
    expect(screen.getByText(enMessages.status.submitted)).toBeInTheDocument();
  });
});

describe('IssueDetail', () => {
  beforeEach(() => {
    refetchIssue.mockClear();
    issueResult = { data: undefined, isPending: true, isError: false, error: null, refetch: refetchIssue };
  });

  it('renders the loading state while useIssue is pending', () => {
    renderWithIntl(<IssueDetail id="issue-1" />);
    expect(screen.getByTestId('issue-detail-loading')).toBeInTheDocument();
  });

  it('renders a clean not-found state (not a crash) when useIssue 404s', () => {
    issueResult = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('issue_not_found'),
      refetch: refetchIssue,
    };
    expect(() => renderWithIntl(<IssueDetail id="nonexistent" />)).not.toThrow();
    expect(screen.getByTestId('issue-detail-not-found')).toBeInTheDocument();
  });

  it('renders the issue metadata, StatusBadge, and PriorityBadge', () => {
    issueResult = { data: ISSUE_DETAIL, isPending: false, isError: false, error: null, refetch: refetchIssue };
    renderWithIntl(<IssueDetail id="issue-1" />);

    const detail = screen.getByTestId('issue-detail');
    expect(within(detail).getByText('PG-2026-000123')).toBeInTheDocument();
    expect(within(detail).getByText('Pothole on main road')).toBeInTheDocument();
    expect(
      within(detail).getByText('There is a large pothole causing traffic issues.'),
    ).toBeInTheDocument();
    expect(within(detail).getByText(enMessages.status.submitted)).toBeInTheDocument();
    expect(within(detail).getByText(enMessages.priority.medium)).toBeInTheDocument();
  });

  it('renders the timeline section', () => {
    issueResult = { data: ISSUE_DETAIL, isPending: false, isError: false, error: null, refetch: refetchIssue };
    renderWithIntl(<IssueDetail id="issue-1" />);

    expect(screen.getByTestId('issue-timeline')).toBeInTheDocument();
  });

  it('does NOT render an attachment element when the issue has no attachment', () => {
    issueResult = { data: ISSUE_DETAIL, isPending: false, isError: false, error: null, refetch: refetchIssue };
    renderWithIntl(<IssueDetail id="issue-1" />);

    expect(screen.queryByTestId('issue-attachment')).not.toBeInTheDocument();
  });

  it('renders the attachment pointing at the SAME-ORIGIN BFF URL when present', () => {
    issueResult = {
      data: ISSUE_DETAIL_WITH_ATTACHMENT,
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchIssue,
    };
    renderWithIntl(<IssueDetail id="issue-1" />);

    const attachment = screen.getByTestId('issue-attachment');
    // Must be a SAME-ORIGIN relative URL (`/api/v1/attachments/:id`), never
    // an absolute API-origin URL — the browser sends the session cookie
    // same-origin and the BFF streams the bytes.
    const src = attachment.getAttribute('src') ?? attachment.getAttribute('href');
    expect(src).toBe('/api/v1/attachments/att-1');
  });
});
