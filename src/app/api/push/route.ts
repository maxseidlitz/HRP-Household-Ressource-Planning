import { z } from "zod";
import { requireUser } from "@/server/context";
import { DomainError } from "@/server/errors";
import { deleteSubscription, saveSubscription } from "@/server/queries/push";

/** Web-Push-Abo eines Geräts an- oder abmelden (Phase 5). */
const body = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
});

/** Nur Anfragen der eigenen Seite (zusätzlich zum SameSite-Cookie). */
function foreignOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

async function parse(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

export async function POST(req: Request) {
  if (foreignOrigin(req)) return new Response(null, { status: 403 });
  const { db, user } = await requireUser();
  const data = await parse(req);
  if (!data?.keys)
    return Response.json({ error: "Ungültiges Push-Abo." }, { status: 400 });
  try {
    saveSubscription(db, {
      userId: user.id,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      userAgent: req.headers.get("user-agent"),
    });
  } catch (e) {
    if (e instanceof DomainError)
      return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (foreignOrigin(req)) return new Response(null, { status: 403 });
  const { db, user } = await requireUser();
  const data = await parse(req);
  if (!data) return Response.json({ error: "Ungültig." }, { status: 400 });
  deleteSubscription(db, { userId: user.id, endpoint: data.endpoint });
  return Response.json({ ok: true });
}
