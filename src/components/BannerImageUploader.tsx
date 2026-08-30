import { useState, useCallback, useEffect, useRef } from "react";
import { Camera, Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage, getStorageUrl } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { compressBannerImage, formatBytes } from "@/lib/image-compression";

interface BannerImageUploaderProps {
  currentImageUrl?: string | null;
  onImageUploaded: (imagePath: string) => void;
  onImageRemoved?: () => void;
  disabled?: boolean;
}

// compressBanner is now imported from image-compression.ts

export function BannerImageUploader({
  currentImageUrl,
  onImageUploaded,
  onImageRemoved,
  disabled = false,
}: BannerImageUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (currentImageUrl) {
      const displayUrl = getStorageUrl(currentImageUrl);
      setPreviewUrl(displayUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [currentImageUrl]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Erro",
        description: "Por favor, selecione uma imagem válida.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Erro",
        description: "A imagem deve ter no máximo 20MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const compressed = await compressBannerImage(file);
      
      const { publicUrl } = await uploadImage(compressed.file, 'banners');
      
      setPreviewUrl(publicUrl);
      onImageUploaded(publicUrl);
      
      toast({
        title: "Sucesso",
        description: `Banner otimizado e enviado! (${formatBytes(compressed.compressedSize)})`,
      });
    } catch (error) {
      console.error('[BannerImageUploader] Error:', error);
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Falha ao enviar imagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  }, [onImageUploaded, toast]);

  const handleRemoveImage = useCallback(() => {
    setPreviewUrl(null);
    onImageRemoved?.();
  }, [onImageRemoved]);

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Horizontal aspect ratio container (4:1) */}
      <div className="relative w-full aspect-[4/1] max-w-[600px] mx-auto bg-muted rounded-lg overflow-hidden border border-border">
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Banner preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://placehold.co/1200x300?text=Erro+no+Banner';
              }}
            />
            {!disabled && (
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2"
                onClick={handleRemoveImage}
                type="button"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="h-12 w-12 mb-2" />
            <span className="text-sm">Proporção 4:1 (horizontal)</span>
          </div>
        )}
        
        {isUploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-center">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          type="button"
        >
          <Upload className="h-4 w-4 mr-2" />
          Enviar Imagem
        </Button>

        <Button
          variant="outline"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled || isUploading}
          type="button"
        >
          <Camera className="h-4 w-4 mr-2" />
          Câmera
        </Button>
      </div>
    </div>
  );
}
