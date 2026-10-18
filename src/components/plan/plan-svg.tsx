import type { ReactNode } from "react";
import { objectEmoji } from "@/catalog/objects";
import type { RoomType } from "@/catalog/rooms";
import {
  bounds,
  doorKey,
  labelTile,
  rotatedSize,
  wallEdges,
  type Tile,
} from "@/domain/grid";
import type { PlanGroup, PlanObject, PlanRoom } from "@/server/queries/plan";

/** Größe einer Kachel in SVG-Einheiten. */
export const TILE = 24;
const INK = "#3a3a3c";

/** Böden je Raumtyp (Spez. 12.3): Fliesen, Dielen, Laminat. */
const FLOORS: Record<
  RoomType,
  { fill: string; pattern: "tiles" | "planks" | "plain" }
> = {
  kitchen: { fill: "#eceef2", pattern: "tiles" },
  bath: { fill: "#e2edf3", pattern: "tiles" },
  wc: { fill: "#e2edf3", pattern: "tiles" },
  hallway: { fill: "#eee8df", pattern: "planks" },
  living: { fill: "#e6dac8", pattern: "planks" },
  bedroom: { fill: "#e6dac8", pattern: "planks" },
  balcony: { fill: "#e2ede0", pattern: "plain" },
  storage: { fill: "#e9e9ed", pattern: "plain" },
  other: { fill: "#edece9", pattern: "plain" },
};

export function planViewBox(rooms: PlanRoom[], margin = 1) {
  const b = bounds(rooms.flatMap((r) => r.tiles));
  if (!b) return null;
  return {
    x: (b.minX - margin) * TILE,
    y: (b.minY - margin) * TILE,
    w: (b.maxX - b.minX + 1 + 2 * margin) * TILE,
    h: (b.maxY - b.minY + 1 + 2 * margin) * TILE,
  };
}

function Defs() {
  return (
    <defs>
      <pattern
        id="pat-tiles"
        width={TILE / 2}
        height={TILE / 2}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={`M ${TILE / 2} 0 L 0 0 0 ${TILE / 2}`}
          fill="none"
          stroke={INK}
          strokeOpacity="0.08"
        />
      </pattern>
      <pattern
        id="pat-planks"
        width={TILE}
        height={TILE / 3}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={`M 0 ${TILE / 3} H ${TILE}`}
          stroke={INK}
          strokeOpacity="0.1"
        />
      </pattern>
      <pattern
        id="pat-hatch"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" fill="#d6d6dc" />
        <path d="M 0 0 V 6" stroke={INK} strokeOpacity="0.15" strokeWidth="2" />
      </pattern>
    </defs>
  );
}

function TileRects({
  tiles,
  fill,
  opacity = 1,
}: {
  tiles: Tile[];
  fill: string;
  opacity?: number;
}) {
  return (
    <g fill={fill} opacity={opacity}>
      {tiles.map(([x, y]) => (
        <rect
          key={`${x},${y}`}
          x={x * TILE}
          y={y * TILE}
          width={TILE + 0.5}
          height={TILE + 0.5}
        />
      ))}
    </g>
  );
}

function edgeLine(e: { x: number; y: number; side: string }) {
  const x0 = e.x * TILE;
  const y0 = e.y * TILE;
  switch (e.side) {
    case "n":
      return { x1: x0, y1: y0, x2: x0 + TILE, y2: y0 };
    case "s":
      return { x1: x0, y1: y0 + TILE, x2: x0 + TILE, y2: y0 + TILE };
    case "w":
      return { x1: x0, y1: y0, x2: x0, y2: y0 + TILE };
    default:
      return { x1: x0 + TILE, y1: y0, x2: x0 + TILE, y2: y0 + TILE };
  }
}

export function RoomShape({
  room,
  selected = false,
  dimmed = false,
  onSelectFloor,
}: {
  room: PlanRoom;
  selected?: boolean;
  dimmed?: boolean;
  onSelectFloor?: (objectId: string) => void;
}) {
  if (room.tiles.length === 0) return null;
  const floor = FLOORS[room.type];
  const doors = new Set(room.doors.map(doorKey));
  const label = labelTile(room.tiles)!;
  const walls = wallEdges(room.tiles);
  return (
    <g data-room={room.id} opacity={dimmed ? 0.45 : 1}>
      {room.foreign ? (
        <TileRects tiles={room.tiles} fill="url(#pat-hatch)" />
      ) : (
        <>
          <TileRects tiles={room.tiles} fill={floor.fill} />
          {floor.pattern !== "plain" && (
            <TileRects tiles={room.tiles} fill={`url(#pat-${floor.pattern})`} />
          )}
          {room.floor && room.floor.taskCount > 0 && (
            <g
              className={
                room.floor.status === "overdue" ||
                room.floor.status === "filthy"
                  ? "animate-overdue"
                  : ""
              }
              role={onSelectFloor ? "button" : undefined}
              aria-label={onSelectFloor ? `Boden ${room.name}` : undefined}
              onClick={
                onSelectFloor
                  ? () => onSelectFloor(room.floor!.objectId)
                  : undefined
              }
              style={{ cursor: onSelectFloor ? "pointer" : undefined }}
            >
              <TileRects
                tiles={room.tiles}
                fill={room.floor.color}
                opacity={0.28}
              />
            </g>
          )}
        </>
      )}
      {selected && (
        <TileRects tiles={room.tiles} fill="#0a84ff" opacity={0.12} />
      )}
      <g stroke={INK} strokeWidth={2.5} strokeLinecap="square">
        {walls
          .filter((e) => !doors.has(doorKey(e)))
          .map((e) => (
            <line key={doorKey(e)} {...edgeLine(e)} />
          ))}
      </g>
      <g stroke="#f4f5f8" strokeWidth={4}>
        {room.doors.map((d) => (
          <line key={doorKey(d)} {...edgeLine(d)} />
        ))}
      </g>
      <g stroke={INK} strokeWidth={1} strokeDasharray="2 2">
        {room.doors.map((d) => (
          <line key={`dl-${doorKey(d)}`} data-door {...edgeLine(d)} />
        ))}
      </g>
      <text
        x={(label[0] + 0.5) * TILE}
        y={(label[1] + 0.5) * TILE}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight={700}
        fill={INK}
        fillOpacity={room.foreign ? 0.8 : 0.45}
        style={{ pointerEvents: "none" }}
      >
        {room.foreign ? `🔒 ${room.ownerName ?? room.name}` : room.name}
      </text>
    </g>
  );
}

export function ObjectShape({
  object: o,
  selected = false,
  ghost = false,
  onSelect,
  badge,
}: {
  object: PlanObject;
  selected?: boolean;
  ghost?: boolean;
  onSelect?: (id: string) => void;
  /** Wecker-Label einer Einplanung, z. B. „Fr · A“. */
  badge?: string;
}) {
  const { w, h } = rotatedSize(o);
  const x = o.x * TILE;
  const y = o.y * TILE;
  const pw = w * TILE;
  const ph = h * TILE;
  const hasTasks = o.taskCount > 0;
  const overdue = o.status === "overdue" || o.status === "filthy";
  const size = Math.min(pw, ph);
  return (
    <g
      data-object={o.id}
      role={onSelect ? "button" : undefined}
      aria-label={
        onSelect ? `${o.name}${hasTasks ? "" : " (keine Aufgaben)"}` : undefined
      }
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ? () => onSelect(o.id) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(o.id);
            }
          : undefined
      }
      style={{ cursor: onSelect ? "pointer" : undefined }}
      opacity={ghost ? 0.55 : 1}
    >
      {hasTasks && (
        <rect
          x={x + 1}
          y={y + 1}
          width={pw - 2}
          height={ph - 2}
          rx={6}
          fill={o.color}
          opacity={0.55}
          className={overdue ? "animate-overdue" : ""}
        />
      )}
      <rect
        x={x + 3}
        y={y + 3}
        width={pw - 6}
        height={ph - 6}
        rx={4}
        fill={hasTasks ? o.color : "#fbf8f1"}
        fillOpacity={hasTasks ? 0.35 : 1}
        stroke={INK}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={ghost ? "3 2" : undefined}
      />
      <rect
        x={x + 3}
        y={y + 3}
        width={pw - 6}
        height={ph - 6}
        rx={4}
        fill="#fff"
        opacity={hasTasks ? 0.45 : 0}
      />
      <text
        x={x + pw / 2}
        y={y + ph / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.max(10, Math.min(18, size * 0.6))}
        style={{ pointerEvents: "none" }}
      >
        {objectEmoji(o.type)}
      </text>
      {o.status === "filthy" && (
        <text
          x={x + pw - 4}
          y={y + 8}
          fontSize={9}
          textAnchor="end"
          style={{ pointerEvents: "none" }}
        >
          🪰
        </text>
      )}
      {badge && (
        <g style={{ pointerEvents: "none" }} data-testid="plan-badge">
          <rect
            x={x - 4}
            y={y - 9}
            width={badge.length * 4.6 + 14}
            height={13}
            rx={6.5}
            fill="#fff"
            stroke={INK}
            strokeWidth={1}
          />
          <text x={x + 2} y={y + 1} fontSize={8.5} fontWeight={700} fill={INK}>
            ⏰ {badge}
          </text>
        </g>
      )}
      {selected && (
        <rect
          x={x}
          y={y}
          width={pw}
          height={ph}
          rx={6}
          fill="none"
          stroke="#0a84ff"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
    </g>
  );
}

/** Einbauküche & Co.: gemeinsamer Möbelblock hinter den Einzelteilen. */
export function GroupShape({
  group,
  objects,
}: {
  group: PlanGroup;
  objects: PlanObject[];
}) {
  const members = objects.filter((o) => o.groupId === group.id && o.placed);
  if (members.length === 0) return null;
  const tiles = members.flatMap((o) => {
    const { w, h } = rotatedSize(o);
    return [
      [o.x, o.y],
      [o.x + w - 1, o.y + h - 1],
    ] as Tile[];
  });
  const b = bounds(tiles)!;
  return (
    <rect
      data-group={group.id}
      x={b.minX * TILE + 1}
      y={b.minY * TILE + 1}
      width={(b.maxX - b.minX + 1) * TILE - 2}
      height={(b.maxY - b.minY + 1) * TILE - 2}
      rx={5}
      fill="#d1d1d6"
      stroke={INK}
      strokeWidth={2}
    >
      <title>{group.name}</title>
    </rect>
  );
}

export function PlanSvg({
  rooms,
  objects,
  groups,
  viewBox,
  selectedRoomId,
  selectedObjectId,
  onSelectObject,
  onSelectFloor,
  badges,
  className,
  svgRef,
  children,
  ...rest
}: {
  rooms: PlanRoom[];
  objects: PlanObject[];
  groups: PlanGroup[];
  viewBox: { x: number; y: number; w: number; h: number };
  selectedRoomId?: string | null;
  selectedObjectId?: string | null;
  onSelectObject?: (id: string) => void;
  onSelectFloor?: (objectId: string) => void;
  /** Wecker-Labels je Objekt (Spez. 12.4). */
  badges?: Record<string, string>;
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
  children?: ReactNode;
} & Omit<React.SVGProps<SVGSVGElement>, "viewBox" | "children">) {
  // Unterräume nach ihrem Zimmer zeichnen, damit sie obenauf liegen.
  const ordered = [...rooms].sort(
    (a, b) => Number(Boolean(a.parentRoomId)) - Number(Boolean(b.parentRoomId)),
  );
  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      className={className}
      role="img"
      aria-label="Wohnungsplan"
      {...rest}
    >
      <Defs />
      {ordered.map((r) => (
        <RoomShape
          key={r.id}
          room={r}
          selected={selectedRoomId === r.id}
          onSelectFloor={onSelectFloor}
        />
      ))}
      {groups.map((g) => (
        <GroupShape key={g.id} group={g} objects={objects} />
      ))}
      {objects
        .filter((o) => o.placed)
        .map((o) => (
          <ObjectShape
            key={o.id}
            object={o}
            selected={selectedObjectId === o.id}
            onSelect={onSelectObject}
            badge={badges?.[o.id]}
          />
        ))}
      {children}
    </svg>
  );
}
