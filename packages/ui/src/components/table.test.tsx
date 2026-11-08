import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Table, type TableColumn } from './table';

// A small, typed row shape used across the tests.
interface Grievance {
  id: string;
  reference: string;
  status: string;
}

const columns: Array<TableColumn<Grievance>> = [
  { key: 'reference', header: 'Reference' },
  { key: 'status', header: 'Status', render: (row) => <span>{row.status}</span> },
];

const rows: Grievance[] = [
  { id: 'a', reference: 'GRV-001', status: 'Submitted' },
  { id: 'b', reference: 'GRV-002', status: 'Resolved' },
];

describe('Table', () => {
  it('renders a semantic table with the column headers on desktop', () => {
    render(<Table columns={columns} rows={rows} getRowKey={(r) => r.id} />);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Reference' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
  });

  it('renders a row per item (desktop + mobile layouts)', () => {
    render(<Table columns={columns} rows={rows} getRowKey={(r) => r.id} />);

    // One desktop <tr> + one mobile card per row = 2 testid matches per row.
    expect(screen.getAllByTestId('table-row')).toHaveLength(rows.length * 2);
    // Values appear (desktop + mobile), so query all.
    expect(screen.getAllByText('GRV-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0);
  });

  it('fires onRowClick when a row is activated', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <Table columns={columns} rows={rows} getRowKey={(r) => r.id} onRowClick={onRowClick} />,
    );

    // Clickable rows expose role="button"; click the first one.
    // Non-null assertion: `rows` is non-empty so at least one button exists.
    const firstRow = screen.getAllByRole('button')[0]!;
    await user.click(firstRow);

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('activates a row via the keyboard', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <Table columns={columns} rows={rows} getRowKey={(r) => r.id} onRowClick={onRowClick} />,
    );

    // Non-null assertion: `rows` is non-empty so at least one button exists.
    const firstRow = screen.getAllByRole('button')[0]!;
    firstRow.focus();
    await user.keyboard('{Enter}');

    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('renders the emptyState when there are no rows', () => {
    render(
      <Table
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        emptyState={<p>No grievances yet</p>}
      />,
    );

    expect(screen.getByText('No grievances yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
