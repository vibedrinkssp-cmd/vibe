import { useState, useEffect, useRef, useMemo } from 'react';
import splashBg from '@/assets/splash-bg.png';
import appIcon from '@/assets/app-icon.jpg';

const PHRASES = [
  'Preparando sua experiência...',
  'Drinks personalizáveis',
  'Entrega rápida',
  'Quase pronto...',
];

interface SplashScreenProps {
  duration?: number;
  onComplete: () => void;
}

export function SplashScreen({ duration = 3500, onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phraseFade, setPhraseFade] = useState(true);
  const rafRef = useRef<number>(0);

  // Preload bg image with error/timeout fallback so splash never blocks forever
  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageLoaded(true); // proceed even if image fails
    img.src = splashBg;

    // Safety timeout: if image hasn't loaded in 3s, proceed anyway
    const safety = setTimeout(() => setImageLoaded(true), 3000);
    return () => clearTimeout(safety);
  }, []);

  // Progress bar
  useEffect(() => {
    if (!imageLoaded) return;

    const startTime = performance.now();
    const animDuration = duration - 700;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const linear = Math.min(elapsed / animDuration, 1);
      const eased = 1 - Math.pow(1 - linear, 2.5);
      setProgress(eased * 100);
      if (linear < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    const exitTimer = setTimeout(() => setFadeOut(true), animDuration);
    const completeTimer = setTimeout(onComplete, duration);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [imageLoaded, duration, onComplete]);

  // Rotating phrases
  useEffect(() => {
    if (!imageLoaded) return;
    const interval = Math.floor((duration - 700) / PHRASES.length);

    const timer = setInterval(() => {
      setPhraseFade(false);
      setTimeout(() => {
        setPhraseIndex(prev => {
          const next = prev + 1;
          return next < PHRASES.length ? next : prev;
        });
        setPhraseFade(true);
      }, 300);
    }, interval);

    return () => clearInterval(timer);
  }, [imageLoaded, duration]);

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-all duration-700 ease-in-out ${fadeOut ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}
      style={{ background: '#1a0a3e' }}
    >
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={splashBg}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{
            animation: imageLoaded ? 'splash-slow-zoom 11s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards' : 'none',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(26,10,62,0.6) 100%)',
          }}
        />
      </div>

      {/* Centered content */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center px-6 transition-all duration-700 ${imageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{ transitionDelay: '300ms' }}
      >
        {/* App icon */}
        <div className="relative mb-5">
          <div
            className="absolute -inset-4 rounded-3xl opacity-40 blur-2xl"
            style={{ background: '#7c3aed' }}
          />
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20">
            <img src={appIcon} alt="Vibe Drinks" className="w-full h-full object-cover" />
          </div>
        </div>

        <h1
          className="text-white font-bold text-xl tracking-tight mb-1"
          style={{ textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
        >
          Vibe Drinks
        </h1>
        <div className="mb-8" />

        {/* Progress bar */}
        <div className="w-52 mb-4">
          <div className="h-[3px] bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #7c3aed, #a78bfa, #e9d5ff)',
                transition: 'width 120ms linear',
                boxShadow: '0 0 12px rgba(167,139,250,0.4)',
              }}
            />
          </div>
        </div>

        {/* Rotating phrase */}
        <p
          className="text-white/60 text-xs font-medium transition-opacity duration-300"
          style={{ opacity: phraseFade ? 1 : 0 }}
        >
          {PHRASES[phraseIndex]}
        </p>
      </div>

      <style>{`
        @keyframes splash-slow-zoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
