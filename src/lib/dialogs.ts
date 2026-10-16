/**
 * Substituto dos confirm()/prompt() nativos do navegador, que são feios e bloqueados em alguns celulares.
 * Uso (dentro de handler async): `if (!(await confirmDialog("Excluir?"))) return;`
 * O <DialogHost /> (montado no App) é quem desenha a janela.
 */

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Botão de confirmar em vermelho (padrão: true, a maioria é exclusão). */
  destructive?: boolean;
}

export interface PromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  confirmText?: string;
  /** Impede confirmar com o campo vazio. */
  required?: boolean;
}

export type DialogRequest =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

type Listener = (request: DialogRequest | null) => void;

let listener: Listener | null = null;
const queue: DialogRequest[] = [];
let showing = false;

function show(request: DialogRequest) {
  if (!listener) {
    // Host ainda não montou: não trava a tela, cai no comportamento nativo.
    if (request.kind === 'confirm') {
      request.resolve(window.confirm(request.options.description || request.options.title || 'Confirmar?'));
    } else {
      request.resolve(window.prompt(request.options.title, '') ?? null);
    }
    return;
  }
  queue.push(request);
  next();
}

function next() {
  if (showing || !listener) return;
  const request = queue.shift();
  if (!request) return;
  showing = true;
  listener(request);
}

/** Chamado pelo DialogHost quando a janela fecha. */
export function finishDialog() {
  showing = false;
  listener?.(null);
  next();
}

export function subscribeDialogs(fn: Listener) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function confirmDialog(message: string | ConfirmOptions): Promise<boolean> {
  const options = typeof message === 'string' ? { description: message } : message;
  return new Promise((resolve) => show({ kind: 'confirm', options, resolve }));
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => show({ kind: 'prompt', options, resolve }));
}
