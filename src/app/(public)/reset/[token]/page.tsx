import { getDb } from "@/db";
import { Card } from "@/components/ui";
import { lookupPasswordReset } from "@/server/queries/password-reset";
import { ResetForm } from "./reset-form";

export default async function ResetPage({
  params,
}: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const info = lookupPasswordReset(getDb(), token, new Date());
  return (
    <Card>
      <h1 className="mb-1 text-2xl font-bold">Neues Passwort</h1>
      {info ? (
        <>
          <p className="mb-6 text-sm text-ink/70">
            Für {info.userName} (@{info.username})
          </p>
          <ResetForm token={token} />
        </>
      ) : (
        <p className="text-sm">
          Dieser Link ist ungültig, abgelaufen oder wurde schon benutzt. Bitte
          einen Admin um einen neuen.
        </p>
      )}
    </Card>
  );
}
