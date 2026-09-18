'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import {
  bulkAssignOrdersAction,
  type BulkOrderAssignmentState,
} from './actions';

type Row = {
  id: string;
  orderNumber: string;
  status: string;
  lastTransitionId: string | null;
};
type Owner = { id: string; name: string };

const initialState: BulkOrderAssignmentState = { changed: [], unchanged: [] };

export function BulkAssignmentForm({
  rows,
  owners,
}: {
  rows: Row[];
  owners: Owner[];
}) {
  const [state, action, pending] = useActionState(
    bulkAssignOrdersAction,
    initialState,
  );
  return (
    <BulkAssignmentView
      rows={rows}
      owners={owners}
      state={state}
      action={action}
      pending={pending}
    />
  );
}

export function BulkAssignmentView({
  rows,
  owners,
  state,
  action,
  pending = false,
}: {
  rows: Row[];
  owners: Owner[];
  state: BulkOrderAssignmentState;
  action: ((data: FormData) => void) | string;
  pending?: boolean;
}) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedCount = rows.reduce(
    (count, row) => count + (selectedOrderIds.has(row.id) ? 1 : 0),
    0,
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;
  const someSelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    const visibleOrderIds = new Set(rows.map((row) => row.id));
    setSelectedOrderIds((current) => {
      const next = new Set(
        [...current].filter((orderId) => visibleOrderIds.has(orderId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [rows]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function setAllRowsSelected(selected: boolean) {
    setSelectedOrderIds(
      selected ? new Set(rows.map((row) => row.id)) : new Set(),
    );
  }

  function setRowSelected(rowId: string, selected: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  }

  return (
    <form
      action={action}
      method={typeof action === 'string' ? 'post' : undefined}
      className="mt-8 border border-border bg-secondary p-5"
    >
      <h2 className="font-display text-xl font-bold">Assign selected orders</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Administrators may assign up to 50 orders. A future due time is
        required. If any selected order changed, none are assigned.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold">
          Owner
          <select
            required
            name="assignedTo"
            className="min-h-11 rounded-md border border-input bg-background px-3"
          >
            <option value="">Choose owner</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Service due
          <input
            required
            type="datetime-local"
            name="serviceDueAt"
            className="min-h-11 rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Assignment note
          <input
            name="note"
            maxLength={1000}
            className="min-h-11 rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>
      <fieldset className="mt-4 grid max-h-56 gap-2 overflow-y-auto border border-border bg-background p-3">
        <legend className="px-2 text-sm font-semibold">
          Orders on this page
        </legend>
        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={(event) =>
                setAllRowsSelected(event.currentTarget.checked)
              }
            />
            <span>Select all orders on this page</span>
          </label>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {selectedCount} selected
          </span>
        </div>
        {rows.map((row) => (
          <label key={row.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="orders"
              value={JSON.stringify(row)}
              checked={selectedOrderIds.has(row.id)}
              onChange={(event) =>
                setRowSelected(row.id, event.currentTarget.checked)
              }
            />
            <span className="font-mono">{row.orderNumber}</span>
          </label>
        ))}
      </fieldset>
      <button
        disabled={pending}
        type="submit"
        className="action-primary mt-4 disabled:opacity-50"
      >
        {pending ? 'Assigning…' : 'Assign selected'}
      </button>
      {(state.error ||
        state.changed.length > 0 ||
        state.unchanged.length > 0) && (
        <div
          role={state.error ? 'alert' : 'status'}
          className="mt-4 border border-border bg-background p-4 text-sm"
        >
          {state.error && (
            <p className="font-semibold text-destructive">{state.error}</p>
          )}
          <p>
            Changed: {state.changed.length ? state.changed.join(', ') : 'none'}
          </p>
          <p>
            Not changed:{' '}
            {state.unchanged.length ? state.unchanged.join(', ') : 'none'}
          </p>
        </div>
      )}
    </form>
  );
}
