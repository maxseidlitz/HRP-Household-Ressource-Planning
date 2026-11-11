import type { MetadataRoute } from "next";

// Installierbar als PWA, sobald die App über HTTPS läuft (Phase 5).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "WG-App",
    short_name: "WG-App",
    description: "Haushaltsaufgaben für eure WG",
    start_url: "/wohnung",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef1f7",
    theme_color: "#eef1f7",
    lang: "de",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
