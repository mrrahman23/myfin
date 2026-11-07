"use client";

import { unwrap } from "../data/errors";
import { getSupabase } from "../supabase/client";

const BUCKET = "household-photos";

/** Downscales a photo to a small JPEG (keeps uploads quick on mobile data). */
export async function resizeImage(file: File, max = 640, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    // Safari fallback for formats createImageBitmap rejects
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  const w = "width" in bitmap ? bitmap.width : 0;
  const h = "height" in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")!.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the photo"))), "image/jpeg", quality),
  );
}

/** Uploads a photo for an item and returns its public URL. */
export async function uploadItemPhoto(householdId: string, itemId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo");
  const blob = await resizeImage(file);
  const path = `${householdId}/${itemId}-${Date.now()}.jpg`;
  const storage = getSupabase().storage.from(BUCKET);
  const { error } = await storage.upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(error.message.includes("Bucket not found") ? "Photo storage isn't set up yet — run the latest migration." : error.message);
  return storage.getPublicUrl(path).data.publicUrl;
}

/** Removes a previously uploaded photo (best effort). */
export async function deleteItemPhoto(url: string | null) {
  if (!url) return;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return;
  const path = decodeURIComponent(url.slice(i + marker.length));
  const { error } = await getSupabase().storage.from(BUCKET).remove([path]);
  if (error) console.warn(error.message);
}

export { unwrap };
