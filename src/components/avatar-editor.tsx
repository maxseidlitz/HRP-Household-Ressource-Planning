"use client";

import { useState } from "react";
import {
  ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  SHIRT_COLORS,
  SKIN_TONES,
  type AvatarConfig,
} from "@/catalog/avatar";
import { Avatar } from "./avatar";

const HAIR_LABELS: Record<AvatarConfig["hair"], string> = {
  short: "Kurz",
  long: "Lang",
  bun: "Dutt",
  curly: "Locken",
  bald: "Glatze",
};
const ACCESSORY_LABELS: Record<AvatarConfig["accessory"], string> = {
  none: "Nichts",
  glasses: "Brille",
  cap: "Kappe",
  headphones: "Kopfhörer",
};

/** Avatar-Editor (Spez. 12.5): Hautton, Frisur, Haarfarbe, Oberteil, Accessoire. */
export function AvatarEditor({ initial }: { initial: AvatarConfig }) {
  const [a, setA] = useState(initial);
  const set = (patch: Partial<AvatarConfig>) =>
    setA((v) => ({ ...v, ...patch }));

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="avatar" value={JSON.stringify(a)} />
      <div className="flex justify-center rounded-xl bg-white/70 py-3">
        <Avatar config={a} size={72} title="Vorschau" />
      </div>
      <Swatches
        label="Hautton"
        colors={SKIN_TONES}
        value={a.skin}
        onChange={(skin) => set({ skin })}
      />
      <Chips
        label="Frisur"
        options={HAIR_STYLES.map((h) => [h, HAIR_LABELS[h]] as const)}
        value={a.hair}
        onChange={(hair) => set({ hair })}
      />
      <Swatches
        label="Haarfarbe"
        colors={HAIR_COLORS}
        value={a.hairColor}
        onChange={(hairColor) => set({ hairColor })}
      />
      <Swatches
        label="Oberteil"
        colors={SHIRT_COLORS}
        value={a.shirt}
        onChange={(shirt) => set({ shirt })}
      />
      <Chips
        label="Accessoire"
        options={ACCESSORIES.map((x) => [x, ACCESSORY_LABELS[x]] as const)}
        value={a.accessory}
        onChange={(accessory) => set({ accessory })}
      />
    </div>
  );
}

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((c, i) => (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${i + 1}`}
            aria-pressed={value === i}
            onClick={() => onChange(i)}
            className={`size-8 rounded-full border-2 ${value === i ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-cream" : "border-ink/30"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${value === v ? "border-ink bg-sage/50" : "border-ink/30 bg-white"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
