import "server-only";
import webpush from "web-push";
import { env } from "@/lib/env";
import { resolveVapidKeys } from "@/lib/vapid";
import type { PushSender } from "./jobs/push";

let configured: { publicKey: string } | null = null;

/** VAPID-Schlüssel laden (bzw. erzeugen) und web-push einrichten. */
export function vapidPublicKey(): string {
  if (!configured) {
    const keys = resolveVapidKeys(env.DATA_DIR, {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    });
    webpush.setVapidDetails(env.VAPID_SUBJECT, keys.publicKey, keys.privateKey);
    configured = { publicKey: keys.publicKey };
  }
  return configured.publicKey;
}

/** Echter Versand über die Push-Dienste der Browser-Hersteller. */
export const webPushSender: PushSender = async (sub, message) => {
  vapidPublicKey();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      { TTL: 12 * 3600, urgency: "normal" },
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("[push]", status ?? e);
    return "error";
  }
};
