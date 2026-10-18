import type { FormState } from "@/server/actions/result";

export function FormMessage({
  state,
  success,
}: {
  state: FormState<unknown>;
  success?: string;
}) {
  if (!state) return null;
  if (!state.ok)
    return (
      <p role="alert" className="text-sm font-medium text-status-overdue">
        {state.error}
      </p>
    );
  return success ? (
    <p role="status" className="text-sm font-medium text-sage-dark">
      {success}
    </p>
  ) : null;
}
