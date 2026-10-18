"use client";

import { useEffect } from "react";
import { clearCurrentUnread } from "@/components/notification-bell";
import { markNotificationsReadAction } from "@/server/actions/planning";

/** Beim Öffnen der Mitteilungen gilt alles als gelesen. */
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) void markNotificationsReadAction().then(clearCurrentUnread);
  }, [unread]);
  return null;
}
