"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** „Feedback senden“ merkt sich den aktuellen Screen (Spez. 9.2). */
export function FeedbackLink({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <Link
      href={`/feedback?von=${encodeURIComponent(pathname)}`}
      className={className}
    >
      Feedback senden
    </Link>
  );
}
