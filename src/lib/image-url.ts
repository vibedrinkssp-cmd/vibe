// Helper to build Supabase Storage URLs with on-the-fly image transformation.
// The Supabase render endpoint negotiates WebP/AVIF via the Accept header and
// keeps cache-control: max-age=31536000, so every distinct ?width=… variant is
// safe to long-cache in the browser and Service Worker.
//
// Usage:
//   imgUrl(path, { w: 320 })
//   imgSrcSet(path, [160, 240, 320])

import { STORAGE_BUCKET, ensureImageUrl } from './supabase';

const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

export type ImageVariant = {
  w: number;
  q?: number;
  resize?: 'contain' | 'cover' | 'fill';
};

// Convert a stored path (or already-public Supabase URL) into a transformed URL.
// Non-Supabase URLs (Unsplash, iFood, etc.) are returned unchanged.
export function imgUrl(
  pathOrUrl: string | null | undefined,
  variant: ImageVariant,
): string {
  if (!pathOrUrl) return '';

  // Resolve to a full public URL first (handles bucket prefix logic).
  const fullUrl = ensureImageUrl(pathOrUrl);
  if (!fullUrl) return '';

  // Only rewrite Supabase public-object URLs; leave Unsplash/external alone.
  const objectIdx = fullUrl.indexOf(OBJECT_PATH);
  let rendered: string;
  if (objectIdx >= 0) {
    rendered =
      fullUrl.slice(0, objectIdx) +
      RENDER_PATH +
      fullUrl.slice(objectIdx + OBJECT_PATH.length);
  } else if (fullUrl.includes(RENDER_PATH)) {
    rendered = fullUrl.split('?')[0];
  } else {
    // External — best-effort: return as is.
    return fullUrl;
  }

  const params = new URLSearchParams();
  params.set('width', String(variant.w));
  params.set('quality', String(variant.q ?? 72));
  params.set('resize', variant.resize ?? 'contain');
  return `${rendered}?${params.toString()}`;
}

export function imgSrcSet(
  pathOrUrl: string | null | undefined,
  widths: number[],
  opts: Omit<ImageVariant, 'w'> = {},
): string {
  if (!pathOrUrl) return '';
  return widths
    .map((w) => `${imgUrl(pathOrUrl, { ...opts, w })} ${w}w`)
    .join(', ');
}

// Width presets per UI slot (mobile-first).
export const W_THUMB = [64, 96, 128];
export const W_CARD = [160, 240, 320];
export const W_DRAWER = [320, 512, 768];
export const W_BANNER = [640, 960, 1280, 1600];

// Silence unused-import warning if STORAGE_BUCKET tree-shakes away.
void STORAGE_BUCKET;
