// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { CategoryDTO, IssueDetailDTO, PanchayatDTO, WardDTO } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { ToastProvider } from '@pg/ui';
import { SubmitWizard } from './SubmitWizard';

/**
 * Mocks the four `@pg/api-client` hooks the wizard imports directly
 * (`useCategories`, `usePanchayats`, `useWards`, `useCreateIssue`,
 * `useUploadAttachment`) plus the sibling `useApiClient` (so no real
 * fetch/BFF call happens). We assert on rendered DOM AND on the one
 * behavior the brief requires: that `useCreateIssue`'s mutate is (or is
 * NOT) called with the chosen values, and that the returned reference
 * number renders in the confirmation.
 */
const createMutate = vi.fn();
const uploadMutate = vi.fn();

let categoriesResult: { data: CategoryDTO[] | undefined; isPending: boolean; isError: boolean };
let panchayatsResult: { data: PanchayatDTO[] | undefined; isPending: boolean; isError: boolean };
let wardsResult: { data: WardDTO[] | undefined; isPending: boolean; isError: boolean };
let lastWardsPanchayatId: string | undefined;
let createIssueResult: {
  mutate: typeof createMutate;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  data: IssueDetailDTO | undefined;
  reset: () => void;
};

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat-roads',
    slug: 'roads',
    name: 'Roads',
    nameMl: 'റോഡുകൾ',
    subcategories: [
      { id: 'sub-pothole', name: 'Pothole', nameMl: 'കുഴി' },
      { id: 'sub-signage', name: 'Signage', nameMl: 'സൈൻബോർഡ്' },
    ],
  },
  {
    id: 'cat-water',
    slug: 'water',
    name: 'Water',
    nameMl: 'വെള്ളം',
    subcategories: [{ id: 'sub-leak', name: 'Leak', nameMl: 'ചോർച്ച' }],
  },
];

const PANCHAYATS: PanchayatDTO[] = [
  { id: 'pan-1', code: 'PG-001', name: 'Panchayat One', nameMl: 'പഞ്ചായത്ത് ഒന്ന്', status: 'active' },
  { id: 'pan-2', code: 'PG-002', name: 'Panchayat Two', nameMl: 'പഞ്ചായത്ത് രണ്ട്', status: 'active' },
];

const WARDS_BY_PANCHAYAT: Record<string, WardDTO[]> = {
  'pan-1': [
    { id: 'ward-1a', number: 1, name: 'Ward 1A', nameMl: 'വാർഡ് 1A', panchayatId: 'pan-1' },
    { id: 'ward-1b', number: 2, name: 'Ward 1B', nameMl: 'വാർഡ് 1B', panchayatId: 'pan-1' },
  ],
  'pan-2': [{ id: 'ward-2a', number: 1, name: 'Ward 2A', nameMl: 'വാർഡ് 2A', panchayatId: 'pan-2' }],
};

const CREATED_ISSUE: IssueDetailDTO = {
  id: 'issue-1',
  referenceNo: 'PG-2026-000123',
  title: 'Big pothole',
  status: 'SUBMITTED',
  priority: 'MEDIUM',
  categoryId: 'cat-roads',
  createdAt: '2026-01-01T00:00:00.000Z',
  description: 'There is a big pothole on the main road.',
  panchayatId: 'pan-1',
  wardId: 'ward-1a',
  subcategoryId: 'sub-pothole',
  onBehalfOf: false,
  timeline: [],
  attachment: null,
};

vi.mock('@pg/api-client', async () => {
  const actual = await vi.importActual<typeof import('@pg/api-client')>('@pg/api-client');
  return {
    ...actual,
    useCategories: () => categoriesResult,
    usePanchayats: () => panchayatsResult,
    useWards: (_client: unknown, panchayatId: string) => {
      lastWardsPanchayatId = panchayatId;
      // Mirror the real hook's enabled-gating: no data until a panchayat is chosen.
      return panchayatId ? wardsResult : { data: undefined, isPending: false, isError: false };
    },
    useCreateIssue: () => createIssueResult,
    useUploadAttachment: () => ({ mutate: uploadMutate, isPending: false }),
  };
});

vi.mock('../auth/api-client', () => ({
  useApiClient: () => ({}),
}));

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>{children}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** Fills every required field with a valid selection and valid text. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByTestId('category-select'), 'cat-roads');
  await user.selectOptions(screen.getByTestId('subcategory-select'), 'sub-pothole');
  await user.selectOptions(screen.getByTestId('panchayat-select'), 'pan-1');
  // Wards for pan-1 are now enabled.
  await waitFor(() => {
    expect(within(screen.getByTestId('ward-select')).getByText('Ward 1A')).toBeInTheDocument();
  });
  await user.selectOptions(screen.getByTestId('ward-select'), 'ward-1a');
  await user.type(screen.getByTestId('title-input'), 'Big pothole');
  await user.type(screen.getByTestId('description-input'), 'There is a big pothole on the main road.');
}

describe('SubmitWizard', () => {
  beforeEach(() => {
    createMutate.mockReset();
    uploadMutate.mockReset();
    lastWardsPanchayatId = undefined;
    categoriesResult = { data: CATEGORIES, isPending: false, isError: false };
    panchayatsResult = { data: PANCHAYATS, isPending: false, isError: false };
    wardsResult = { data: WARDS_BY_PANCHAYAT['pan-1'], isPending: false, isError: false };
    createIssueResult = {
      mutate: createMutate,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
    };
  });

  it('renders the wizard with the key fields', () => {
    renderWithIntl(<SubmitWizard />);
    expect(screen.getByTestId('report-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('category-select')).toBeInTheDocument();
    expect(screen.getByTestId('panchayat-select')).toBeInTheDocument();
    expect(screen.getByTestId('title-input')).toBeInTheDocument();
  });

  it('filters subcategory options to the chosen category', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SubmitWizard />);

    await user.selectOptions(screen.getByTestId('category-select'), 'cat-roads');
    const sub = screen.getByTestId('subcategory-select');
    expect(within(sub).getByText('Pothole')).toBeInTheDocument();
    expect(within(sub).getByText('Signage')).toBeInTheDocument();
    expect(within(sub).queryByText('Leak')).not.toBeInTheDocument();

    // Switching to water swaps the subcategory options.
    await user.selectOptions(screen.getByTestId('category-select'), 'cat-water');
    expect(within(sub).getByText('Leak')).toBeInTheDocument();
    expect(within(sub).queryByText('Pothole')).not.toBeInTheDocument();
  });

  it('loads ward options only after a panchayat is chosen (dependent select)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SubmitWizard />);

    // Before any panchayat is chosen, useWards was called with an empty id
    // (disabled) — no ward options render.
    const ward = screen.getByTestId('ward-select');
    expect(within(ward).queryByText('Ward 1A')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByTestId('panchayat-select'), 'pan-1');
    await waitFor(() => {
      expect(lastWardsPanchayatId).toBe('pan-1');
    });
    expect(within(ward).getByText('Ward 1A')).toBeInTheDocument();
  });

  it('does NOT call the create mutation when the title is empty (validation blocks submit)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SubmitWizard />);

    // Fill everything EXCEPT the title.
    await user.selectOptions(screen.getByTestId('category-select'), 'cat-roads');
    await user.selectOptions(screen.getByTestId('panchayat-select'), 'pan-1');
    await waitFor(() => {
      expect(within(screen.getByTestId('ward-select')).getByText('Ward 1A')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByTestId('ward-select'), 'ward-1a');
    await user.type(
      screen.getByTestId('description-input'),
      'There is a big pothole on the main road.',
    );

    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('calls useCreateIssue with the chosen values on a valid submit and renders the reference number', async () => {
    const user = userEvent.setup();
    // Make the mutate invoke onSuccess with the created issue, as the real
    // hook would, so the confirmation step renders.
    createMutate.mockImplementation((_vars, opts?: { onSuccess?: (d: IssueDetailDTO) => void }) => {
      createIssueResult.isSuccess = true;
      createIssueResult.data = CREATED_ISSUE;
      opts?.onSuccess?.(CREATED_ISSUE);
    });

    const { rerender } = renderWithIntl(<SubmitWizard />);

    await fillValidForm(user);
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledTimes(1);
    });
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          title: 'Big pothole',
          description: 'There is a big pothole on the main road.',
          categoryId: 'cat-roads',
          subcategoryId: 'sub-pothole',
          panchayatId: 'pan-1',
          wardId: 'ward-1a',
        }),
        idempotencyKey: expect.any(String),
      }),
      expect.anything(),
    );

    // Re-render so the component reads the now-success mutation state.
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ToastProvider>
          <SubmitWizard />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reference-number')).toHaveTextContent('PG-2026-000123');
    });
  });

  it('passes a stable idempotency key (one per wizard instance) across retries', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SubmitWizard />);

    await fillValidForm(user);
    await user.click(screen.getByTestId('submit-button'));
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledTimes(2);
    });
    const firstKey = (createMutate.mock.calls[0]![0] as { idempotencyKey: string }).idempotencyKey;
    const secondKey = (createMutate.mock.calls[1]![0] as { idempotencyKey: string }).idempotencyKey;
    expect(firstKey).toBe(secondKey);
  });
});
