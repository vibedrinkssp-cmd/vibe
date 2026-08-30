import { supabase } from "@/integrations/supabase/client-safe";

export interface SerperImageResult {
  imageUrl: string;
  title: string;
  source: string;
}

export async function searchProductImages(
  productName: string
): Promise<SerperImageResult[]> {
  try {
    const { data, error } = await supabase.functions.invoke('search-images', {
      body: { query: productName },
    });

    // Edge function may return a non-2xx with an error payload — surface the real message
    const payloadError = (data as any)?.error;
    if (error || payloadError) {
      const msg = payloadError || (error as any)?.message || 'Falha ao pesquisar imagens';
      console.error('[searchProductImages] Error:', msg);
      throw new Error(msg);
    }

    return (data.images || []).map((img: any) => ({
      imageUrl: img.imageUrl || img.thumbnailUrl,
      title: img.title,
      source: img.source,
    }));
  } catch (error) {
    console.error('[searchProductImages] Error:', error);
    throw error;
  }
}

/**
 * NEW: Single-shot server-side download + upload to storage.
 * Replaces the brittle fetchImageAsFile -> compressImage -> uploadImage chain
 * for images coming from Serper search results.
 *
 * The edge function validates the admin session, downloads via wsrv.nl proxy
 * (which resizes to maxSize and converts to JPEG, bypassing 403/timeout/huge files),
 * uploads to storage, and returns the publicUrl.
 */
export async function uploadSerperImage(opts: {
  imageUrl: string;
  folder?: 'products' | 'banners' | 'drink-types' | 'special-drinks';
  sessionToken: string;
  maxSize?: number;
}): Promise<{ path: string; publicUrl: string; size: number }> {
  const { data, error } = await supabase.functions.invoke('serper-upload-image', {
    body: {
      imageUrl: opts.imageUrl,
      folder: opts.folder ?? 'products',
      sessionToken: opts.sessionToken,
      maxSize: opts.maxSize ?? 512,
    },
  });

  const payloadError = (data as any)?.error;
  if (error || payloadError) {
    const msg = payloadError || (error as any)?.message || 'Falha ao salvar imagem';
    console.error('[uploadSerperImage] Error:', msg);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  if (!data?.publicUrl || !data?.path) {
    throw new Error('Resposta inválida do servidor de imagens');
  }

  return { path: data.path, publicUrl: data.publicUrl, size: data.size ?? 0 };
}

/**
 * @deprecated Prefer uploadSerperImage() — does download+compress+upload in a single edge call.
 * Kept for backward compatibility with non-admin flows.
 */
export async function fetchImageAsFile(imageUrl: string, filename: string): Promise<File> {
  const { data, error } = await supabase.functions.invoke('download-image', {
    body: { imageUrl },
  });
  if (error) throw new Error('Failed to download image');
  if (data?.base64) {
    const binaryString = atob(data.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const contentType = data.contentType || 'image/jpeg';
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    return new File([bytes], filename.replace(/\.[^/.]+$/, '') + '.' + ext, { type: contentType });
  }
  throw new Error('Unexpected response from download-image');
}

