import { supabase } from "@/integrations/supabase/client-safe";
import { getManagerSessionToken } from '@/lib/admin-session';

export const STORAGE_BUCKET = 'images';
const PRIVILEGED_UPLOAD_ROLES = new Set(['admin', 'pdv']);

// Generate unique file name
function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  const hash = Date.now() + '-' + Math.random().toString(36).substring(2, 10);
  return `${hash}.${ext}`;
}

function getStoredString(key: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getPrivilegedUploadSessionToken(): string | null {
  const managerToken = getManagerSessionToken();
  if (managerToken) {
    return managerToken;
  }

  const role = getStoredString('vibe-drinks-role');
  const sessionToken = getStoredString('vibe-drinks-session-token');

  // Primary: auth context session token
  if (role && sessionToken && PRIVILEGED_UPLOAD_ROLES.has(role)) {
    return sessionToken;
  }

  return null;
}

async function fileToBase64(file: File): Promise<string> {
  // Use FileReader to avoid stack overflow on iOS Safari.
  // The spread operator (...slice) in String.fromCharCode can still crash
  // on iPhones even with 32KB chunks due to call-stack limits.
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:...;base64," prefix
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

async function uploadImageWithPrivilegedSession(
  file: File,
  folder: string,
  fileName: string,
  sessionToken: string,
): Promise<{ path: string; publicUrl: string }> {
  const fileBase64 = await fileToBase64(file);

  const { data, error } = await supabase.functions.invoke('admin-upload-image', {
    body: {
      fileBase64,
      fileName,
      fileType: file.type || 'image/webp',
      folder,
      sessionToken,
    },
  });

  if (error) {
    const status = (error as any)?.context?.status ?? (error as any)?.status;
    if (status === 401) {
      throw new Error('Sua sessão expirou. Faça login novamente como admin para enviar imagens.');
    }
    throw new Error(error.message || 'Falha ao enviar imagem pelo backend');
  }

  if (!data?.path || !data?.publicUrl) {
    throw new Error('Resposta inválida ao enviar imagem');
  }

  return {
    path: data.path,
    publicUrl: data.publicUrl,
  };
}

// Get public URL from storage path
export function getStorageUrl(path: string): string {
  if (!path) return '';
  
  // Already a complete URL - return as is
  if (path.startsWith('http')) return path;
  
  // Build URL using Supabase SDK
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);
  
  return data.publicUrl;
}

// Ensure image URL is complete
export function ensureImageUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl) return '';
  return getStorageUrl(imageUrl);
}

// Upload image directly to Supabase Storage
// Uses aggressive caching (1 year) to minimize egress
export async function uploadImage(
  file: File,
  folder: string = 'products'
): Promise<{ path: string; publicUrl: string }> {
  const fileName = generateFileName(file.name);
  const privilegedSessionToken = getPrivilegedUploadSessionToken();

  // Route 1: Privileged upload via Edge Function (admin/pdv sessions)
  if (privilegedSessionToken) {
    return await uploadWithRetry(() =>
      uploadImageWithPrivilegedSession(file, folder, fileName, privilegedSessionToken),
    );
  }

  // No privileged session available — cannot upload
  console.error('[uploadImage] No privileged session token found. Role:', getStoredString('vibe-drinks-role'));
  throw new Error('Sessão administrativa não encontrada. Faça login novamente como admin ou PDV.');
}

// Retry wrapper for upload – handles gru1 / transient failures
const MAX_UPLOAD_RETRIES = 2;

async function uploadWithRetry(
  fn: () => Promise<{ path: string; publicUrl: string }>,
): Promise<{ path: string; publicUrl: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[uploadImage] Attempt ${attempt + 1}/${MAX_UPLOAD_RETRIES + 1} failed: ${msg}`);
      if (attempt < MAX_UPLOAD_RETRIES) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

// Delete image from storage
export async function deleteImage(path: string): Promise<void> {
  if (!path) return;
  
  // If it's a full URL, extract the path
  let cleanPath = path;
  if (path.startsWith('http')) {
    const match = path.match(/\/storage\/v1\/object\/public\/images\/(.+)$/);
    if (match) {
      cleanPath = match[1];
    } else {
      // Cannot extract path from URL
      return;
    }
  }
  
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([cleanPath]);
  
  if (error) {
    console.error('Erro ao deletar imagem:', error);
  }
}
