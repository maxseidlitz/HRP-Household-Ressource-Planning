import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Polygon,
  Text,
} from "pixi.js";
import {
  HAIR_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type AvatarConfig,
} from "@/catalog/avatar";
import { objectEmoji } from "@/catalog/objects";
import type { RoomType } from "@/catalog/rooms";
import {
  chooseIdleGoal,
  currentTile,
  initialAvatar,
  seededRng,
  sendToClean,
  stepAvatar,
  type AvatarState,
  type Interactable,
  type Rng,
} from "@/domain/avatar-ai";
import {
  footprintTiles,
  labelTile,
  tileKey,
  wallEdges,
  type Tile,
} from "@/domain/grid";
import {
  depthOf,
  hexToNumber,
  isBackWall,
  ISO_Z,
  mixColor,
  objectBaseColor,
  objectHeight,
  project,
  rotateCell,
  rotatePoint,
  rotateSide,
  shade,
  unproject,
  type ViewRotation,
} from "@/domain/iso";
import { buildWalkGrid, type WalkGrid } from "@/domain/walk";
import type { Plan, PlanObject, PlanRoom } from "@/server/queries/plan";

export type IsoAvatar = {
  userId: string;
  name: string;
  avatar: AvatarConfig;
  /** Im Urlaub: ausgegraut mit Koffer, läuft nicht (Spez. 7). */
  away?: boolean;
};

export type IsoData = {
  plan: Plan;
  avatars: IsoAvatar[];
  viewerId: string;
  /** Wecker-Labels je Objekt, z. B. „Fr · Anna“ (Spez. 12.4). */
  badges?: Record<string, string>;
};

export type IsoCallbacks = {
  onSelect: (objectId: string) => void;
};

const INK = 0x2f2a24;
const WALL = 0xefe6d6;
const WALL_H = 0.55;
const FOREIGN_FLOOR = 0xcfc8bb;

/** Böden je Raumtyp (Spez. 12.3). */
const FLOOR: Record<
  RoomType,
  { color: number; pattern: "tiles" | "planks" | "plain" }
> = {
  kitchen: { color: 0xece6d8, pattern: "tiles" },
  bath: { color: 0xdfe8ea, pattern: "tiles" },
  wc: { color: 0xdfe8ea, pattern: "tiles" },
  hallway: { color: 0xeadcc0, pattern: "planks" },
  living: { color: 0xdcc29a, pattern: "planks" },
  bedroom: { color: 0xdcc29a, pattern: "planks" },
  balcony: { color: 0xd7e2cc, pattern: "plain" },
  storage: { color: 0xe3dccd, pattern: "plain" },
  other: { color: 0xebe3d2, pattern: "plain" },
};

type Pt = { x: number; y: number };
const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);

type AvatarSprite = {
  userId: string;
  root: Container;
  body: Container;
  bubble: Container;
  bubbleText: Text;
  state: AvatarState;
  rng: Rng;
  grid: WalkGrid;
  phase: number;
  away: boolean;
};

type ObjectFx = {
  objectId: string;
  aura: Graphics | null;
  pulsing: boolean;
  top: Pt;
  base: Pt;
  flies: Graphics[];
  extra: Graphics | null;
};

type Particle = {
  g: Container;
  vx: number;
  vy: number;
  life: number;
  max: number;
};

/**
 * Isometrisches Diorama (Spez. 12) auf Basis von PixiJS. Rendert dieselben
 * Plandaten wie die 2D-Ansicht, nur in einer anderen Projektion.
 */
export class IsoScene {
  private app: Application;
  private container: HTMLElement;
  private world = new Container();
  private floorLayer = new Container();
  private auraLayer = new Container();
  private entityLayer = new Container();
  private fxLayer = new Container();
  private labelLayer = new Container();
  /** Glitzern und Punkte überleben einen Neuaufbau der Szene. */
  private particleLayer = new Container();
  private data: IsoData;
  private cb: IsoCallbacks;
  private rotation: ViewRotation = 0;
  private avatars = new Map<string, AvatarSprite>();
  private objectFx: ObjectFx[] = [];
  private particles: Particle[] = [];
  private interactables: Interactable[] = [];
  private time = 0;
  private allClean = false;
  private dragged = 0;
  private pointers = new Map<number, Pt>();
  private lastTap = 0;
  private fitted = false;
  private destroyed = false;

  private constructor(
    app: Application,
    container: HTMLElement,
    data: IsoData,
    cb: IsoCallbacks,
  ) {
    this.app = app;
    this.container = container;
    this.data = data;
    this.cb = cb;
  }

  /** Liefert null, wenn WebGL nicht verfügbar ist (dann 2D-Ansicht). */
  static async create(
    container: HTMLElement,
    data: IsoData,
    cb: IsoCallbacks,
    rotation: ViewRotation = 0,
  ): Promise<IsoScene | null> {
    const app = new Application();
    try {
      await app.init({
        resizeTo: container,
        background: 0xf3ead9,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: "webgl",
      });
    } catch (e) {
      console.warn("Isometrie nicht verfügbar", e);
      return null;
    }
    const scene = new IsoScene(app, container, data, cb);
    scene.rotation = rotation;
    scene.mount();
    return scene;
  }

  private mount() {
    const { app } = this;
    app.canvas.setAttribute("aria-hidden", "true");
    app.canvas.style.touchAction = "none";
    app.canvas.style.display = "block";
    this.container.appendChild(app.canvas);
    this.entityLayer.sortableChildren = true;
    this.world.addChild(
      this.floorLayer,
      this.auraLayer,
      this.entityLayer,
      this.fxLayer,
      this.labelLayer,
      this.particleLayer,
    );
    app.stage.addChild(this.world);
    this.setupInput();
    this.rebuild();
    app.ticker.add((t) => this.tick(Math.min(t.deltaMS / 1000, 0.1)));
    app.renderer.on("resize", () => this.fit());
    this.container.dataset.ready = "true";
  }

  update(data: IsoData) {
    this.data = data;
    this.rebuild();
  }

  setRotation(k: ViewRotation) {
    this.rotation = k;
    this.fitted = false;
    this.rebuild();
  }

  zoomBy(factor: number) {
    const s = this.app.screen;
    this.zoomAt({ x: s.width / 2, y: s.height / 2 }, factor);
  }

  resetView() {
    this.fitted = false;
    this.fit();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.destroy({ removeView: true }, { children: true });
  }

  // ---------------------------------------------------------------------
  // Aufbau
  // ---------------------------------------------------------------------

  private rot(x: number, y: number): Tile {
    return rotateCell(x, y, this.rotation);
  }

  private pt(px: number, py: number, z = 0): Pt {
    const [rx, ry] = rotatePoint(px, py, this.rotation);
    return project(rx, ry, z);
  }

  /** Ecken einer (gedrehten) Zelle auf Höhe z. */
  private cellCorners(rx: number, ry: number, z = 0): Pt[] {
    return [
      project(rx, ry, z),
      project(rx + 1, ry, z),
      project(rx + 1, ry + 1, z),
      project(rx, ry + 1, z),
    ];
  }

  private rebuild() {
    for (const layer of [
      this.floorLayer,
      this.auraLayer,
      this.entityLayer,
      this.fxLayer,
      this.labelLayer,
    ]) {
      for (const c of layer.removeChildren()) {
        if (!this.isAvatarRoot(c)) c.destroy({ children: true });
      }
    }
    this.objectFx = [];
    const rooms = [...this.data.plan.rooms].sort(
      (a, b) =>
        Number(Boolean(a.parentRoomId)) - Number(Boolean(b.parentRoomId)),
    );
    for (const r of rooms) this.drawFloor(r);
    for (const r of rooms) this.drawWalls(r);
    const placed = this.data.plan.objects.filter((o) => o.placed);
    for (const o of placed) this.drawObject(o);
    for (const r of rooms) this.drawLabel(r);
    this.allClean =
      this.data.plan.tasks.length > 0 &&
      this.data.plan.tasks.every((t) => !t.active || t.status === "fresh");
    this.interactables = placed.map((o) => ({
      id: o.id,
      type: o.type,
      footprint: footprintTiles(o),
    }));
    this.syncAvatars();
    this.fit();
    this.container.dataset.objects = String(placed.length);
    this.container.dataset.badges = String(
      Object.keys(this.data.badges ?? {}).length,
    );
  }

  private isAvatarRoot(c: Container) {
    for (const a of this.avatars.values()) if (a.root === c) return true;
    return false;
  }

  private drawFloor(r: PlanRoom) {
    if (r.tiles.length === 0) return;
    const style = FLOOR[r.type];
    const g = new Graphics();
    const color = r.foreign ? FOREIGN_FLOOR : style.color;
    for (const [x, y] of r.tiles) {
      const [rx, ry] = this.rot(x, y);
      const c = this.cellCorners(rx, ry);
      g.poly(flat(c))
        .fill({ color })
        .stroke({
          width: 1,
          color: INK,
          alpha: style.pattern === "tiles" ? 0.08 : 0.03,
        });
      if (!r.foreign && style.pattern === "planks") {
        for (const f of [1 / 3, 2 / 3]) {
          const a = this.mid(c[0], c[3], f);
          const b = this.mid(c[1], c[2], f);
          g.moveTo(a.x, a.y)
            .lineTo(b.x, b.y)
            .stroke({ width: 1, color: INK, alpha: 0.07 });
        }
      }
      if (r.foreign && (x + y) % 2 === 0) {
        g.poly(flat(c)).fill({ color: INK, alpha: 0.05 });
      }
    }
    this.floorLayer.addChild(g);

    if (r.floor && r.floor.taskCount > 0) {
      const tint = new Graphics();
      for (const [x, y] of r.tiles) {
        const [rx, ry] = this.rot(x, y);
        tint
          .poly(flat(this.cellCorners(rx, ry)))
          .fill({ color: hexToNumber(r.floor.color) });
      }
      tint.alpha = 0.3;
      const floorId = r.floor.objectId;
      tint.eventMode = "static";
      tint.cursor = "pointer";
      tint.on("pointertap", () => this.select(floorId));
      this.auraLayer.addChild(tint);
      this.objectFx.push({
        objectId: floorId,
        aura: tint,
        pulsing: r.floor.status === "overdue" || r.floor.status === "filthy",
        top: this.labelPoint(r),
        base: this.labelPoint(r),
        flies: [],
        extra: null,
      });
    }
  }

  private mid(a: Pt, b: Pt, t: number): Pt {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private labelPoint(r: PlanRoom): Pt {
    const t = labelTile(r.tiles) ?? [0, 0];
    return this.pt(t[0] + 0.5, t[1] + 0.5);
  }

  private drawWalls(r: PlanRoom) {
    const doors = new Set(r.doors.map((d) => `${d.x},${d.y},${d.side}`));
    for (const e of wallEdges(r.tiles)) {
      if (doors.has(`${e.x},${e.y},${e.side}`)) continue;
      const side = rotateSide(e.side, this.rotation);
      const [rx, ry] = this.rot(e.x, e.y);
      if (!isBackWall(side)) continue;
      // Hintere Wand: halbhohe Platte entlang der Kante (Cutaway).
      const [a, b] =
        side === "n"
          ? [project(rx, ry), project(rx + 1, ry)]
          : [project(rx, ry), project(rx, ry + 1)];
      const up = WALL_H * ISO_Z;
      const g = new Graphics();
      const face = side === "n" ? shade(WALL, 0.95) : shade(WALL, 0.82);
      g.poly([a.x, a.y, b.x, b.y, b.x, b.y - up, a.x, a.y - up])
        .fill({ color: face })
        .stroke({ width: 1, color: INK, alpha: 0.35 });
      g.moveTo(a.x, a.y - up)
        .lineTo(b.x, b.y - up)
        .stroke({ width: 3, color: INK, alpha: 0.85 });
      g.zIndex = rx + ry - 0.6;
      this.entityLayer.addChild(g);
    }
  }

  private drawObject(o: PlanObject) {
    const cells = footprintTiles(o).map(([x, y]) => this.rot(x, y));
    if (cells.length === 0) return;
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const inset = 0.1;
    const x0 = Math.min(...xs) + inset;
    const y0 = Math.min(...ys) + inset;
    const x1 = Math.max(...xs) + 1 - inset;
    const y1 = Math.max(...ys) + 1 - inset;
    const h = objectHeight(o.type);
    const hasTasks = o.taskCount > 0;
    const status = hexToNumber(o.color);
    const base = objectBaseColor(o.type);
    const body = hasTasks ? mixColor(base, status, 0.5) : base;

    // Aura / Bodenplatte in Statusfarbe (Spez. 12.4)
    let aura: Graphics | null = null;
    if (hasTasks) {
      aura = new Graphics();
      const e = 0.2;
      aura
        .poly(
          flat([
            project(x0 - e, y0 - e),
            project(x1 + e, y0 - e),
            project(x1 + e, y1 + e),
            project(x0 - e, y1 + e),
          ]),
        )
        .fill({ color: status });
      aura.alpha = 0.55;
      this.auraLayer.addChild(aura);
    }

    const g = new Container();
    const box = new Graphics();
    const A = project(x0, y0, h);
    const B = project(x1, y0, h);
    const C = project(x1, y1, h);
    const D = project(x0, y1, h);
    const Bg = project(x1, y0);
    const Cg = project(x1, y1);
    const Dg = project(x0, y1);
    // Südseite (links unten) und Ostseite (rechts unten), dann Deckel
    box
      .poly(flat([D, C, Cg, Dg]))
      .fill({ color: shade(body, 0.86) })
      .stroke({ width: 1.5, color: INK, alpha: 0.9 });
    box
      .poly(flat([C, B, Bg, Cg]))
      .fill({ color: shade(body, 0.7) })
      .stroke({ width: 1.5, color: INK, alpha: 0.9 });
    box
      .poly(flat([A, B, C, D]))
      .fill({ color: shade(body, 1.08) })
      .stroke({ width: 1.5, color: INK, alpha: 0.9 });
    g.addChild(box);

    const top = { x: (A.x + C.x) / 2, y: (A.y + C.y) / 2 };
    const size = Math.min(28, 13 + 8 * Math.min(x1 - x0, y1 - y0));
    const icon = new Text({
      text: objectEmoji(o.type),
      style: { fontSize: size },
    });
    icon.anchor.set(0.5);
    icon.position.set(top.x, top.y);
    icon.skew.set(0, 0);
    g.addChild(icon);

    g.eventMode = "static";
    g.cursor = "pointer";
    g.hitArea = new Polygon(flat([A, B, Bg, Cg, Dg, D]));
    g.on("pointertap", () => this.select(o.id));
    g.zIndex = depthOf(cells);
    g.label = `object:${o.id}`;
    this.entityLayer.addChild(g);

    const fx: ObjectFx = {
      objectId: o.id,
      aura,
      pulsing: o.status === "overdue" || o.status === "filthy",
      top,
      base: project((x0 + x1) / 2, (y0 + y1) / 2),
      flies: [],
      extra: null,
    };
    if (o.status === "filthy") this.addDirt(fx, o.type, { x0, y0, x1, y1 });
    this.objectFx.push(fx);
    const badge = this.data.badges?.[o.id];
    if (badge) this.drawBadge(`⏰ ${badge}`, { x: top.x, y: top.y - size });
  }

  /** Wecker-Schild über eingeplanten Objekten. */
  private drawBadge(text: string, at: Pt) {
    const label = new Text({
      text,
      style: {
        fontSize: 10,
        fontWeight: "700",
        fill: INK,
        fontFamily: "ui-rounded, system-ui, sans-serif",
      },
    });
    label.anchor.set(0.5);
    const plate = new Graphics()
      .roundRect(-label.width / 2 - 5, -8, label.width + 10, 16, 8)
      .fill({ color: 0xffffff })
      .stroke({ width: 1.5, color: INK });
    const tag = new Container();
    tag.addChild(plate, label);
    tag.position.set(at.x, at.y);
    tag.label = "badge";
    this.labelLayer.addChild(tag);
  }

  /** Schmutz-Effekte ab 150 % (Spez. 12.4). */
  private addDirt(
    fx: ObjectFx,
    type: string,
    b: { x0: number; y0: number; x1: number; y1: number },
  ) {
    for (let i = 0; i < 3; i++) {
      const fly = new Graphics().circle(0, 0, 1.6).fill({ color: INK });
      fly.zIndex = 1;
      this.fxLayer.addChild(fly);
      fx.flies.push(fly);
    }
    const extra = new Graphics();
    if (type.startsWith("trash_")) {
      // Geruchslinien
      for (const dx of [-6, 0, 6]) {
        extra.moveTo(fx.top.x + dx, fx.top.y - 6);
        for (let k = 1; k <= 4; k++)
          extra.lineTo(fx.top.x + dx + (k % 2 ? 3 : -3), fx.top.y - 6 - k * 5);
      }
      extra.stroke({ width: 1.5, color: 0x7a8f3a, alpha: 0.8 });
    } else if (["toilet", "shower", "bathtub", "washbasin"].includes(type)) {
      // Wasserflecken
      const p = project(b.x1 + 0.15, (b.y0 + b.y1) / 2);
      extra.ellipse(p.x, p.y, 10, 4).fill({ color: 0x6fa8c7, alpha: 0.45 });
      extra
        .ellipse(p.x + 8, p.y + 5, 5, 2)
        .fill({ color: 0x6fa8c7, alpha: 0.35 });
    } else {
      // Staubwölkchen
      for (const [dx, dy, r] of [
        [-10, 4, 5],
        [8, 6, 4],
        [0, 9, 3],
      ])
        extra
          .circle(fx.base.x + dx, fx.base.y + dy, r)
          .fill({ color: 0x9a8f80, alpha: 0.35 });
    }
    this.fxLayer.addChild(extra);
    fx.extra = extra;
  }

  private drawLabel(r: PlanRoom) {
    if (r.tiles.length === 0) return;
    if (!r.foreign && r.parentRoomId) return;
    const p = this.labelPoint(r);
    const text = r.foreign ? `🔒 ${r.ownerName ?? r.name}` : r.name;
    const label = new Text({
      text,
      style: {
        fontSize: 11,
        fontWeight: "700",
        fill: INK,
        fontFamily: "ui-rounded, system-ui, sans-serif",
      },
    });
    label.anchor.set(0.5);
    label.alpha = r.foreign ? 0.85 : 0.6;
    if (r.foreign) {
      // Namensschild am privaten Zimmer (Spez. 12.5)
      const plate = new Graphics()
        .roundRect(-label.width / 2 - 6, -9, label.width + 12, 18, 6)
        .fill({ color: 0xfbf8f1 })
        .stroke({ width: 1.5, color: INK });
      const tag = new Container();
      tag.addChild(plate, label);
      label.alpha = 1;
      tag.position.set(p.x, p.y);
      this.labelLayer.addChild(tag);
    } else {
      label.position.set(p.x, p.y);
      this.floorLayer.addChild(label);
    }
  }

  // ---------------------------------------------------------------------
  // Avatare
  // ---------------------------------------------------------------------

  private gridFor(userId: string): WalkGrid {
    const placed = this.data.plan.objects.filter((o) => o.placed);
    return buildWalkGrid({
      rooms: this.data.plan.rooms,
      blocked: placed.flatMap((o) => footprintTiles(o)),
      // Avatare betreten keine fremden privaten Zimmer (Spez. 12.5).
      allowRoom: (r) => !r.privateOwnerId || r.privateOwnerId === userId,
    });
  }

  private syncAvatars() {
    const wanted = new Set(this.data.avatars.map((a) => a.userId));
    for (const [id, a] of this.avatars) {
      if (!wanted.has(id)) {
        a.root.destroy({ children: true });
        this.avatars.delete(id);
      }
    }
    let seed = 7;
    for (const info of this.data.avatars) {
      seed += 13;
      const grid = this.gridFor(info.userId);
      const existing = this.avatars.get(info.userId);
      if (existing) {
        this.applyAway(existing, Boolean(info.away));
        existing.grid = grid;
        existing.state = this.revalidate(existing, grid);
        this.entityLayer.addChild(existing.root);
        continue;
      }
      if (grid.tiles.length === 0) continue;
      const rng = seededRng(hash(info.userId) + seed);
      const start = this.startTile(info.userId, grid, rng);
      const sprite = this.makeAvatar(info, initialAvatar(start), rng, grid);
      this.applyAway(sprite, Boolean(info.away));
      this.avatars.set(info.userId, sprite);
      this.entityLayer.addChild(sprite.root);
    }
    this.container.dataset.avatars = String(this.avatars.size);
  }

  /**
   * Nach einem Neuaufbau (z. B. nach dem Erledigen) läuft der Avatar weiter,
   * solange sein Weg begehbar bleibt. Sonst wird neu geplant, ein laufender
   * Putzauftrag bleibt dabei erhalten.
   */
  private revalidate(a: AvatarSprite, grid: WalkGrid): AvatarState {
    const s = a.state;
    const here = currentTile(s);
    if (!grid.walkable.has(tileKey(here[0], here[1]))) {
      return grid.tiles.length
        ? initialAvatar(grid.tiles[Math.floor(a.rng() * grid.tiles.length)])
        : s;
    }
    const pathOk = s.path.every(([x, y]) => grid.walkable.has(tileKey(x, y)));
    if (pathOk) return s;
    const cleanTarget = s.next?.mode === "clean" ? s.next.objectId : null;
    const target = cleanTarget
      ? this.interactables.find((i) => i.id === cleanTarget)
      : undefined;
    if (target) return sendToClean({ ...s, path: [] }, grid, target);
    return { ...s, path: [], mode: "idle", timer: 0.3, next: null };
  }

  private applyAway(a: AvatarSprite, away: boolean) {
    a.away = away;
    a.root.alpha = away ? 0.5 : 1;
    a.root.label = `avatar:${a.userId}${away ? ":away" : ""}`;
    if (!away && a.bubbleText.text === "🧳") {
      a.bubbleText.text = "";
      a.bubble.visible = false;
    }
  }

  /** Eigene Leute starten gern im eigenen Zimmer, sonst irgendwo. */
  private startTile(userId: string, grid: WalkGrid, rng: Rng): Tile {
    const own = this.data.plan.rooms.find(
      (r) => r.privateOwnerId === userId && !r.parentRoomId,
    );
    const ownTiles = own
      ? grid.tiles.filter(([x, y]) => grid.roomOf.get(tileKey(x, y)) === own.id)
      : [];
    const pool = ownTiles.length && rng() < 0.5 ? ownTiles : grid.tiles;
    return pool[Math.floor(rng() * pool.length)];
  }

  private makeAvatar(
    info: IsoAvatar,
    state: AvatarState,
    rng: Rng,
    grid: WalkGrid,
  ): AvatarSprite {
    const root = new Container();
    const body = new Container();
    const px = 2;
    const g = new Graphics();
    const a = info.avatar;
    const skin = hexToNumber(SKIN_TONES[a.skin]);
    const hair = hexToNumber(HAIR_COLORS[a.hairColor]);
    const shirt = hexToNumber(SHIRT_COLORS[a.shirt]);
    const r = (x: number, y: number, w: number, h: number, color: number) =>
      g.rect((x - 8) * px, (y - 20) * px, w * px, h * px).fill({ color });
    // Schatten
    const shadow = new Graphics()
      .ellipse(0, 0, 11, 4)
      .fill({ color: INK, alpha: 0.2 });
    root.addChild(shadow);
    r(4, 12, 8, 5, shirt);
    r(3, 13, 1, 3, skin);
    r(12, 13, 1, 3, skin);
    r(5, 17, 2, 3, 0x4a4038);
    r(9, 17, 2, 3, 0x4a4038);
    r(3, 3, 10, 9, skin);
    r(5, 7, 2, 2, INK);
    r(9, 7, 2, 2, INK);
    r(7, 10, 2, 1, 0xc0665a);
    switch (a.hair) {
      case "short":
        r(3, 2, 10, 3, hair);
        r(3, 5, 1, 2, hair);
        r(12, 5, 1, 2, hair);
        break;
      case "long":
        r(3, 2, 10, 3, hair);
        r(2, 4, 2, 9, hair);
        r(12, 4, 2, 9, hair);
        break;
      case "bun":
        r(6, 0, 4, 2, hair);
        r(3, 2, 10, 3, hair);
        break;
      case "curly":
        r(2, 1, 12, 4, hair);
        r(2, 5, 2, 3, hair);
        r(12, 5, 2, 3, hair);
        break;
    }
    if (a.accessory === "glasses") {
      r(4, 6, 8, 1, INK);
    } else if (a.accessory === "cap") {
      r(3, 1, 10, 3, 0xd9534f);
      r(11, 3, 4, 1, 0xd9534f);
    } else if (a.accessory === "headphones") {
      r(3, 1, 10, 1, INK);
      r(1, 5, 2, 4, INK);
      r(13, 5, 2, 4, INK);
    }
    g.stroke({ width: 0 });
    body.addChild(g);
    root.addChild(body);

    const bubble = new Container();
    const bg = new Graphics()
      .roundRect(-14, -14, 28, 24, 10)
      .fill({ color: 0xffffff })
      .stroke({ width: 1.5, color: INK });
    bg.poly([-3, 10, 3, 10, 0, 15]).fill({ color: 0xffffff });
    const bubbleText = new Text({ text: "", style: { fontSize: 15 } });
    bubbleText.anchor.set(0.5);
    bubbleText.position.set(0, -2);
    bubble.addChild(bg, bubbleText);
    bubble.position.set(10, -px * 20 - 16);
    bubble.visible = false;
    root.addChild(bubble);
    root.label = `avatar:${info.userId}`;
    return {
      userId: info.userId,
      root,
      body,
      bubble,
      bubbleText,
      state,
      rng,
      grid,
      phase: rng() * 10,
      away: false,
    };
  }

  /** Eigener Avatar läuft zum Objekt und putzt, danach glitzert es (Spez. 12.8). */
  celebrate(objectId: string, label: string) {
    const fx = this.objectFx.find((f) => f.objectId === objectId);
    const me = this.avatars.get(this.data.viewerId);
    const target = this.interactables.find((i) => i.id === objectId);
    if (me && target && !me.away) {
      me.state = sendToClean(me.state, me.grid, target);
      this.pendingLabels.set(objectId, label);
    } else if (fx) {
      this.sparkle(fx, label);
    }
  }

  private pendingLabels = new Map<string, string>();

  private sparkle(fx: ObjectFx, label: string) {
    for (let i = 0; i < 12; i++) {
      const star = new Graphics()
        .star(0, 0, 4, 4, 1.6)
        .fill({ color: i % 2 ? 0xfad632 : 0xffffff })
        .stroke({ width: 1, color: INK, alpha: 0.4 });
      star.position.set(fx.top.x, fx.top.y);
      this.particleLayer.addChild(star);
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        g: star,
        vx: Math.cos(ang) * 60,
        vy: Math.sin(ang) * 40 - 30,
        life: 0,
        max: 0.9,
      });
    }
    if (label) {
      const t = new Text({
        text: label,
        style: {
          fontSize: 18,
          fontWeight: "800",
          fill: 0x2f2a24,
          fontFamily: "ui-monospace, monospace",
          stroke: { color: 0xfad632, width: 4 },
        },
      });
      t.anchor.set(0.5);
      t.position.set(fx.top.x, fx.top.y - 10);
      this.particleLayer.addChild(t);
      this.particles.push({ g: t, vx: 0, vy: -24, life: 0, max: 2.2 });
    }
    // Frisch geputzt: Aura sofort grün
    if (fx.aura) {
      fx.pulsing = false;
      fx.aura.tint = 0xffffff;
    }
    this.container.dataset.lastCelebration = fx.objectId;
  }

  // ---------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------

  private tick(dt: number) {
    if (this.destroyed) return;
    this.time += dt;
    // Überfällig: langsames Pulsieren, 2 s Zyklus (Spez. 12.8)
    const pulse =
      0.35 + 0.3 * (0.5 + 0.5 * Math.sin((this.time * Math.PI * 2) / 2));
    for (const fx of this.objectFx) {
      if (fx.aura && fx.pulsing) fx.aura.alpha = pulse;
      fx.flies.forEach((fly, i) => {
        const a = this.time * (2.4 + i * 0.7) + i * 2.1;
        fly.position.set(
          fx.top.x + Math.cos(a) * (10 + i * 3),
          fx.top.y - 14 + Math.sin(a * 1.7) * 6,
        );
      });
      if (fx.extra) fx.extra.alpha = 0.6 + 0.4 * Math.sin(this.time * 3);
    }

    const foreignOwners = new Set(
      this.data.plan.rooms
        .filter((r) => r.foreign && r.privateOwnerId)
        .map((r) => r.id),
    );
    for (const a of this.avatars.values()) {
      if (a.away) {
        // Im Urlaub: steht still mit Koffer.
        const [rx, ry] = rotatePoint(a.state.x, a.state.y, this.rotation);
        const p = project(rx, ry);
        a.root.position.set(p.x, p.y);
        a.root.zIndex = rx + ry - 0.5;
        a.body.y = 0;
        a.body.rotation = 0;
        a.bubble.visible = true;
        if (a.bubbleText.text !== "🧳") a.bubbleText.text = "🧳";
        continue;
      }
      const r = stepAvatar(a.state, dt, a.grid, this.interactables, a.rng);
      a.state = r.state;
      if (r.event?.kind === "cleaned") {
        const fx = this.objectFx.find((f) => f.objectId === r.event!.objectId);
        if (fx) this.sparkle(fx, this.pendingLabels.get(fx.objectId) ?? "");
        this.pendingLabels.delete(r.event.objectId);
      }
      if (a.state.mode === "idle" && a.state.timer <= 0 && !a.state.emoji) {
        a.state = chooseIdleGoal(a.state, a.grid, this.interactables, a.rng);
      }
      // Alles sauber: zwischendurch wird getanzt (Spez. 12.8)
      if (
        this.allClean &&
        a.state.mode === "walk" &&
        a.state.path.length > 3 &&
        a.rng() < 0.004
      ) {
        a.state = {
          ...a.state,
          mode: "activity",
          path: [],
          next: null,
          timer: 3,
          emoji: ["💃", "🕺", "🎉"][Math.floor(a.rng() * 3)],
        };
      }
      const s = a.state;
      const [rx, ry] = rotatePoint(s.x, s.y, this.rotation);
      const p = project(rx, ry);
      a.root.position.set(p.x, p.y);
      a.root.zIndex = rx + ry - 0.5;
      const walking = s.mode === "walk";
      const cleaning = s.mode === "clean";
      a.phase += dt;
      a.body.y = walking ? -Math.abs(Math.sin(a.phase * 10)) * 3 : 0;
      const dancing =
        s.mode === "activity" &&
        (s.emoji === "💃" || s.emoji === "🕺" || s.emoji === "🎉");
      a.body.rotation = cleaning
        ? Math.sin(a.phase * 18) * 0.12
        : dancing
          ? Math.sin(a.phase * 8) * 0.25
          : 0;
      if (dancing) a.body.y = -Math.abs(Math.sin(a.phase * 8)) * 5;
      // Blickrichtung im Bild
      const [fx1] = rotatePoint(s.x + s.facing, s.y, this.rotation);
      const dir = project(fx1, ry).x - p.x;
      a.body.scale.x = dir < 0 ? -1 : 1;
      a.bubble.visible = Boolean(s.emoji);
      if (s.emoji && a.bubbleText.text !== s.emoji) a.bubbleText.text = s.emoji;
      // Im fremden privaten Zimmer unsichtbar (Spez. 4.2)
      const room = a.grid.roomOf.get(tileKey(Math.floor(s.x), Math.floor(s.y)));
      a.root.visible = !(room && foreignOwners.has(room));
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.vy += 40 * dt;
      p.g.alpha = Math.max(0, 1 - p.life / p.max);
      if (p.life >= p.max) {
        p.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Kamera: Einpassen, Verschieben, Pinch-Zoom, Doppeltipp
  // ---------------------------------------------------------------------

  private fit() {
    if (this.fitted || this.destroyed) return;
    const tiles = this.data.plan.rooms.flatMap((r) => r.tiles);
    if (tiles.length === 0) return;
    const pts = tiles.flatMap(([x, y]) => {
      const [rx, ry] = this.rot(x, y);
      return [...this.cellCorners(rx, ry), project(rx, ry, WALL_H)];
    });
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y)) - 30;
    const maxY = Math.max(...pts.map((p) => p.y));
    const { width, height } = this.app.screen;
    if (width === 0 || height === 0) return;
    const pad = 16;
    const scale = Math.min(
      (width - pad * 2) / (maxX - minX),
      (height - pad * 2) / (maxY - minY),
      2.2,
    );
    this.world.scale.set(scale);
    this.world.position.set(
      width / 2 - ((minX + maxX) / 2) * scale,
      height / 2 - ((minY + maxY) / 2) * scale,
    );
    this.fitted = true;
  }

  private zoomAt(screen: Pt, factor: number) {
    const s = Math.min(4, Math.max(0.3, this.world.scale.x * factor));
    const f = s / this.world.scale.x;
    this.world.position.set(
      screen.x - (screen.x - this.world.x) * f,
      screen.y - (screen.y - this.world.y) * f,
    );
    this.world.scale.set(s);
  }

  private select(objectId: string) {
    if (this.dragged > 6) return;
    this.cb.onSelect(objectId);
  }

  private setupInput() {
    const { stage } = this.app;
    stage.eventMode = "static";
    stage.hitArea = this.app.screen;
    let last: Pt | null = null;
    let pinchDist = 0;

    stage.on("pointerdown", (e: FederatedPointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      this.dragged = 0;
      last = { x: e.global.x, y: e.global.y };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    stage.on("pointermove", (e: FederatedPointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0)
          this.zoomAt(
            { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            d / pinchDist,
          );
        pinchDist = d;
        this.dragged = 100;
        return;
      }
      if (last) {
        const dx = e.global.x - last.x;
        const dy = e.global.y - last.y;
        this.dragged += Math.abs(dx) + Math.abs(dy);
        this.world.position.set(this.world.x + dx, this.world.y + dy);
        last = { x: e.global.x, y: e.global.y };
      }
    });
    const up = (e: FederatedPointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinchDist = 0;
      if (this.pointers.size === 0) last = null;
    };
    stage.on("pointerup", up);
    stage.on("pointerupoutside", up);
    stage.on("pointertap", (e: FederatedPointerEvent) => {
      if (this.dragged > 6 || e.target !== stage) return;
      // Doppeltipp zoomt hinein (Spez. 12.2)
      const now = performance.now();
      if (now - this.lastTap < 300)
        this.zoomAt({ x: e.global.x, y: e.global.y }, 1.6);
      this.lastTap = now;
    });
    this.app.canvas.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        const rect = this.app.canvas.getBoundingClientRect();
        this.zoomAt(
          { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
          ev.deltaY < 0 ? 1.12 : 1 / 1.12,
        );
      },
      { passive: false },
    );
  }

  /** Bildschirmpunkt → Rasterkachel (für Tests und Debugging). */
  screenToTile(sx: number, sy: number): [number, number] {
    const lx = (sx - this.world.x) / this.world.scale.x;
    const ly = (sy - this.world.y) / this.world.scale.y;
    return unproject(lx, ly);
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
