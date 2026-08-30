import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Upload, CheckCircle, Loader2, RotateCcw, AlertTriangle, Loader } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { compressImage, formatBytes } from '@/lib/image-compression';
import { useCameraCapture } from '@/hooks/use-camera-capture';

interface PixPosProofModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  totalValue: number;
  onConfirmed: () => void;
}

export function PixPosProofModal({
  open,
  onOpenChange,
  orderId,
  totalValue,
  onConfirmed,
}: PixPosProofModalProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { videoRef, status, error: cameraError, start: startCamera, stop: stopCamera, isActive: cameraActive } =
    useCameraCapture({
      onUnsupportedFallback: () => {
        setTimeout(() => fileInputRef.current?.click(), 100);
      },
    });

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCapturedImage(null);
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
  }, [stopCamera, videoRef]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  }, []);

  const handleUploadAndConfirm = async () => {
    if (!capturedImage) return;
    setIsUploading(true);
    try {
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const file = new File([blob], `pix_pos_${orderId}.jpg`, { type: 'image/jpeg' });

      const compressed = await compressImage(file, 800, 0.75, 300 * 1024);
      console.log(`[PixPosProof] Compressed: ${formatBytes(compressed.originalSize)} → ${formatBytes(compressed.compressedSize)}`);

      const fileName = `pix_pos/${orderId}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, compressed.file, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('payment_confirmations')
        .insert({
          order_id: orderId,
          motoboy_id: '00000000-0000-0000-0000-000000000000',
          ocr_status: 'pix_pos_proof',
          image_url: fileName,
          detected_value: totalValue,
          confidence_score: 100,
          confirmed_manually: true,
          ocr_text: 'Comprovante PIX POS registrado pelo PDV',
        });

      if (insertError) {
        console.error('[PixPosProof] Insert error:', insertError);
      }

      await supabase
        .from('orders')
        .update({
          payment_confirmed: true,
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: 'pdv_pix_pos',
        })
        .eq('id', orderId);

      toast({ title: '✅ Comprovante PIX POS registrado!' });
      onConfirmed();
      onOpenChange(false);
    } catch (err) {
      console.error('[PixPosProof] Error:', err);
      toast({
        title: 'Erro ao enviar comprovante',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkip = async () => {
    const confirmed = window.confirm(
      '⚠️ ATENÇÃO\n\nVocê está confirmando o pagamento PIX POS SEM enviar o comprovante.\n\nIsso impede a auditoria posterior. Use apenas se a maquininha estiver inacessível.\n\nDeseja continuar mesmo assim?'
    );
    if (!confirmed) return;

    try {
      await supabase
        .from('orders')
        .update({
          payment_confirmed: true,
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: 'pdv_pix_pos_no_proof',
        })
        .eq('id', orderId);
      toast({
        title: '⚠️ Pagamento confirmado SEM comprovante',
        description: 'Lembre-se de auditar manualmente este pedido depois.',
      });
    } catch (err) {
      console.error('[PixPosProof] Skip error:', err);
    }
    onConfirmed();
    onOpenChange(false);
  };

  const orderShortId = orderId?.substring(0, 6) || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Comprovante PIX POS — #{orderShortId}
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
            Valor cobrado: <strong className="text-foreground">R$ {totalValue.toFixed(2)}</strong>
          </p>

          {/* Video always mounted (hidden when inactive) so ref exists when stream arrives */}
          <div className={cameraActive ? 'relative' : 'hidden'}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] object-cover bg-black rounded-lg"
            />
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
            </div>
          )}

          {capturedImage && (
            <>
              <div className="rounded-xl overflow-hidden border border-border">
                <img src={capturedImage} alt="Comprovante" className="w-full max-h-48 object-contain bg-black" />
              </div>
              <div className="space-y-2">
                <Button
                  onClick={handleUploadAndConfirm}
                  className="w-full py-4 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5 mr-2" />
                  )}
                  Enviar Comprovante
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCapturedImage(null)}
                  disabled={isUploading}
                  className="w-full rounded-xl"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Tirar Outra Foto
                </Button>
              </div>
            </>
          )}

          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={handleSkip}
            disabled={isUploading}
          >
            Pular — registrar sem comprovante
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
