import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  clearTranscript: () => void;
}

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        } 
      });

      // Try to use webm/opus first, fallback to other formats
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      console.log('Recording started with mimeType:', mimeType);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Erro ao acessar microfone. Verifique as permissões.');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;
      
      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setIsTranscribing(true);

        try {
          // Stop all tracks
          mediaRecorder.stream.getTracks().forEach(track => track.stop());

          // Create blob from chunks
          const mimeType = mediaRecorder.mimeType;
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });
          console.log('Audio blob created:', audioBlob.size, 'bytes, type:', mimeType);

          if (audioBlob.size < 1000) {
            throw new Error('Áudio muito curto. Tente novamente.');
          }

          // Determine file extension
          const extension = mimeType.includes('webm') ? 'webm' : 
                           mimeType.includes('mp4') ? 'm4a' : 'wav';

          // Create form data
          const formData = new FormData();
          formData.append('audio', audioBlob, `recording.${extension}`);

          // Send to transcription endpoint
          const { data, error: fnError } = await supabase.functions.invoke('transcribe-audio', {
            body: formData,
          });

          if (fnError) {
            throw new Error(fnError.message);
          }

          if (data.error) {
            throw new Error(data.error);
          }

          const transcribedText = data.text || '';
          setTranscript(transcribedText);
          setIsTranscribing(false);
          resolve(transcribedText);
        } catch (err) {
          console.error('Transcription error:', err);
          setError(err instanceof Error ? err.message : 'Erro na transcrição');
          setIsTranscribing(false);
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, [isRecording]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isRecording,
    isTranscribing,
    transcript,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
  };
}
