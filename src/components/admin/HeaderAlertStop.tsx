import { BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderAlertStopProps {
  isAlertActive: boolean;
  onStop: () => void;
}

export function HeaderAlertStop({ isAlertActive, onStop }: HeaderAlertStopProps) {
  if (!isAlertActive) return null;

  return (
    <Button
      variant="destructive"
      size="sm"
      className="gap-1.5 animate-pulse shadow-lg shadow-red-500/30"
      onClick={onStop}
      data-testid="button-stop-alert"
    >
      <BellOff className="h-4 w-4" />
      <span>Parar Alerta</span>
    </Button>
  );
}
