import { useState, type ImgHTMLAttributes, type CSSProperties } from 'react';
import { imgUrl, imgSrcSet } from '@/lib/image-url';

interface SmartImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'loading'> {
  /** Storage path or full public URL */
  path: string | null | undefined;
  /** Widths for srcset (mobile-first) */
  widths: number[];
  /** `sizes` attr — required for srcset to pick the right variant */
  sizes: string;
  /** Mark as LCP candidate */
  priority?: boolean;
  /** Resize mode (default contain) */
  resize?: 'contain' | 'cover' | 'fill';
  /** Quality (default 72) */
  quality?: number;
  /** Fallback URL when the image fails to load */
  fallbackSrc?: string;
}

export function SmartImage({
  path,
  widths,
  sizes,
  priority = false,
  resize = 'contain',
  quality,
  fallbackSrc,
  alt,
  className,
  style,
  onError,
  onLoad,
  ...rest
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!path) return null;

  const smallest = widths[0];
  const src = imgUrl(path, { w: smallest, q: quality, resize });
  const srcSet = imgSrcSet(path, widths, { q: quality, resize });

  const composedStyle: CSSProperties = {
    opacity: loaded ? 1 : 0,
    transition: 'opacity 200ms ease-out',
    ...style,
  };

  return (
    <img
      {...rest}
      src={errored && fallbackSrc ? fallbackSrc : src}
      srcSet={errored && fallbackSrc ? undefined : srcSet}
      sizes={sizes}
      alt={alt ?? ''}
      decoding="async"
      loading={priority ? 'eager' : 'lazy'}
      // @ts-expect-error - fetchpriority is valid HTML5 but not in React types yet
      fetchpriority={priority ? 'high' : 'auto'}
      className={className}
      style={composedStyle}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setErrored(true);
        setLoaded(true);
        onError?.(e);
      }}
    />
  );
}
