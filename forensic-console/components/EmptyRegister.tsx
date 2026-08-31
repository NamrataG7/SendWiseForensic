import type { ReactNode } from 'react';

/**
 * EmptyRegister — restrained empty-state card for register/table views.
 *
 * No illustration, no playful copy. Reads like an official notice.
 */
export default function EmptyRegister({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="eyebrow mb-3">No entries on record</p>
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
