import { useState } from 'react';
import { Volume2, ChefHat, Truck, Bike, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sendSoundTestSignal } from '@/hooks/use-sound-test-listener';
import { useToast } from '@/hooks/use-toast';
import type { NotificationSoundType } from '@/lib/notification-sound-engine';

const TARGETS: { id: string; label: string; icon: typeof ChefHat; soundType: NotificationSoundType }[] = [
  { id: 'kitchen', label: 'Cozinha (KDE)', icon: ChefHat, soundType: 'kitchen' },
  { id: 'log', label: 'Logística (LOG)', icon: Truck, soundType: 'logistics' },
  { id: 'motoboy', label: 'Motoboys', icon: Bike, soundType: 'motoboy' },
];

export function HeaderSoundAlert() {
  const { toast } = useToast();
  const [sending, setSending] = useState<string | null>(null);

  const handleSend = async (targetId: string, label: string, soundType: NotificationSoundType) => {
    if (sending) return;
    setSending(targetId);
    const timer = setTimeout(() => setSending(null), 5000); // safety reset
    try {
      await sendSoundTestSignal(targetId, soundType);
      toast({ title: `🔊 Alerta enviado → ${label}` });
    } catch {
      toast({ title: 'Erro ao enviar alerta', variant: 'destructive' });
    } finally {
      clearTimeout(timer);
      setSending(null);
    }
  };

  const handleSendAll = async () => {
    if (sending) return;
    setSending('all');
    const timer = setTimeout(() => setSending(null), 5000);
    try {
      await sendSoundTestSignal('all', 'generic');
      toast({ title: '🔊 Alerta enviado → Todos os painéis' });
    } catch {
      toast({ title: 'Erro ao enviar alerta', variant: 'destructive' });
    } finally {
      clearTimeout(timer);
      setSending(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
          data-testid="button-header-sound-alert"
        >
          <Volume2 className="h-4 w-4" />
          <span className="hidden sm:inline">Alertar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Enviar alerta sonoro para:
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TARGETS.map(({ id, label, icon: Icon, soundType }) => (
          <DropdownMenuItem
            key={id}
            disabled={sending !== null}
            onClick={() => handleSend(id, label, soundType)}
            className="gap-2 cursor-pointer"
          >
            <Icon className="h-4 w-4" />
            {label}
            <Send className="h-3 w-3 ml-auto text-muted-foreground" />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={sending !== null}
          onClick={handleSendAll}
          className="gap-2 cursor-pointer font-medium"
        >
          <Volume2 className="h-4 w-4" />
          Todos os painéis
          <Send className="h-3 w-3 ml-auto text-muted-foreground" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
