import type { MetadataRoute } from "next";

// Manifest ist ab Tag 1 vorhanden. Installation als PWA und Service Worker
// werden erst mit HTTPS aktiv (Phase 5).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WG-App",
    short_name: "WG-App",
    description: "Haushaltsaufgaben für eure WG",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1f7",
    theme_color: "#eef1f7",
    lang: "de",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
