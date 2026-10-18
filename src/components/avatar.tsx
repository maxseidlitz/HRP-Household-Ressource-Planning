import {
  HAIR_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  type AvatarConfig,
} from "@/catalog/avatar";

const INK = "#2f2a24";

/** Kleine Pixel-Figur (chibi, 16×20 Raster), Spez. 12.5. */
export function Avatar({
  config,
  size = 40,
  title,
  className = "",
}: {
  config: AvatarConfig;
  size?: number;
  title?: string;
  className?: string;
}) {
  const skin = SKIN_TONES[config.skin];
  const hair = HAIR_COLORS[config.hairColor];
  const shirt = SHIRT_COLORS[config.shirt];
  return (
    <svg
      viewBox="0 0 16 20"
      width={size}
      height={(size * 20) / 16}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? "Avatar"}
      className={className}
    >
      {/* Körper */}
      <rect x="4" y="12" width="8" height="5" fill={shirt} />
      <rect x="3" y="13" width="1" height="3" fill={skin} />
      <rect x="12" y="13" width="1" height="3" fill={skin} />
      <rect x="5" y="17" width="2" height="2" fill="#4a4038" />
      <rect x="9" y="17" width="2" height="2" fill="#4a4038" />
      {/* Kopf */}
      <rect x="3" y="3" width="10" height="9" fill={skin} />
      <rect x="5" y="7" width="2" height="2" fill={INK} />
      <rect x="9" y="7" width="2" height="2" fill={INK} />
      <rect x="7" y="10" width="2" height="1" fill="#c0665a" />
      <Hair style={config.hair} color={hair} />
      <Accessory kind={config.accessory} />
    </svg>
  );
}

function Hair({
  style,
  color,
}: {
  style: AvatarConfig["hair"];
  color: string;
}) {
  switch (style) {
    case "bald":
      return null;
    case "short":
      return (
        <>
          <rect x="3" y="2" width="10" height="3" fill={color} />
          <rect x="3" y="5" width="1" height="2" fill={color} />
          <rect x="12" y="5" width="1" height="2" fill={color} />
        </>
      );
    case "long":
      return (
        <>
          <rect x="3" y="2" width="10" height="3" fill={color} />
          <rect x="2" y="4" width="2" height="9" fill={color} />
          <rect x="12" y="4" width="2" height="9" fill={color} />
        </>
      );
    case "bun":
      return (
        <>
          <rect x="6" y="0" width="4" height="2" fill={color} />
          <rect x="3" y="2" width="10" height="3" fill={color} />
        </>
      );
    case "curly":
      return (
        <>
          <rect x="2" y="1" width="12" height="4" fill={color} />
          <rect x="2" y="5" width="2" height="3" fill={color} />
          <rect x="12" y="5" width="2" height="3" fill={color} />
          <rect x="4" y="0" width="2" height="1" fill={color} />
          <rect x="10" y="0" width="2" height="1" fill={color} />
        </>
      );
  }
}

function Accessory({ kind }: { kind: AvatarConfig["accessory"] }) {
  switch (kind) {
    case "glasses":
      return (
        <>
          <rect x="4" y="6" width="4" height="1" fill={INK} />
          <rect x="8" y="6" width="4" height="1" fill={INK} />
          <rect x="4" y="6" width="1" height="3" fill={INK} />
          <rect x="11" y="6" width="1" height="3" fill={INK} />
        </>
      );
    case "cap":
      return (
        <>
          <rect x="3" y="1" width="10" height="3" fill="#d9534f" />
          <rect x="11" y="3" width="4" height="1" fill="#d9534f" />
        </>
      );
    case "headphones":
      return (
        <>
          <rect x="3" y="1" width="10" height="1" fill={INK} />
          <rect x="1" y="5" width="2" height="4" fill={INK} />
          <rect x="13" y="5" width="2" height="4" fill={INK} />
        </>
      );
    default:
      return null;
  }
}
