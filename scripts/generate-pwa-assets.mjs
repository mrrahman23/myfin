// Generates the PWA / iOS icons and launch screens into public/.
// Usage: npm run assets
import { mkdirSync, writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";

const SPLASH = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3],
  [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [1032, 1376, 2], [1024, 1366, 2],
  [834, 1210, 2], [834, 1194, 2], [820, 1180, 2], [810, 1080, 2], [744, 1133, 2],
];

mkdirSync("public/icons", { recursive: true });
mkdirSync("public/splash", { recursive: true });

/** The mark: two stacked wallet cards with rising bars. `s` = edge length. */
function mark(s, { rounded = false, padding = 0 } = {}) {
  const inner = s - padding * 2;
  const u = inner / 100;
  return h(
    "div",
    {
      style: {
        width: s,
        height: s,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #0f172a 0%, #1e3a6b 55%, #2a78d6 100%)",
        borderRadius: rounded ? s * 0.225 : 0,
      },
    },
    h(
      "div",
      { style: { width: inner, height: inner, position: "relative", display: "flex" } },
      // back card
      h("div", {
        style: {
          position: "absolute",
          left: 22 * u,
          top: 20 * u,
          width: 60 * u,
          height: 40 * u,
          borderRadius: 8 * u,
          background: "rgba(255,255,255,0.28)",
          transform: "rotate(-8deg)",
        },
      }),
      // front card
      h(
        "div",
        {
          style: {
            position: "absolute",
            left: 18 * u,
            top: 34 * u,
            width: 64 * u,
            height: 44 * u,
            borderRadius: 9 * u,
            background: "#ffffff",
            display: "flex",
            alignItems: "flex-end",
            padding: `${8 * u}px ${9 * u}px`,
            gap: 4 * u,
            boxShadow: `0 ${3 * u}px ${8 * u}px rgba(0,0,0,0.25)`,
          },
        },
        h("div", { style: { width: 9 * u, height: 10 * u, borderRadius: 2.5 * u, background: "#9ec5f4" } }),
        h("div", { style: { width: 9 * u, height: 17 * u, borderRadius: 2.5 * u, background: "#5598e7" } }),
        h("div", { style: { width: 9 * u, height: 25 * u, borderRadius: 2.5 * u, background: "#2a78d6" } }),
        h("div", {
          style: {
            marginLeft: "auto",
            alignSelf: "flex-start",
            width: 12 * u,
            height: 12 * u,
            borderRadius: 999,
            background: "#eb6834",
          },
        }),
      ),
    ),
  );
}

async function png(element, width, height, file) {
  const res = new ImageResponse(element, { width, height });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log("✓", file);
}

// App icons (full-bleed squares — iOS applies its own mask)
await png(mark(180), 180, 180, "public/apple-touch-icon.png");
await png(mark(192), 192, 192, "public/icons/icon-192.png");
await png(mark(512), 512, 512, "public/icons/icon-512.png");
// Maskable: keep the mark inside the 80% safe zone
await png(mark(512, { padding: 64 }), 512, 512, "public/icons/maskable-512.png");
await png(mark(64, { rounded: true }), 64, 64, "public/icons/favicon-64.png");
await png(mark(32, { rounded: true }), 32, 32, "public/favicon.png");

// iOS launch screens
for (const [w, hgt, r] of SPLASH) {
  for (const theme of ["light", "dark"]) {
    const W = w * r;
    const H = hgt * r;
    const icon = Math.round(Math.min(W, H) * 0.22);
    const el = h(
      "div",
      {
        style: {
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: theme === "dark" ? "#000000" : "#f2f2f7",
          gap: icon * 0.22,
        },
      },
      mark(icon, { rounded: true }),
      h(
        "div",
        {
          style: {
            fontSize: icon * 0.24,
            fontWeight: 600,
            letterSpacing: -1,
            color: theme === "dark" ? "#f5f5f7" : "#0b0b0f",
          },
        },
        "myFin",
      ),
    );
    await png(el, W, H, `public/splash/${W}x${H}-${theme}.png`);
  }
}
