'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Small URL-backed basket controller: the selected evidence ids live in
 * the `?basket=` search param as a comma-separated list. Deriving from
 * the URL means the state survives navigation and is bookmarkable.
 */
function useBasket(): {
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
  count: number;
  href: (path: string) => string;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams?.get('basket') ?? '';
  const selected = useMemo(
    () => new Set(raw.split(',').filter(Boolean)),
    [raw],
  );

  const write = useCallback(
    (next: Set<string>) => {
      const q = new URLSearchParams(searchParams?.toString() ?? '');
      if (next.size === 0) {
        q.delete('basket');
      } else {
        q.set('basket', Array.from(next).join(','));
      }
      router.replace(`?${q.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return {
    selected,
    count: selected.size,
    toggle: (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write(next);
    },
    clear: () => write(new Set()),
    href: (path: string) => {
      const ids = Array.from(selected).join(',');
      return ids ? `${path}?basket=${ids}` : path;
    },
  };
}

export function BasketCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useBasket();
  const checked = selected.has(id);
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => toggle(id)}
        className="accent-primary"
        aria-label={`Add evidence ${id} to export basket`}
      />
    </label>
  );
}

export function BasketBar({ caseId }: { caseId: string }) {
  const { count, clear, href } = useBasket();
  if (count === 0) {
    return (
      <div className="mt-6 border border-dashed border-slate-300 bg-white p-4 text-sm text-muted">
        Select evidence rows to build an export basket. Baskets are
        preserved in the URL and can be shared with a Supervising Officer.
      </div>
    );
  }
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4">
      <p className="text-sm text-ink">
        <strong className="font-semibold">{count}</strong> evidence row
        {count === 1 ? '' : 's'} selected for export.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clear}
          className="border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-register text-ink hover:bg-slate-50"
        >
          Clear
        </button>
        <a
          href={href(`/cases/${caseId}/evidence/export`)}
          className="bg-primary px-4 py-1.5 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover"
        >
          Continue to export
        </a>
      </div>
    </div>
  );
}
