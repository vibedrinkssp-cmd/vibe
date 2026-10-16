import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { finishDialog, subscribeDialogs, type DialogRequest } from '@/lib/dialogs';

/** Desenha as janelas de confirmDialog()/promptDialog(). Montar uma vez no App. */
export function DialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [text, setText] = useState('');

  useEffect(() => subscribeDialogs((r) => { setRequest(r); setText(''); }), []);

  if (!request) return null;

  const isPrompt = request.kind === 'prompt';
  const { options } = request;
  const title = options.title ?? 'Confirmar';
  const required = isPrompt && request.options.required;
  const destructive = !isPrompt && request.options.destructive !== false;

  const settle = (confirmed: boolean) => {
    if (request.kind === 'confirm') request.resolve(confirmed);
    else request.resolve(confirmed ? text.trim() : null);
    finishDialog();
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {options.description && (
            <AlertDialogDescription className="whitespace-pre-line">{options.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {isPrompt && (
          <Input
            autoFocus
            value={text}
            placeholder={request.options.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (!required || text.trim())) settle(true); }}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {(!isPrompt && request.options.cancelText) || 'Cancelar'}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={required && !text.trim()}
            className={cn(destructive && buttonVariants({ variant: 'destructive' }))}
            onClick={(e) => { e.preventDefault(); settle(true); }}
          >
            {options.confirmText ?? (isPrompt ? 'Confirmar' : 'Sim')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
