import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  Trash2, 
  Sparkles,
  Loader2,
  Bot,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAIChat, type ChatMessage } from '@/hooks/use-ai-chat';
import { useVoiceRecording } from '@/hooks/use-voice-recording';

const QUICK_QUESTIONS = [
  "Quanto vendemos hoje?",
  "Quais produtos estão acabando?",
  "Quantos pedidos pendentes?",
  "Qual o produto mais vendido?",
];

export function AdminAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isLoading, sendMessage, clearHistory } = useAIChat();
  const { 
    isRecording, 
    isTranscribing, 
    startRecording, 
    stopRecording,
    error: voiceError 
  } = useVoiceRecording();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    const message = inputValue;
    setInputValue('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceToggle = async () => {
    if (isRecording) {
      const transcript = await stopRecording();
      if (transcript) {
        setInputValue(transcript);
        // Auto-send after transcription
        await sendMessage(transcript);
      }
    } else {
      await startRecording();
    }
  };

  const handleQuickQuestion = async (question: string) => {
    setInputValue('');
    await sendMessage(question);
  };

  return (
    <>
      {/* Header Button */}
      <Button
        variant={isOpen ? "default" : "outline"}
        size="sm"
        className={`gap-1.5 ${!isOpen ? 'border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10' : ''}`}
        onClick={() => setIsOpen(v => !v)}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">IA</span>
      </Button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/10 to-purple-600/10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Assistente IA</h3>
                  <p className="text-xs text-muted-foreground">Pergunte sobre seus dados</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearHistory}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Limpar conversa"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-purple-600/20 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h4 className="font-medium text-foreground mb-2">Como posso ajudar?</h4>
                  <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
                    Pergunte sobre vendas, estoque, clientes, pedidos e muito mais!
                  </p>
                  
                  {/* Quick Questions */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {QUICK_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleQuickQuestion(q)}
                        className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  
                  {isLoading && (
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Pensando...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Voice Error */}
            {voiceError && (
              <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
                <p className="text-xs text-destructive">{voiceError}</p>
              </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-card">
              <div className="flex items-center gap-2">
                <Button
                  variant={isRecording ? "destructive" : "outline"}
                  size="icon"
                  onClick={handleVoiceToggle}
                  disabled={isTranscribing || isLoading}
                  className={cn(
                    "flex-shrink-0",
                    isRecording && "animate-pulse"
                  )}
                  title={isRecording ? "Parar gravação" : "Gravar áudio"}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>

                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isRecording ? "Gravando..." : "Digite sua pergunta..."}
                  disabled={isLoading || isRecording || isTranscribing}
                  className="flex-1"
                />

                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading || isRecording}
                  size="icon"
                  className="flex-shrink-0 bg-gradient-to-br from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {isRecording && (
                <p className="text-xs text-center text-muted-foreground mt-2 animate-pulse">
                  🎙️ Gravando... Clique novamente para parar
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
        isUser 
          ? "bg-primary/20" 
          : "bg-gradient-to-br from-primary to-purple-600"
      )}>
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      
      <div className={cn(
        "max-w-[85%] rounded-2xl px-4 py-3",
        isUser 
          ? "bg-primary text-primary-foreground rounded-tr-md" 
          : "bg-muted text-foreground rounded-tl-md"
      )}>
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <p className={cn(
          "text-[10px] mt-1 opacity-70",
          isUser ? "text-right" : "text-left"
        )}>
          {message.timestamp.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </p>
      </div>
    </div>
  );
}
