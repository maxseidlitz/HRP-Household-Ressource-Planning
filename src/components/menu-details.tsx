"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";

/**
 * <details>-Menü, das sich nach einer Navigation und beim Tippen außerhalb
 * schließt. Das Layout bleibt beim Seitenwechsel bestehen, ein offenes
 * Menü würde sonst die neue Seite verdecken.
 */
export function MenuDetails(props: ComponentProps<"details">) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  return <details ref={ref} {...props} />;
}
