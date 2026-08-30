import { useState, useEffect, useRef, useCallback } from 'react';
import { QrCode, Copy, Check, Loader2, CheckCircle2, XCircle, RefreshCw, Timer, CreditCard, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMercadoPago } from '@/hooks/use-mercadopago';
import { useNotificationSound } from '@/hooks/use-notification-sound';
import confetti from 'canvas-confetti';

const PIX_TIMEOUT_DELIVERY_MS = 3 * 60 * 1000; // 3 minutes for delivery
const PIX_TIMEOUT_DEFAULT_MS = 5 * 60 * 1000; // 5 minutes for PDV/POS
// After the visual timeout we KEEP polling in the background for this long, so a
// PIX that confirms late (bank/webhook delay) still updates the customer screen
// instead of leaving it stuck showing "não pago".
const BACKGROUND_POLL_GRACE_MS = 10 * 60 * 1000; // 10 extra minutes
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PixQRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  description: string;
  /** For delivery: temp reference before order creation. For PDV: the actual order ID */
  orderId?: string;
  referenceId?: string;
  onPaymentApproved: (mpPaymentId?: string) => void;
  onPaymentCancelled?: () => void;
  onPaymentExpired?: () => void;
  /** If true, uses shorter timeout (3min) and customer-facing messaging */
  isDelivery?: boolean;
  /** PDV usa som único de caixa registradora, não alerta operacional. */
  successSound?: 'default' | 'cash-register';
}

export function PixQRCodeModal({
  open,
  onOpenChange,
  amount,
  description,
  orderId,
  referenceId,
  onPaymentApproved,
  onPaymentCancelled,
  onPaymentExpired,
  isDelivery = false,
  successSound = 'default',
}: PixQRCodeModalProps) {
  const { toast } = useToast();
  const { playMultiple } = useNotificationSound({ volume: 0.8 });
  const [copied, setCopied] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [pixTimedOut, setPixTimedOut] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const approvedHandledRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const backgroundStopRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const effectiveId = referenceId || orderId || '';
  const timeoutMs = isDelivery ? PIX_TIMEOUT_DELIVERY_MS : PIX_TIMEOUT_DEFAULT_MS;
  const hasValidReference = UUID_PATTERN.test(effectiveId);

  const {
    loading,
    error,
    pixData,
    createPixPayment,
    startPolling,
    stopPolling,
    cancelPayment,
    reset,
  } = useMercadoPago();

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (backgroundStopRef.current) { clearTimeout(backgroundStopRef.current); backgroundStopRef.current = null; }
  }, []);

  // Visual timeout reached: mark timed out for the UI, but KEEP polling running in
  // the background so a late PIX confirmation still updates the screen. Only fully
  // stop after an extended grace window.
  const markTimedOut = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setPixTimedOut(true);
    if (!backgroundStopRef.current) {
      backgroundStopRef.current = setTimeout(() => {
        backgroundStopRef.current = null;
        stopPolling();
      }, BACKGROUND_POLL_GRACE_MS);
    }
  }, [stopPolling]);

  // Create PIX payment when modal opens
  useEffect(() => {
    if (open && !initialized && !loading) {
      if (!hasValidReference) {
        setInitialized(true);
        toast({
          title: 'Erro ao gerar PIX',
          description: 'Referência do pedido inválida. Feche e tente novamente.',
          variant: 'destructive',
        });
        return;
      }

      setInitialized(true);
      setPixTimedOut(false);
      setPaymentConfirmed(false);
      setRemainingSeconds(Math.floor(timeoutMs / 1000));
      approvedHandledRef.current = false;
      createPixPayment(amount, description, effectiveId);
    }
  }, [open, initialized, loading, amount, description, effectiveId, createPixPayment, timeoutMs, hasValidReference, toast]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setInitialized(false);
      approvedHandledRef.current = false;
      setPixTimedOut(false);
      setPaymentConfirmed(false);
      clearTimers();
    }
  }, [open, clearTimers]);

  // Start polling + countdown when we have payment data
  useEffect(() => {
    if (pixData?.payment_id && !paymentConfirmed) {
      clearTimers();
      startTimeRef.current = Date.now();

      // Countdown every second
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const remaining = Math.max(0, Math.floor((timeoutMs - elapsed) / 1000));
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          // Visual timeout — keep polling in the background for late confirmations.
          markTimedOut();
        }
      }, 1000);

      // Hard timeout fallback — visual only, background polling continues.
      timeoutRef.current = setTimeout(() => {
        markTimedOut();
      }, timeoutMs);

      startPolling(
        pixData.payment_id,
        () => {
          if (approvedHandledRef.current) return;
          approvedHandledRef.current = true;
          setPaymentConfirmed(true);
          clearTimers();
          playMultiple(successSound === 'cash-register' ? 1 : 3, 500, successSound === 'cash-register' ? 'pdv' : undefined);
          // Fire confetti
          const end = Date.now() + 3000;
          const colors = ['#22c55e', '#10b981', '#34d399', '#fbbf24', '#f59e0b'];
          (function frame() {
            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
            if (Date.now() < end) requestAnimationFrame(frame);
          })();
          toast({ title: '✅ Pagamento confirmado!', description: 'Seu pagamento PIX foi aprovado.' });
          setTimeout(() => {
            onPaymentApproved(String(pixData.payment_id));
            handleClose();
          }, 2000);
        },
        3000,
        effectiveId
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixData, paymentConfirmed]);

  const handleClose = () => {
    stopPolling();
    reset();
    setPaymentConfirmed(false);
    setCopied(false);
    setInitialized(false);
    setPixTimedOut(false);
    approvedHandledRef.current = false;
    clearTimers();
    onOpenChange(false);
  };

  const handleCancel = async () => {
    if (pixData?.payment_id) {
      await cancelPayment(pixData.payment_id);
    }
    handleClose();
    onPaymentCancelled?.();
  };

  const handleExpired = () => {
    if (isDelivery) {
      handleClose();
      onPaymentExpired?.();
    }
  };

  const copyPixCode = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code);
      setCopied(true);
      toast({ title: 'Código PIX copiado!' });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const retryPayment = () => {
    if (!hasValidReference) {
      toast({
        title: 'Erro ao gerar PIX',
        description: 'A referência do pagamento ficou inválida. Reabra a cobrança.',
        variant: 'destructive',
      });
      return;
    }

    reset();
    setInitialized(false);
    setPixTimedOut(false);
    setRemainingSeconds(Math.floor(timeoutMs / 1000));
    clearTimers();
    setTimeout(() => {
      createPixPayment(amount, description, effectiveId);
      setInitialized(true);
    }, 100);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isUrgent = remainingSeconds <= 30;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-5 w-5 text-primary" />
            Pagamento PIX
          </DialogTitle>
          <DialogDescription className="text-xs">
            Escaneie o QR Code ou copie o código para pagar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Amount display */}
          <div className="text-center p-2 bg-primary/10 rounded-lg border border-primary/20">
            <p className="text-xs text-muted-foreground">Valor a pagar</p>
            <p className="text-2xl font-bold text-primary leading-tight">{formatCurrency(amount)}</p>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Gerando QR Code PIX...</p>
            </div>
          )}

          {/* PIX Timed Out */}
          {pixTimedOut && !paymentConfirmed && (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              {isDelivery ? (
                <>
                  <Timer className="h-16 w-16 text-amber-500 mb-2" />
                  <p className="text-xl font-bold text-amber-600 text-center">Ainda confirmando o pagamento…</p>
                  <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                      <p className="font-bold text-amber-800 dark:text-amber-300">Se você já pagou, aguarde</p>
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      A confirmação do PIX pode levar alguns minutos. Continuamos verificando automaticamente — assim que cair, seu pedido é criado sem você precisar fazer nada. Você pode deixar esta tela aberta ou gerar um novo QR Code.
                    </p>
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button onClick={retryPayment} variant="outline" className="flex-1">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Novo QR Code
                    </Button>
                    <Button onClick={handleExpired} className="flex-1">
                      Alterar Pagamento
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-16 w-16 text-amber-500 mb-2" />
                  <p className="text-xl font-bold text-amber-600 text-center">PIX não confirmado</p>
                  <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 rounded-xl p-4 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <CreditCard className="h-5 w-5 text-amber-700" />
                      <p className="font-bold text-amber-800 dark:text-amber-300">Cobrar na maquininha!</p>
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      O pagamento PIX não foi confirmado. Use a maquininha POS física para garantir o recebimento.
                    </p>
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button onClick={retryPayment} variant="outline" className="flex-1">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Tentar PIX novamente
                    </Button>
                    <Button onClick={handleCancel} variant="destructive" className="flex-1">
                      Cancelar e cobrar na POS
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error state */}
          {error && !pixTimedOut && (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <XCircle className="h-12 w-12 text-destructive mb-2" />
              <p className="text-destructive text-center font-medium">{typeof error === 'string' ? error : ((error as any)?.message || 'Erro ao gerar PIX')}</p>
              {!isDelivery && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <CreditCard className="h-4 w-4 text-amber-700" />
                    <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">PIX falhou? Cobre na maquininha!</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2 w-full">
                <Button onClick={retryPayment} variant="outline" className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
                <Button onClick={handleCancel} variant="destructive" className="flex-1">
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Payment confirmed state */}
          {paymentConfirmed && (
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-20 w-20 text-green-500 mb-4 animate-pulse" />
              <p className="text-2xl font-bold text-green-500">Pagamento Confirmado!</p>
              <p className="text-muted-foreground text-sm mt-2">
                {isDelivery ? 'Criando seu pedido...' : 'Redirecionando...'}
              </p>
            </div>
          )}

          {/* QR Code display */}
          {pixData && !paymentConfirmed && !error && !pixTimedOut && (
            <>
              {/* Countdown timer */}
              <div className={`flex items-center justify-center gap-2 text-lg font-bold p-3 rounded-lg border-2 ${
                isUrgent
                  ? 'bg-destructive/10 border-destructive/30 text-destructive animate-pulse'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
              }`}>
                <Timer className="h-5 w-5" />
                <span>Expira em {formatTime(remainingSeconds)}</span>
              </div>

              {/* QR Code Image */}
              <div className="flex justify-center">
                {pixData.qr_code_base64 ? (
                  <div className="p-3 bg-white rounded-xl shadow-md border-2 border-primary/20">
                    <img
                      src={`data:image/png;base64,${pixData.qr_code_base64}`}
                      alt="QR Code PIX"
                      className="w-44 h-44"
                    />
                  </div>
                ) : (
                  <div className="w-44 h-44 bg-secondary flex items-center justify-center rounded-xl border-2 border-dashed border-primary/30">
                    <div className="text-center">
                      <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">QR Code não disponível</p>
                    </div>
                  </div>
                )}
              </div>

              {/* PIX Copia e Cola */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-center">PIX Copia e Cola:</p>
                {pixData.qr_code && (
                  <div className="relative">
                    <div className="p-3 bg-muted rounded-lg text-xs font-mono break-all max-h-24 overflow-y-auto border">
                      {pixData.qr_code}
                    </div>
                  </div>
                )}
                <Button
                  variant="default"
                  className="w-full h-12 text-lg font-semibold"
                  onClick={copyPixCode}
                  disabled={!pixData.qr_code}
                >
                  {copied ? (
                    <>
                      <Check className="h-5 w-5 mr-2 text-green-400" />
                      Código Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5 mr-2" />
                      Copiar Código PIX
                    </>
                  )}
                </Button>
              </div>

              {/* Status indicator */}
              <div className="flex items-center justify-center gap-2 text-sm bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span className="text-amber-700 dark:text-amber-400 font-medium">Aguardando confirmação do pagamento...</span>
              </div>

              {/* Instructions */}
              <div className="text-sm text-muted-foreground space-y-2 bg-secondary/50 p-4 rounded-lg">
                <p className="font-semibold text-foreground mb-2">Como pagar:</p>
                <div className="grid gap-1">
                  <p>1️⃣ Abra o app do seu banco</p>
                  <p>2️⃣ Escolha pagar com PIX</p>
                  <p>3️⃣ Escaneie o QR Code ou cole o código</p>
                  <p>4️⃣ Confirme o pagamento</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {!paymentConfirmed && !pixTimedOut && !error && pixData && (
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancelar Pagamento
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
