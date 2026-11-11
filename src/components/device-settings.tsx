"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "./ui";

/**
 * Installation als App und Web Push (Phase 5). Beides geht nur über HTTPS;
 * auf dem iPhone kommen Push-Nachrichten erst, wenn die App zum
 * Home-Bildschirm hinzugefügt wurde.
 */
type PushState =
  | "loading"
  | "insecure"
  | "unsupported"
  | "ios-install"
  | "denied"
  | "off"
  | "on";

type InstallPrompt = Event & { prompt: () => Promise<void> };

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function base64UrlToBytes(value: string) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Wartet auf den Service Worker, aber nicht ewig (z. B. wenn er fehlt). */
function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Service Worker fehlt")), 8000),
    ),
  ]);
}

async function currentSubscription() {
  const reg = await serviceWorkerReady();
  return reg.pushManager.getSubscription();
}

function readPushState(): Promise<PushState> {
  if (!window.isSecureContext) return Promise.resolve("insecure");
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  if (!supported)
    return Promise.resolve(
      isIos() && !isStandalone() ? "ios-install" : "unsupported",
    );
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return currentSubscription().then(
    (s) => (s ? "on" : "off"),
    () => "unsupported" as const,
  );
}

// „Läuft als installierte App?“ ändert sich nicht während der Sitzung.
const noop = () => () => {};

export function DeviceSettings({ vapidKey }: { vapidKey: string }) {
  const [push, setPush] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const standalone = useSyncExternalStore(noop, isStandalone, () => false);
  const ios = useSyncExternalStore(noop, isIos, () => false);

  useEffect(() => {
    let alive = true;
    readPushState().then((s) => alive && setPush(s));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      alive = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setPush("denied");
        return;
      }
      const reg = await serviceWorkerReady();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(vapidKey),
        }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      setPush("on");
    } catch {
      setError("Push ließ sich nicht einschalten. Bitte später erneut.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPush("off");
    } finally {
      setBusy(false);
    }
  }

  const hint: Record<Exclude<PushState, "on" | "off">, string> = {
    loading: "…",
    insecure:
      "Push-Nachrichten und App-Installation gibt es, sobald die WG-App über HTTPS mit eigener Domain läuft. Bis dahin aktualisiert sich die Glocke automatisch, solange die App offen ist.",
    unsupported: "Dieser Browser unterstützt keine Push-Nachrichten.",
    "ios-install":
      "Auf dem iPhone: erst über Teilen → „Zum Home-Bildschirm“ installieren, dann die App öffnen und Push hier einschalten.",
    denied:
      "Mitteilungen sind für diese Seite blockiert. Erlaube sie in den Browser- bzw. Systemeinstellungen und lade die Seite neu.",
  };

  return (
    <div className="flex flex-col gap-4" data-testid="device-settings">
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Push-Nachrichten</h3>
        {push === "on" || push === "off" ? (
          <>
            <p className="text-sm text-ink/70">
              {push === "on"
                ? "Eingeschaltet: Erinnerungen und Neuigkeiten kommen auch, wenn die App zu ist."
                : "Erinnerungen und Neuigkeiten aus der WG als Benachrichtigung auf diesem Gerät."}
            </p>
            <Button
              variant={push === "on" ? "secondary" : "primary"}
              disabled={busy}
              onClick={push === "on" ? disable : enable}
            >
              {push === "on" ? "Push ausschalten" : "Push einschalten"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink/70" data-testid="push-hint">
            {hint[push]}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-status-overdue">
            {error}
          </p>
        )}
      </div>

      {!standalone && (installPrompt || ios) && (
        <div className="flex flex-col gap-2 border-t border-black/5 pt-4">
          <h3 className="font-semibold">Als App installieren</h3>
          {installPrompt ? (
            <Button
              variant="secondary"
              onClick={async () => {
                await installPrompt.prompt();
                setInstallPrompt(null);
              }}
            >
              App installieren
            </Button>
          ) : (
            <p className="text-sm text-ink/70">
              In Safari auf Teilen tippen und „Zum Home-Bildschirm“ wählen.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
