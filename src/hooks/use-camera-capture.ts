import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'active' | 'error';

export interface UseCameraCaptureOptions {
  /** Auto-fallback to file input (capture=environment) when getUserMedia fails. */
  onUnsupportedFallback?: () => void;
}

const EMPTY_OPTIONS: UseCameraCaptureOptions = {};

/**
 * Robust camera hook: handles missing HTTPS, denied permissions, busy device,
 * iOS Safari quirks (must call play() explicitly), and constraint fallbacks
 * (environment → user → no constraints).
 *
 * Returns refs to attach to <video> (always mounted) and helpers to start/stop.
 */
export function useCameraCapture(options: UseCameraCaptureOptions = EMPTY_OPTIONS) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);

  const attachStream = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    const v = videoRef.current;
    if (v) {
      try {
        v.srcObject = stream;
        v.muted = true;
        v.setAttribute('playsinline', 'true');
        // iOS Safari requires explicit play() after srcObject is set.
        await v.play().catch(() => {});
      } catch (e) {
        console.warn('[camera] attach play() failed:', e);
      }
    } else {
      // Video not yet mounted — queue and let effect attach when ref appears.
      pendingStreamRef.current = stream;
    }
  }, []);

  // Watch for video element mounting after stream was acquired
  useEffect(() => {
    if (status === 'active' && pendingStreamRef.current && videoRef.current) {
      const s = pendingStreamRef.current;
      pendingStreamRef.current = null;
      attachStream(s);
    }
  }, [status, attachStream]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch {}
    }
    pendingStreamRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);

    // Pre-flight: secure context and API availability
    const isSecure =
      typeof window !== 'undefined' &&
      (window.isSecureContext || window.location.hostname === 'localhost');
    if (!isSecure) {
      setStatus('error');
      setError('A câmera requer conexão segura (HTTPS). Use a galeria como alternativa.');
      options.onUnsupportedFallback?.();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('Câmera não suportada neste navegador. Use a galeria.');
      options.onUnsupportedFallback?.();
      return;
    }

    setStatus('starting');

    // Try increasingly relaxed constraints
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: 'user' } },
      { video: { facingMode: 'environment' } },
      { video: true },
    ];

    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setStatus('active');
        await attachStream(stream);
        return;
      } catch (e) {
        lastErr = e;
        const name = (e as DOMException)?.name;
        // Don't retry if user denied — they'll deny again
        if (name === 'NotAllowedError' || name === 'SecurityError') break;
      }
    }

    const name = (lastErr as DOMException)?.name;
    let msg = 'Não foi possível acessar a câmera.';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      msg = 'Permissão da câmera negada. Toque no cadeado da barra de endereço e libere o acesso à câmera.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      msg = 'Nenhuma câmera disponível neste dispositivo.';
    } else if (name === 'NotReadableError') {
      msg = 'A câmera está sendo usada por outro app. Feche outros apps e tente de novo.';
    }
    setStatus('error');
    setError(msg);
    options.onUnsupportedFallback?.();
  }, [attachStream, options]);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { videoRef, status, error, start, stop, isActive: status === 'active' };
}
