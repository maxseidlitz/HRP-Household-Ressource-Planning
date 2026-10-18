"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ViewRotation } from "@/domain/iso";
import type { IsoData, IsoScene } from "./scene";

export type IsoViewHandle = {
  celebrate: (objectId: string, label: string) => void;
};

/**
 * React-Hülle für das Diorama. PixiJS wird erst im Browser geladen; ohne
 * WebGL meldet sich die Komponente über onUnavailable (dann 2D).
 */
export const IsoView = forwardRef<
  IsoViewHandle,
  {
    data: IsoData;
    onSelect: (objectId: string) => void;
    onUnavailable: () => void;
    /** Links in der Werkzeugleiste, z. B. der 3D/2D-Umschalter. */
    leading?: React.ReactNode;
  }
>(function IsoView({ data, onSelect, onUnavailable, leading }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<IsoScene | null>(null);
  const latest = useRef({ data, onSelect, onUnavailable });
  const [rotation, setRotation] = useState<ViewRotation>(0);

  useEffect(() => {
    latest.current = { data, onSelect, onUnavailable };
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { IsoScene } = await import("./scene");
        if (cancelled || !host.current) return;
        const s = await IsoScene.create(host.current, latest.current.data, {
          onSelect: (id) => latest.current.onSelect(id),
        });
        if (cancelled) {
          s?.destroy();
          return;
        }
        if (!s) latest.current.onUnavailable();
        scene.current = s;
      } catch (e) {
        console.warn("Diorama konnte nicht starten", e);
        if (!cancelled) latest.current.onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      scene.current?.destroy();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.update(data);
  }, [data]);

  useImperativeHandle(ref, () => ({
    celebrate: (objectId, label) => scene.current?.celebrate(objectId, label),
  }));

  const btn =
    "flex size-9 items-center justify-center rounded-lg border-2 border-ink bg-cream text-lg font-bold";
  const rotate = (delta: 1 | 3) => {
    const k = ((rotation + delta) % 4) as ViewRotation;
    setRotation(k);
    scene.current?.setRotation(k);
  };

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-1">
        <div className="mr-auto">{leading}</div>
        <div className="flex gap-1" role="group" aria-label="Ansicht">
          <button
            type="button"
            className={btn}
            aria-label="Ansicht nach links drehen"
            onClick={() => rotate(3)}
          >
            ⟲
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Ansicht nach rechts drehen"
            onClick={() => rotate(1)}
          >
            ⟳
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Hineinzoomen"
            onClick={() => scene.current?.zoomBy(1.25)}
          >
            +
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Herauszoomen"
            onClick={() => scene.current?.zoomBy(0.8)}
          >
            −
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Ansicht zurücksetzen"
            onClick={() => scene.current?.resetView()}
          >
            ⌂
          </button>
        </div>
      </div>
      <div
        ref={host}
        data-testid="iso"
        className="-mx-4 overflow-hidden bg-[#f3ead9]"
        style={{
          height: "min(calc(100dvh - 17rem), 72vw, 560px)",
          minHeight: 300,
        }}
      />
    </div>
  );
});
