import Human, { type Config, type FaceResult } from '@vladmandic/human';

const MODELS_URL = '/models/human/';
const LEGACY_FACE_API_DESCRIPTOR_LENGTH = 128;
const HUMAN_DESCRIPTOR_MIN_LENGTH = 256;

export interface StoredFaceDescriptor {
  provider: 'human';
  model: 'faceres';
  version: number;
  capturedAt: string;
  embedding: number[];
}

export interface FaceMatch<T> {
  item: T;
  similarity: number;
  distance: number;
}

const baseConfig: Partial<Config> = {
  backend: 'webgl',
  modelBasePath: MODELS_URL,
  cacheModels: true,
  validateModels: false,
  async: true,
  warmup: 'none',
  cacheSensitivity: 0,
  deallocate: true,
  debug: false,
  filter: {
    enabled: true,
    width: 320,
    flip: false,
  },
  face: {
    enabled: true,
    detector: {
      modelPath: 'blazeface.json',
      rotation: true,
      maxDetected: 1,
      minConfidence: 0.6,
      return: false,
    },
    mesh: { enabled: true, modelPath: 'facemesh.json' },
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    description: {
      enabled: true,
      modelPath: 'faceres.json',
      minConfidence: 0.4,
    },
  },
  hand: { enabled: false },
  body: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

let human: Human | null = null;
let loading: Promise<Human> | null = null;

async function createHuman(backend: Config['backend']): Promise<Human> {
  const instance = new Human({ ...baseConfig, backend });
  await instance.load();
  await instance.init();
  return instance;
}

export async function getFaceHuman(): Promise<Human> {
  if (human) return human;
  if (loading) return loading;
  loading = (async () => {
    try {
      human = await createHuman('webgl');
    } catch (webglError) {
      console.warn('[ponto] webgl facial backend failed, falling back to cpu', webglError);
      human = await createHuman('cpu');
    }
    return human;
  })();
  return loading;
}

export async function loadFaceModels(): Promise<void> {
  await getFaceHuman();
}

function isUsableEmbedding(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= HUMAN_DESCRIPTOR_MIN_LENGTH
    && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isLegacyFaceApiEmbedding(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === LEGACY_FACE_API_DESCRIPTOR_LENGTH
    && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

export function normalizeStoredDescriptor(value: unknown): number[] | null {
  if (isUsableEmbedding(value)) return value;
  if (isLegacyFaceApiEmbedding(value)) return null;
  if (
    value
    && typeof value === 'object'
    && (value as Partial<StoredFaceDescriptor>).provider === 'human'
    && isUsableEmbedding((value as Partial<StoredFaceDescriptor>).embedding)
  ) {
    return (value as StoredFaceDescriptor).embedding;
  }
  return null;
}

export function createStoredDescriptor(embedding: number[]): StoredFaceDescriptor {
  return {
    provider: 'human',
    model: 'faceres',
    version: 1,
    capturedAt: new Date().toISOString(),
    embedding,
  };
}

function bestFace(faces: FaceResult[]): FaceResult | null {
  if (!Array.isArray(faces) || faces.length === 0) return null;
  return [...faces].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
}

/** Compute a Human/Faceres embedding from a video/image/canvas element. Returns null if no valid face is found. */
export async function computeDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<number[] | null> {
  const instance = await getFaceHuman();
  const result = await instance.detect(input);
  const face = bestFace(result.face ?? []);
  if (!face?.embedding || !isUsableEmbedding(face.embedding)) return null;
  return face.embedding.map((n) => Number(n.toFixed(6)));
}

export function findBestFaceMatch<T>(
  descriptor: number[],
  items: T[],
  getDescriptor: (item: T) => unknown,
  minSimilarity = 0.72,
  minMargin = 0.06
): FaceMatch<T> | null {
  const source = normalizeStoredDescriptor(descriptor);
  if (!source) return null;

  const instance = human;
  const scored: FaceMatch<T>[] = [];
  for (const item of items) {
    const target = normalizeStoredDescriptor(getDescriptor(item));
    if (!target || target.length !== source.length) continue;
    const similarity = instance?.match?.similarity
      ? instance.match.similarity(source, target)
      : cosineSimilarity(source, target);
    const distance = instance?.match?.distance
      ? instance.match.distance(source, target)
      : 1 - similarity;
    scored.push({ item, similarity, distance });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => b.similarity - a.similarity);
  const best = scored[0];
  if (best.similarity < minSimilarity) return null;
  // Reject ambiguous matches — best must beat runner-up by margin.
  if (scored.length > 1 && best.similarity - scored[1].similarity < minMargin) return null;
  return best;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  return aMag && bMag ? dot / (Math.sqrt(aMag) * Math.sqrt(bMag)) : 0;
}

/** Capture a JPEG data URL from a video element. */
export function captureSnapshot(video: HTMLVideoElement, maxSize = 480, quality = 0.72): string {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const r = await fetch(dataUrl);
  return r.blob();
}
