import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, CheckCircle, Loader2, AlertTriangle, Hand, Upload, Loader } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { compressImage, formatBytes } from '@/lib/image-compression';
import { useCameraCapture } from '@/hooks/use-camera-capture';

interface PaymentOCRModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  motoboyId: string;
  expectedValue: number;
  orderShortId: string;
}

export function PaymentOCRModal({
  open,
  onOpenChange,
  orderId,
  motoboyId,
  expectedValue,
  orderShortId,
}: PaymentOCRModalProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { videoRef, status, error: cameraError, start: startCamera, stop: stopCamera, isActive: cameraActive } =
    useCameraCapture({
      onUnsupportedFallback: () => {
        // Auto-open native picker as a graceful fallback
        setTimeout(() => fileInputRef.current?.click(), 100);
      },
    });

  useEffect(() => {
    if (open) {
      setCapturedImage(null);
    } else {
      stopCamera();
    }
  }, [open, stopCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);
    stopCamera();
  }, [stopCamera, videoRef]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCapturedImage(reader.result as string);
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  }, []);

  const handleConfirm = async (manual: boolean = false) => {
    setIsSubmitting(true);
    try {
      let imageUrl: string | null = null;

      if (capturedImage) {
        const blob = await (await fetch(capturedImage)).blob();
        const rawFile = new File([blob], `proof_${orderId}.jpg`, { type: 'image/jpeg' });
        // Comprovante só precisa ser legível — comprime MUITO para ocupar pouquíssimo espaço.
        const compressed = await compressImage(rawFile, 720, 0.5, 45 * 1024);
        console.log(`[PaymentProof] ${formatBytes(compressed.originalSize)} → ${formatBytes(compressed.compressedSize)}`);

        const fileName = `motoboy/${orderId}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('payment-proofs')
          .upload(fileName, compressed.file, {
            contentType: compressed.file.type || 'image/jpeg',
            cacheControl: '31536000',
            upsert: false,
          });

        if (!uploadError) {
          // Bucket é privado — guardamos o caminho e geramos URL assinada na exibição.
          imageUrl = fileName;
        } else {
          console.error('[PaymentProof] Upload error:', uploadError);
        }
      }

      const { error } = await supabase.rpc('confirm_motoboy_payment', {
        p_order_id: orderId,
        p_motoboy_id: motoboyId,
        p_detected_value: expectedValue,
        p_ocr_status: manual ? 'manual' : 'photo',
        p_confidence_score: manual ? 0 : 100,
        p_ocr_text: manual ? 'Confirmação manual sem foto' : 'Comprovante fotográfico',
        p_image_url: imageUrl ?? undefined,
        p_confirmed_manually: manual,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: '✅ Pagamento confirmado!', description: `Pedido #${orderShortId}` });
      onOpenChange(false);
    } catch (err) {
      console.error('Confirm error:', err);
      toast({ title: 'Erro ao confirmar pagamento', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Confirmar Pagamento — #{orderShortId}
          </DialogTitle>
        </DialogHeader>

        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            Valor esperado: <strong className="text-foreground">R$ {expectedValue.toFixed(2)}</strong>
          </p>

          {/* Video element is ALWAYS mounted but hidden when not active.
              This fixes the bug where srcObject was set before the element existed. */}
          <div className={cameraActive ? 'relative' : 'hidden'}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] object-cover bg-black rounded-lg"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-dashed border-white/60 rounded-lg w-[70%] h-[50%] flex items-end justify-center pb-2">
                <span className="text-white/80 text-xs bg-black/50 px-2 py-1 rounded">
                  Aponte para a tela da maquininha
                </span>
              </div>
            </div>
            <div className="mt-3">
              <Button onClick={capturePhoto} className="w-full py-4 text-base font-semibold rounded-xl" size="lg">
                <Camera className="h-5 w-5 mr-2" />
                Tirar Foto
              </Button>
            </div>
          </div>

          {!capturedImage && !cameraActive && (
            <div className="space-y-2">
              {cameraError && (
                <div className="p-4 text-center rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="h-8 w-8 mx-auto text-amber-400 mb-2" />
                  <p className="text-sm text-foreground mb-1 font-medium">Câmera indisponível</p>
                  <p className="text-xs text-muted-foreground">{cameraError}</p>
                </div>
              )}
              <Button
                onClick={startCamera}
                className="w-full py-4 rounded-xl"
                size="lg"
                disabled={status === 'starting'}
              >
                {status === 'starting' ? (
                  <Loader className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 mr-2" />
                )}
                {status === 'starting' ? 'Abrindo câmera…' : 'Abrir Câmera'}
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-xl"
              >
                <Upload className="h-4 w-4 mr-2" />
                Tirar com Câmera do Celular / Galeria
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() => handleConfirm(true)}
                disabled={isSubmitting}
              >
                <Hand className="h-4 w-4 mr-2" />
                Confirmar Manualmente (sem foto)
              </Button>
            </div>
          )}

          {capturedImage && (
            <>
              <div className="rounded-xl overflow-hidden border border-border">
                <img src={capturedImage} alt="Comprovante" className="w-full max-h-48 object-contain bg-black" />
              </div>
              <div className="space-y-2">
                <Button
                  onClick={() => handleConfirm(false)}
                  className="w-full py-4 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5 mr-2" />
                  )}
                  ✔️ Confirmar Pagamento
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCapturedImage(null)}
                  disabled={isSubmitting}
                  className="w-full rounded-xl"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Tirar Outra Foto
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
