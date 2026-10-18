import QRCode from "qrcode";

/** QR-Code als Inline-SVG, serverseitig erzeugt. */
export async function QrCode({
  value,
  size = 220,
}: {
  value: string;
  size?: number;
}) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2f2a24", light: "#ffffff" },
  });
  return (
    <div
      role="img"
      aria-label="QR-Code"
      className="overflow-hidden rounded-xl glass-edge bg-white"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
