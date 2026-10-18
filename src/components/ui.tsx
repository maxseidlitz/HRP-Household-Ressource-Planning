import type { ComponentProps } from "react";

/** Button mit leichtem 3D-Kanten-Look passend zum Diorama (Spez. 12.6). */
export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`rounded-xl border-2 border-ink border-b-4 bg-sage px-4 py-2.5 font-semibold text-ink transition active:translate-y-0.5 active:border-b-2 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        className="rounded-lg border-2 border-ink/30 bg-white px-3 py-2 text-base font-normal outline-none focus:border-sage-dark"
        {...props}
      />
      {hint && <span className="text-xs font-normal text-ink/60">{hint}</span>}
    </label>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-2xl border-2 border-ink bg-cream-dark/60 p-6 shadow-[0_4px_0_0_var(--ink)] ${className}`}
      {...props}
    />
  );
}
