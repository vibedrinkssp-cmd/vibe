import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameraCapture } from '@/hooks/use-camera-capture';
import {
  loadFaceModels,
  computeDescriptor,
  captureSnapshot,
  dataUrlToBlob,
  findBestFaceMatch,
  normalizeStoredDescriptor,
} from '@/lib/face-recognition';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, LogOut, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface EmployeeRow {
  id: string;
  name: string;
  face_descriptor: unknown;
  reference_photo_url: string | null;
}

const MIN_FACE_SIMILARITY = 0.72;
const MIN_MARGIN = 0.06;
const CONFIRM_FRAMES = 2;

export default function Ponto() {
  const { videoRef, status, error, start } = useCameraCapture();
  const [modelsReady, setModelsReady] = useState(false);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [matched, setMatched] = useState<{ emp: EmployeeRow; score: number } | null>(null);
  const [lastPunch, setLastPunch] = useState<'in' | 'out' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(new Date());
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'unknown'>('idle');
  const scanningRef = useRef(false);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load models
  useEffect(() => {
    void loadFaceModels().then(() => setModelsReady(true)).catch((e) => {
      console.error('models', e);
      toast.error('Falha ao carregar reconhecimento facial');
    });
    void start();
  }, [start]);

  // Load employees with descriptors
  const loadEmployees = useCallback(async () => {
    const { data, error: err } = await (supabase.from('employees') as any)
      .select('id, name, face_descriptor, reference_photo_url, is_active')
      .eq('is_active', true);
    if (err) {
      console.error(err);
      return;
    }
    const rows = (Array.isArray(data) ? data : [])
      .filter((r: any) => normalizeStoredDescriptor(r.face_descriptor))
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        face_descriptor: r.face_descriptor,
        reference_photo_url: r.reference_photo_url,
      })) as EmployeeRow[];
    setEmployees(rows);
  }, []);

  useEffect(() => { void loadEmployees(); }, [loadEmployees]);

  // Fetch last punch for matched employee to suggest next type
  useEffect(() => {
    if (!matched) { setLastPunch(null); return; }
    (async () => {
      const { data } = await supabase
        .from('employee_time_clocks' as any)
        .select('punch_type')
        .eq('employee_id', matched.emp.id)
        .order('punched_at', { ascending: false })
        .limit(1);
      const last = (data as any)?.[0]?.punch_type as 'in' | 'out' | undefined;
      setLastPunch(last ?? null);
    })();
  }, [matched]);

  const pendingRef = useRef<{ id: string; hits: number; sum: number } | null>(null);

  // Detection loop
  useEffect(() => {
    if (!modelsReady || status !== 'active' || matched || employees.length === 0) return;
    let stopped = false;

    const tick = async () => {
      if (stopped || matched || scanningRef.current || !videoRef.current) return;
      scanningRef.current = true;
      try {
        const desc = await computeDescriptor(videoRef.current);
        if (!desc) {
          pendingRef.current = null;
          setScanState('idle');
          return;
        }
        setScanState('scanning');
        const best = findBestFaceMatch(desc, employees, (emp) => emp.face_descriptor, MIN_FACE_SIMILARITY, MIN_MARGIN);
        if (!best) {
          pendingRef.current = null;
          setScanState('unknown');
          return;
        }
        const p = pendingRef.current;
        if (p && p.id === best.item.id) {
          p.hits += 1;
          p.sum += best.similarity;
          if (p.hits >= CONFIRM_FRAMES) {
            setMatched({ emp: best.item, score: p.sum / p.hits });
            pendingRef.current = null;
            setScanState('idle');
          }
        } else {
          pendingRef.current = { id: best.item.id, hits: 1, sum: best.similarity };
        }
      } catch (e) {
        console.warn('detect', e);
      } finally {
        scanningRef.current = false;
      }
    };

    const iv = setInterval(tick, 700);
    return () => { stopped = true; clearInterval(iv); pendingRef.current = null; };
  }, [modelsReady, status, matched, employees, videoRef]);

  const punch = async (type: 'in' | 'out') => {
    if (!matched || !videoRef.current) return;
    setSubmitting(true);
    try {
      const dataUrl = captureSnapshot(videoRef.current, 400, 0.7);
      const blob = await dataUrlToBlob(dataUrl);
      const path = `punches/${matched.emp.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('employee-faces')
        .upload(path, blob, { contentType: 'image/jpeg' });
      let photoUrl: string | null = null;
      if (!upErr) {
        photoUrl = supabase.storage.from('employee-faces').getPublicUrl(path).data.publicUrl;
      }
      const { error: insErr } = await (supabase.from('employee_time_clocks') as any).insert({
        employee_id: matched.emp.id,
        punch_type: type,
        photo_url: photoUrl,
        match_score: matched.score,
        device_info: navigator.userAgent.slice(0, 200),
      });
      if (insErr) throw insErr;
      toast.success(`${type === 'in' ? 'ENTRADA' : 'SAÍDA'} registrada — ${matched.emp.name}`);
      setTimeout(() => { setMatched(null); setLastPunch(null); }, 3500);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Falha ao registrar ponto');
    } finally {
      setSubmitting(false);
    }
  };

  const timeStr = useMemo(() => now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), [now]);
  const dateStr = useMemo(() => now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }), [now]);

  const nextSuggested: 'in' | 'out' = lastPunch === 'in' ? 'out' : 'in';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex flex-col">
      <header className="p-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <span className="font-semibold">Ponto Eletrônico</span>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold tabular-nums">{timeStr}</div>
          <div className="text-xs text-white/60 capitalize">{dateStr}</div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4 max-w-md mx-auto w-full">
        <div className={`relative w-full aspect-square rounded-2xl overflow-hidden border-4 transition-colors ${
          matched ? 'border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)]' :
          scanState === 'unknown' ? 'border-amber-500' :
          scanState === 'scanning' ? 'border-blue-500 animate-pulse' :
          'border-white/20'
        }`}>
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
          {(!modelsReady || status === 'starting') && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Iniciando…
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 text-center text-sm">
              {error}
            </div>
          )}
          {matched && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-emerald-900/90 to-transparent p-3 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-1" />
              <div className="text-lg font-bold">{matched.emp.name}</div>
              <div className="text-xs opacity-80">Confiança {(matched.score * 100).toFixed(0)}%</div>
            </div>
          )}
          {scanState === 'unknown' && !matched && (
            <div className="absolute bottom-0 inset-x-0 bg-amber-900/80 p-2 text-center text-xs flex items-center justify-center gap-1">
              <AlertCircle className="h-4 w-4" /> Rosto não reconhecido
            </div>
          )}
        </div>

        {matched ? (
          <div className="w-full grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className={`h-20 text-lg ${nextSuggested === 'in' ? 'bg-emerald-600 hover:bg-emerald-500 ring-4 ring-emerald-400/40' : 'bg-emerald-800 hover:bg-emerald-700'}`}
              onClick={() => punch('in')}
              disabled={submitting}
            >
              <LogIn className="h-6 w-6 mr-2" /> ENTRADA
            </Button>
            <Button
              size="lg"
              className={`h-20 text-lg ${nextSuggested === 'out' ? 'bg-rose-600 hover:bg-rose-500 ring-4 ring-rose-400/40' : 'bg-rose-800 hover:bg-rose-700'}`}
              onClick={() => punch('out')}
              disabled={submitting}
            >
              <LogOut className="h-6 w-6 mr-2" /> SAÍDA
            </Button>
          </div>
        ) : (
          <div className="text-center text-sm text-white/70">
            {employees.length === 0
              ? 'Nenhum funcionário com rosto cadastrado ainda.'
              : 'Posicione o rosto no centro da câmera para bater ponto.'}
          </div>
        )}

        {matched && (
          <Button variant="ghost" size="sm" className="text-white/70" onClick={() => setMatched(null)}>
            Não sou eu — reiniciar
          </Button>
        )}
      </main>

      <footer className="p-3 text-center text-[10px] text-white/40">
        VM BRASIL — Reconhecimento facial local (Human)
      </footer>
    </div>
  );
}
