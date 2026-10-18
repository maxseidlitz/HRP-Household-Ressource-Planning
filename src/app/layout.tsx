import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WG-App",
  description: "Haushaltsaufgaben für eure WG",
  appleWebApp: { capable: true, title: "WG-App", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#eef1f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
