/** iOS launch screens: [cssWidth, cssHeight, pixelRatio] for portrait devices. */
export const SPLASH_DEVICES: ReadonlyArray<readonly [number, number, number]> = [
  [440, 956, 3], // iPhone 16 Pro Max
  [402, 874, 3], // iPhone 16 Pro
  [430, 932, 3], // iPhone 15/16 Plus, 14/15 Pro Max
  [393, 852, 3], // iPhone 14 Pro, 15, 15 Pro, 16
  [390, 844, 3], // iPhone 12, 13, 14
  [375, 812, 3], // iPhone X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // iPhone XS Max, 11 Pro Max
  [414, 896, 2], // iPhone XR, 11
  [414, 736, 3], // iPhone 8 Plus
  [375, 667, 2], // iPhone SE, 8
  [1032, 1376, 2], // iPad Pro 13" (M4)
  [1024, 1366, 2], // iPad Pro 12.9"
  [834, 1210, 2], // iPad Pro 11" (M4)
  [834, 1194, 2], // iPad Pro 11"
  [820, 1180, 2], // iPad Air 10.9"
  [810, 1080, 2], // iPad 10.2"
  [744, 1133, 2], // iPad mini
];

export function splashFile(w: number, h: number, r: number, theme: "light" | "dark") {
  return `/splash/${w * r}x${h * r}-${theme}.png`;
}

export function appleSplashScreens() {
  return SPLASH_DEVICES.flatMap(([w, h, r]) =>
    (["light", "dark"] as const).map((theme) => ({
      url: splashFile(w, h, r, theme),
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${theme})`,
    })),
  );
}
