import { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, Loader2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { cn } from '@/lib/utils';

interface OrderStatusAlertProps {
  onStatusChange?: (status: string, orderId: string) => void;
  className?: string;
}

export function OrderStatusAlert({ onStatusChange, className }: OrderStatusAlertProps) {
  const { toast } = useToast();
  const { 
    isSupported, 
    isGranted, 
    isDenied, 
    requestPermission, 
    notifyOrderStatusChange,
  } = usePushNotifications();
  
  const [isRequesting, setIsRequesting] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  // Show prompt if notifications are supported but not granted
  useEffect(() => {
    if (isSupported && !isGranted && !isDenied) {
      // Delay showing prompt for better UX
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSupported, isGranted, isDenied]);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        toast({
          title: 'Notificações ativadas!',
          description: 'Você receberá alertas sobre o status do seu pedido.',
        });
        setShowPrompt(false);
      } else {
        toast({
          title: 'Notificações bloqueadas',
          description: 'Você pode ativar nas configurações do navegador.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    // Store in localStorage to not show again for a while
    localStorage.setItem('notificationPromptDismissed', Date.now().toString());
  };

  // Check if prompt was recently dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('notificationPromptDismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const hoursSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60);
      if (hoursSinceDismissed < 24) {
        setShowPrompt(false);
      }
    }
  }, []);

  if (!isSupported || !showPrompt || isGranted) {
    return null;
  }

  return (
    <Card className={cn(
      'border-primary/30 bg-gradient-to-r from-primary/10 to-secondary/50 animate-in fade-in slide-in-from-top-2',
      className
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground mb-1">Ativar notificações</h3>
            <p className="text-sm text-muted-foreground">
              Receba alertas em tempo real sobre o status do seu pedido
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismissPrompt}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={handleRequestPermission}
            disabled={isRequesting}
            className="bg-primary text-primary-foreground"
          >
            {isRequesting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Ativando...
              </>
            ) : (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Ativar Notificações
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismissPrompt}
          >
            Agora não
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
