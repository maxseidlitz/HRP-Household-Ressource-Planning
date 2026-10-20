import type { ComponentProps } from "react";

const BUTTON_VARIANTS = {
  primary: "bg-sage text-white shadow-[0_4px_14px_rgb(10_132_255/0.3)]",
  secondary: "glass text-ink",
};

/** Kapsel-Button im Liquid-Glass-Stil. */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      className={`rounded-full px-5 py-2.5 font-semibold transition active:scale-[0.97] disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export const inputClass =
  "rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-base font-normal outline-none transition focus:border-sage focus:bg-white focus:ring-4 focus:ring-sage/15";

/** Spur eines Segment-Umschalters (iOS-Stil). */
export const segmentTrack = "rounded-full bg-black/[0.06] p-0.5";

/** Ein Segment; das aktive bekommt den weißen Schieber. */
export function segmentClass(active: boolean) {
  return `rounded-full transition ${active ? "bg-white text-ink shadow-[0_1px_4px_rgb(0_0_0/0.12)]" : "text-ink/60"}`;
}

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink/80">
      {label}
      <input className={inputClass} {...props} />
      {hint && <span className="text-xs font-normal text-ink/55">{hint}</span>}
    </label>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`glass rounded-3xl p-5 ${className}`} {...props} />;
}
