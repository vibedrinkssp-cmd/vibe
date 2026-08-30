import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, Loader2, ScanLine, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { playSuccessBeep } from '@/lib/scanner-sound';

// Scanner modal for registering barcodes in admin - camera + USB + manual all active at once
interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export function BarcodeScanner({ isOpen, onClose, onScan, title = "Escanear Código de Barras" }: BarcodeScannerProps) {
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasScannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.log('Scanner already stopped');
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleBarcodeDetected = useCallback((barcode: string) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;
    setLastScanned(barcode);
    playSuccessBeep(); // Play beep on successful scan
    onScan(barcode);
    // Auto close after successful scan
    setTimeout(() => {
      stopScanner();
      onClose();
    }, 500);
  }, [onScan, onClose, stopScanner]);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsScanning(true);
    
    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      const html5QrCode = new Html5Qrcode("barcode-register-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });
      
      scannerRef.current = html5QrCode;

      // Get camera with optimal settings for barcode scanning
      const devices = await Html5Qrcode.getCameras();
      const backCamera = devices.find(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('rear') ||
        d.label.toLowerCase().includes('traseira')
      ) || devices[0];

      const cameraConfig = backCamera ? { deviceId: backCamera.id } : { facingMode: "environment" };

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 30,
          qrbox: undefined, // Full frame scanning - no restricted box
          disableFlip: false,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            advanced: [
              { focusMode: "continuous" } as any,
              { exposureMode: "continuous" } as any,
            ]
          }
        },
        (decodedText) => {
          handleBarcodeDetected(decodedText);
        },
        () => {}
      );

      // Apply additional camera optimizations after start
      try {
        const videoElement = document.querySelector('#barcode-register-reader video') as HTMLVideoElement;
        if (videoElement?.srcObject) {
          const stream = videoElement.srcObject as MediaStream;
          const track = stream.getVideoTracks()[0];
          const capabilities = track.getCapabilities?.() as any;
          
          const constraints: any = {};
          
          // Enable continuous autofocus
          if (capabilities?.focusMode?.includes('continuous')) {
            constraints.focusMode = 'continuous';
          }
          // Enable continuous exposure
          if (capabilities?.exposureMode?.includes('continuous')) {
            constraints.exposureMode = 'continuous';
          }
          // Increase sharpness if available (no torch/flash)
          if (capabilities?.sharpness) {
            constraints.sharpness = capabilities.sharpness.max;
          }
          
          if (Object.keys(constraints).length > 0) {
            await track.applyConstraints({ advanced: [constraints] } as any);
          }
        }
      } catch (e) {
        console.log('Could not apply advanced camera settings:', e);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setError('Câmera não disponível');
      setIsScanning(false);
    }
  }, [handleBarcodeDetected]);

  // Start camera when dialog opens
  useEffect(() => {
    if (isOpen) {
      hasScannedRef.current = false;
      setLastScanned(null);
      setManualCode('');
      startCamera();
      // Focus input for USB scanner
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      stopScanner();
    }
    
    return () => {
      stopScanner();
    };
  }, [isOpen, startCamera, stopScanner]);

  // Handle USB scanner / manual input
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && manualCode.trim()) {
      handleBarcodeDetected(manualCode.trim());
    }
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {lastScanned ? (
            <div className="flex items-center justify-center gap-2 py-8 text-green-500">
              <Check className="h-8 w-8" />
              <span className="text-lg font-mono">{lastScanned}</span>
            </div>
          ) : (
            <>
              {/* Camera always active */}
              <div 
                id="barcode-register-reader" 
                className="w-full aspect-video bg-black rounded-lg overflow-hidden relative"
              >
                {isScanning && !error && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                  </div>
                )}
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
                    {error}
                  </div>
                )}
              </div>

              {/* USB / Manual input always active */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  Aponte a câmera (salva automático) ou digite/escaneie USB
                </p>
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder="Código de barras..."
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    className="text-center text-lg font-mono flex-1"
                  />
                  <Button 
                    onClick={() => manualCode.trim() && handleBarcodeDetected(manualCode.trim())}
                    disabled={!manualCode.trim()}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            </>
          )}

          <Button variant="outline" className="w-full" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Continuous scanner for PDV - camera + USB always active, adds products to cart
interface ContinuousScannerProps {
  onScan: (barcode: string) => void;
  isActive: boolean;
  onClose: () => void;
}

export function ContinuousScanner({ onScan, isActive, onClose }: ContinuousScannerProps) {
  const [usbInput, setUsbInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanTime = useRef<number>(0);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.log('Scanner stopped');
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const handleBarcodeDetected = useCallback((barcode: string) => {
    // Debounce to avoid double scans
    const now = Date.now();
    if (now - lastScanTime.current < 800) return;
    lastScanTime.current = now;
    
    console.log('[ContinuousScanner] Código detectado:', barcode);
    setLastScanned(barcode);
    playSuccessBeep(); // Play beep on successful scan
    onScan(barcode);
    
    // Clear feedback after short delay
    setTimeout(() => setLastScanned(null), 1500);
  }, [onScan]);

  const startCamera = useCallback(async () => {
    setError(null);
    setIsScanning(true);

    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      const html5QrCode = new Html5Qrcode("pdv-continuous-reader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });
      
      scannerRef.current = html5QrCode;

      // Get camera with optimal settings
      const devices = await Html5Qrcode.getCameras();
      const backCamera = devices.find(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('rear') ||
        d.label.toLowerCase().includes('traseira')
      ) || devices[0];

      const cameraConfig = backCamera ? { deviceId: backCamera.id } : { facingMode: "environment" };

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 30,
          qrbox: undefined, // Full frame scanning - no restricted box
          disableFlip: false,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            advanced: [
              { focusMode: "continuous" } as any,
              { exposureMode: "continuous" } as any,
            ]
          }
        },
        (decodedText) => {
          handleBarcodeDetected(decodedText);
        },
        () => {}
      );

      // Apply additional camera optimizations
      try {
        const videoElement = document.querySelector('#pdv-continuous-reader video') as HTMLVideoElement;
        if (videoElement?.srcObject) {
          const stream = videoElement.srcObject as MediaStream;
          const track = stream.getVideoTracks()[0];
          const capabilities = track.getCapabilities?.() as any;
          
          const constraints: any = {};
          
          if (capabilities?.focusMode?.includes('continuous')) {
            constraints.focusMode = 'continuous';
          }
          if (capabilities?.exposureMode?.includes('continuous')) {
            constraints.exposureMode = 'continuous';
          }
          if (capabilities?.sharpness) {
            constraints.sharpness = capabilities.sharpness.max;
          }
          
          if (Object.keys(constraints).length > 0) {
            await track.applyConstraints({ advanced: [constraints] } as any);
          }
        }
      } catch (e) {
        console.log('Could not apply advanced camera settings:', e);
      }

      setCameraActive(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      setError('Câmera não disponível');
      setIsScanning(false);
      setCameraActive(false);
    }
  }, [handleBarcodeDetected]);

  // Handle USB scanner input
  const handleUsbKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && usbInput.trim()) {
      handleBarcodeDetected(usbInput.trim());
      setUsbInput('');
    }
  }, [usbInput, handleBarcodeDetected]);

  // Auto-start camera when scanner becomes active
  useEffect(() => {
    if (isActive && !cameraActive && !scannerRef.current) {
      console.log('[ContinuousScanner] Auto-iniciando câmera...');
      startCamera();
    }
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive, cameraActive, startCamera]);

  // Cleanup on close
  useEffect(() => {
    if (!isActive) {
      stopScanner();
      setCameraActive(false);
    }
    
    return () => {
      stopScanner();
    };
  }, [isActive, stopScanner]);

  const toggleCamera = () => {
    if (cameraActive) {
      stopScanner();
      setCameraActive(false);
    } else {
      startCamera();
    }
  };

  if (!isActive) return null;

  return (
    <div className="border-2 border-primary/50 rounded-lg p-3 bg-card space-y-3 animate-in slide-in-from-top-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary animate-pulse" />
          <span className="font-medium text-sm">Detecção Contínua</span>
          {lastScanned && (
            <span className="text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded font-mono">
              {lastScanned}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={cameraActive ? 'default' : 'outline'}
            size="sm"
            onClick={toggleCamera}
            className="gap-1"
          >
            <Camera className="h-4 w-4" />
            {cameraActive ? 'Câmera ON' : 'Câmera'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* USB Input - always visible */}
      <Input
        ref={inputRef}
        placeholder="Aguardando scanner USB... (ou digite e Enter)"
        value={usbInput}
        onChange={(e) => setUsbInput(e.target.value)}
        onKeyDown={handleUsbKeyDown}
        className="font-mono text-center bg-secondary"
        autoFocus
      />

      {/* Camera - when active */}
      {cameraActive && (
        <div>
          <div 
            id="pdv-continuous-reader" 
            className="w-full h-28 bg-black rounded overflow-hidden"
          >
            {isScanning && !error && (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white/50" />
              </div>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive mt-1 text-center">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Simple camera scanner for PDV - just camera, continuous detection
interface PDVCameraScannerProps {
  onScan: (barcode: string) => void;
  isActive: boolean;
  onClose: () => void;
}

export function PDVCameraScanner({ onScan, isActive, onClose }: PDVCameraScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTime = useRef<number>(0);
  const isMountedRef = useRef(true);
  const startInFlightRef = useRef(false);
  const stopInFlightRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (stopInFlightRef.current) return;
    stopInFlightRef.current = true;

    const scanner = scannerRef.current;
    scannerRef.current = null;

    try {
      if (scanner) {
        // IMPORTANT: html5-qrcode manipula DOM interno; se o container sumir no meio, pode dar removeChild.
        // Por isso mantemos o componente montado (PDV) e evitamos clear().
        await scanner.stop();
      }
    } catch (err) {
      console.log('[PDVCameraScanner] stopScanner error:', err);
    } finally {
      stopInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsScanning(false);
        setCameraReady(false);
      }
    }
  }, []);

  const handleBarcodeDetected = useCallback(
    (barcode: string) => {
      const now = Date.now();
      // Debounce de 1.8s para evitar scans muito rápidos em sequência
      if (now - lastScanTime.current < 1800) return;
      lastScanTime.current = now;

      const clean = barcode.trim();
      if (!clean) return;

      console.log('[PDVCameraScanner] Código detectado:', clean);
      if (isMountedRef.current) setLastScanned(clean);

      playSuccessBeep();
      onScan(clean);

      setTimeout(() => {
        if (isMountedRef.current) setLastScanned(null);
      }, 1500);
    },
    [onScan]
  );

  const startCamera = useCallback(async () => {
    if (!isActive) return;
    if (scannerRef.current) return;
    if (startInFlightRef.current) return;

    startInFlightRef.current = true;
    setError(null);
    setIsScanning(true);

    // Aguarda o DOM (o container fica sempre montado no PDV)
    await new Promise((r) => setTimeout(r, 250));

    try {
      const readerElement = document.getElementById('pdv-camera-reader');
      if (!readerElement) throw new Error('Elemento da câmera não encontrado');

      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) throw new Error('Nenhuma câmera encontrada');

      // Detectar se é mobile ou desktop
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      // Em mobile, preferir câmera traseira. Em desktop (notebook), usar qualquer câmera disponível
      let selectedCamera = devices[0];
      if (isMobile) {
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('traseira') ||
            d.label.toLowerCase().includes('environment')
        );
        if (backCamera) selectedCamera = backCamera;
      }

      const html5QrCode = new Html5Qrcode('pdv-camera-reader', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        // BarcodeDetector API - não suportado no Safari/iOS, mas ok falhar silenciosamente
        useBarCodeDetectorIfSupported: !isIOS,
        verbose: false,
      });

      scannerRef.current = html5QrCode;

      // Configuração de vídeo mais compatível - iOS não suporta "advanced" constraints
      const videoConstraints: MediaTrackConstraints = isMobile
        ? {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            // Desktop/notebook - sem facingMode para usar webcam frontal
            width: { ideal: 1280 },
            height: { ideal: 720 },
          };

      // Adicionar advanced apenas se não for iOS (Safari não suporta)
      if (!isIOS && isMobile) {
        (videoConstraints as any).advanced = [
          { focusMode: 'continuous' },
          { exposureMode: 'continuous' },
        ];
      }

      await html5QrCode.start(
        { deviceId: selectedCamera.id },
        {
          fps: isIOS ? 15 : 30, // iOS precisa de fps menor para melhor performance
          qrbox: undefined, // full frame (easier for 1D barcodes)
          disableFlip: false,
          videoConstraints,
        },
        (decodedText) => handleBarcodeDetected(decodedText),
        () => {}
      );

      if (isMountedRef.current) {
        setIsScanning(false);
        setCameraReady(true);
      }
    } catch (err: any) {
      console.error('[PDVCameraScanner] startCamera error:', err);
      await stopScanner();
      if (isMountedRef.current) {
        setError(err?.message || 'Erro ao acessar câmera');
      }
    } finally {
      startInFlightRef.current = false;
      if (isMountedRef.current) setIsScanning(false);
    }
  }, [handleBarcodeDetected, isActive, stopScanner]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // best-effort cleanup on unmount
      void stopScanner();
    };
  }, [stopScanner]);

  // Start/stop based on isActive (component stays mounted)
  useEffect(() => {
    if (isActive) {
      void startCamera();
    } else {
      void stopScanner();
      if (isMountedRef.current) {
        setError(null);
        setLastScanned(null);
      }
    }
  }, [isActive, startCamera, stopScanner]);

  return (
    <div
      className={
        isActive
          ? 'border-2 border-blue-500/50 rounded-lg p-2 bg-card space-y-2 animate-in slide-in-from-top-2'
          : 'max-h-0 overflow-hidden opacity-0 pointer-events-none'
      }
      aria-hidden={!isActive}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-xs">Scanner Câmera</span>
          {cameraReady && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Ativo</span>
          )}
          {lastScanned && (
            <span className="text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded font-mono animate-pulse">
              ✓ {lastScanned}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onClose();
          }}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative w-full h-36 sm:h-44 bg-black rounded overflow-hidden">
        {/* Container do scanner - sem filhos React para evitar conflito de DOM */}
        <div id="pdv-camera-reader" className="absolute inset-0" />

        {/* Mira central - overlay visual para posicionar código de barras */}
        {cameraReady && !isScanning && (
          <div className="absolute inset-0 pointer-events-none z-5 flex items-center justify-center">
            {/* Linha horizontal da mira */}
            <div className="absolute w-3/4 h-0.5 bg-red-500/70 shadow-lg shadow-red-500/50" />
            {/* Bordas de canto para área de scan */}
            <div className="absolute w-3/4 h-16 border-2 border-primary/50 rounded">
              {/* Cantos destacados */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500 rounded-tl" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-500 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-red-500 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-red-500 rounded-br" />
            </div>
          </div>
        )}

        {isScanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin text-white mx-auto mb-1" />
              <span className="text-white text-xs">Iniciando câmera...</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive text-center">{error}</p>}

      {!error && !isScanning && (
        <p className="text-xs text-muted-foreground text-center">Aponte para o código de barras</p>
      )}
    </div>
  );
}
