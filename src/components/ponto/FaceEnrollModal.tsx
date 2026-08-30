import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Check, Loader2, RotateCcw } from 'lucide-react';
import { useCameraCapture } from '@/hooks/use-camera-capture';
import { loadFaceModels, computeDescriptor, captureSnapshot, dataUrlToBlob, createStoredDescriptor } from '@/lib/face-recognition';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  onSaved: () => void;
}

export function FaceEnrollModal({ open, onOpenChange, employeeId, employeeName, onSaved }: Props) {
  const { videoRef, status, error, start, stop } = useCameraCapture();
  const [modelsReady, setModelsReady] = useState(false);
  const [snap, setSnap] = useState<string | null>(null);
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    void loadFaceModels().then(() => setModelsReady(true)).catch((e) => {
      console.error('face models', e);
      toast.error('Falha ao carregar modelos faciais');
    });
    void start();
    return () => { stop(); setSnap(null); setDescriptor(null); };
  }, [open]);

  const capture = async () => {
    if (!videoRef.current || !modelsReady) return;
    setDetecting(true);
    try {
      const desc = await computeDescriptor(videoRef.current);
      if (!desc) {
        toast.error('Nenhum rosto detectado — reposicione-se e tente novamente');
        return;
      }
      const dataUrl = captureSnapshot(videoRef.current, 480, 0.8);
      setSnap(dataUrl);
      setDescriptor(desc);
    } finally {
      setDetecting(false);
    }
  };

  const save = async () => {
    if (!snap || !descriptor) return;
    setSaving(true);
    try {
      const blob = await dataUrlToBlob(snap);
      const path = `refs/${employeeId}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('employee-faces')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('employee-faces').getPublicUrl(path);
      const photoUrl = urlData.publicUrl;
      const { error: updErr } = await (supabase.from('employees') as any)
        .update({ face_descriptor: createStoredDescriptor(descriptor), reference_photo_url: photoUrl })
        .eq('id', employeeId);
      if (updErr) throw updErr;
      toast.success(`Rosto cadastrado para ${employeeName}`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar Rosto</DialogTitle>
          <DialogDescription>{employeeName}</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
          {!snap && (
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
          )}
          {snap && <img src={snap} alt="captura" className="w-full h-full object-cover" />}
          {!modelsReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando modelos…
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white p-4 text-center text-sm">
              {error}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        <div className="flex gap-2">
          {!snap ? (
            <Button onClick={capture} disabled={!modelsReady || status !== 'active' || detecting} className="flex-1">
              {detecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
              Capturar rosto
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setSnap(null); setDescriptor(null); }} className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" /> Refazer
              </Button>
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
