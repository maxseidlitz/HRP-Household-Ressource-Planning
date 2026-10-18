export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` ruft register() ebenfalls auf, dort keine Datenbank anlegen.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getDb } = await import("./db");
  const { runMigrations } = await import("./db/client");
  runMigrations(getDb());
  const { startScheduler } = await import("./server/jobs/scheduler");
  startScheduler();
}
