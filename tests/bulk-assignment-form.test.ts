// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/manage/orders/actions', () => ({
  bulkAssignOrdersAction: vi.fn(),
}));

import { BulkAssignmentForm } from '@/app/manage/orders/bulk-assignment-form';

const rows = [
  {
    id: 'order-1',
    orderNumber: 'NX-260918-0001',
    status: 'paid',
    lastTransitionId: 'transition-1',
  },
  {
    id: 'order-2',
    orderNumber: 'NX-260918-0002',
    status: 'paid',
    lastTransitionId: null,
  },
  {
    id: 'order-3',
    orderNumber: 'NX-260918-0003',
    status: 'pending',
    lastTransitionId: 'transition-3',
  },
];

afterEach(cleanup);

describe('bulk assignment page selection', () => {
  it('keeps select-all, rendered rows, and the live count in sync', async () => {
    const user = userEvent.setup();
    render(
      createElement(BulkAssignmentForm, {
        rows,
        owners: [{ id: 'owner-1', name: 'Order owner' }],
      }),
    );

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all orders on this page',
    }) as HTMLInputElement;
    const orderCheckboxes = screen.getAllByRole('checkbox', {
      name: /NX-260918-/,
    }) as HTMLInputElement[];

    expect(orderCheckboxes).toHaveLength(rows.length);
    expect(screen.getByText('0 selected')).toBeTruthy();

    selectAll.focus();
    await user.keyboard(' ');

    expect(selectAll.checked).toBe(true);
    expect(selectAll.indeterminate).toBe(false);
    expect(orderCheckboxes.every((checkbox) => checkbox.checked)).toBe(true);
    expect(screen.getByText('3 selected')).toBeTruthy();
    expect(
      orderCheckboxes.map((checkbox) =>
        JSON.parse(checkbox.value).id,
      ),
    ).toEqual(rows.map((row) => row.id));

    await user.click(orderCheckboxes[1]);

    expect(orderCheckboxes[1].checked).toBe(false);
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);

    await user.click(orderCheckboxes[1]);

    expect(screen.getByText('3 selected')).toBeTruthy();
    expect(selectAll.checked).toBe(true);
    expect(selectAll.indeterminate).toBe(false);

    await user.click(selectAll);

    expect(orderCheckboxes.every((checkbox) => !checkbox.checked)).toBe(true);
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(false);

    await user.click(orderCheckboxes[0]);

    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);
  });

  it('drops removed rows and starts newly visible rows unselected', async () => {
    const user = userEvent.setup();
    const owners = [{ id: 'owner-1', name: 'Order owner' }];
    const { container, rerender } = render(
      createElement(BulkAssignmentForm, {
        rows: rows.slice(0, 2),
        owners,
      }),
    );

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Select all orders on this page',
      }),
    );
    expect(screen.getByText('2 selected')).toBeTruthy();

    rerender(
      createElement(BulkAssignmentForm, {
        rows: [rows[1], rows[2]],
        owners,
      }),
    );

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all orders on this page',
    }) as HTMLInputElement;
    const visibleCheckboxes = screen.getAllByRole('checkbox', {
      name: /NX-260918-/,
    }) as HTMLInputElement[];

    expect(screen.queryByRole('checkbox', { name: rows[0].orderNumber })).toBe(
      null,
    );
    expect(visibleCheckboxes[0].checked).toBe(true);
    expect(visibleCheckboxes[1].checked).toBe(false);
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);

    const formData = new FormData(container.querySelector('form')!);
    expect(
      formData.getAll('orders').map((value) => JSON.parse(String(value)).id),
    ).toEqual([rows[1].id]);

    await user.click(selectAll);

    expect(visibleCheckboxes.every((checkbox) => checkbox.checked)).toBe(true);
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(
      new FormData(container.querySelector('form')!)
        .getAll('orders')
        .map((value) => JSON.parse(String(value)).id),
    ).toEqual([rows[1].id, rows[2].id]);
  });
});
