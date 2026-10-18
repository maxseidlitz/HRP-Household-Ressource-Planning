"use client";

import { useState } from "react";

export const ZOOM_STEPS = [0.75, 1, 1.5, 2, 3];

/** Zoomstufe als Breite relativ zum Container; gescrollt wird nativ. */
export function useZoom(initial = 1) {
  const [index, setIndex] = useState(ZOOM_STEPS.indexOf(initial));
  return {
    zoom: ZOOM_STEPS[index],
    canIn: index < ZOOM_STEPS.length - 1,
    canOut: index > 0,
    zoomIn: () => setIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1)),
    zoomOut: () => setIndex((i) => Math.max(i - 1, 0)),
  };
}

export function ZoomButtons({ z }: { z: ReturnType<typeof useZoom> }) {
  const cls =
    "flex size-9 items-center justify-center rounded-lg border-2 border-ink bg-cream text-lg font-bold disabled:opacity-40";
  return (
    <div className="flex gap-1" role="group" aria-label="Zoom">
      <button
        type="button"
        className={cls}
        onClick={z.zoomIn}
        disabled={!z.canIn}
        aria-label="Hineinzoomen"
      >
        +
      </button>
      <button
        type="button"
        className={cls}
        onClick={z.zoomOut}
        disabled={!z.canOut}
        aria-label="Herauszoomen"
      >
        −
      </button>
    </div>
  );
}
