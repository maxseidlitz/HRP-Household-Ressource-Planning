"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-state";
import { Button, Field } from "@/components/ui";
import { updateThresholdsAction } from "@/server/actions/admin";

const pct = (v: number) => String(Math.round(v * 100));

export function ThresholdsForm({
  settings,
}: {
  settings: {
    earlyThreshold: number;
    lateThreshold: number;
    minProgress: number;
    icsAlarmMinutes: number;
  };
}) {
  const [state, action, pending] = useActionState(updateThresholdsAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Sweet Spot ab (%)"
          name="earlyThreshold"
          type="number"
          min={1}
          max={99}
          defaultValue={pct(settings.earlyThreshold)}
          required
        />
        <Field
          label="Überfällig ab (%)"
          name="lateThreshold"
          type="number"
          min={100}
          max={300}
          defaultValue={pct(settings.lateThreshold)}
          required
        />
        <Field
          label="Mindestfortschritt (%)"
          name="minProgress"
          type="number"
          min={0}
          max={99}
          defaultValue={pct(settings.minProgress)}
          hint="Darunter gibt es 0 Punkte."
          required
        />
        <Field
          label="Kalender-Erinnerung (Min.)"
          name="icsAlarmMinutes"
          type="number"
          min={0}
          max={10080}
          defaultValue={settings.icsAlarmMinutes}
          hint="0 = ohne Erinnerung"
          required
        />
      </div>
      <Button disabled={pending}>Speichern</Button>
      <FormMessage state={state} success="Gespeichert." />
    </form>
  );
}
