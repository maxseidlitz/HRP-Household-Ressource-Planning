"use client";

import { useEffect } from "react";

/**
 * Registriert den Service Worker. Browser erlauben das nur in einem
 * „sicheren Kontext“ (HTTPS oder localhost), im Heimnetz über http passiert
 * also nichts.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => {
      console.warn("Service Worker nicht registriert", e);
    });
  }, []);
  return null;
}
