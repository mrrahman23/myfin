import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "myFin — Personal Finance",
    short_name: "myFin",
    description: "Track income, bills and cash flow. Mark items paid with one tap.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Monthly budget", url: "/budget", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add expense", url: "/transactions?new=expense", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
