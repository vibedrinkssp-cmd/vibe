// Lightweight scanner sounds kept outside BarcodeScanner so PDV does not load html5-qrcode on startup.
export const playSuccessBeep = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 1200;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
  } catch {
    console.log('Could not play beep sound');
  }
};

export const playErrorBeep = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    osc1.frequency.value = 400;
    osc1.type = 'square';
    gain1.gain.setValueAtTime(0.25, audioContext.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc1.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + 0.1);

    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.frequency.value = 300;
    osc2.type = 'square';
    gain2.gain.setValueAtTime(0.25, audioContext.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
    osc2.start(audioContext.currentTime + 0.15);
    osc2.stop(audioContext.currentTime + 0.25);
  } catch {
    console.log('Could not play error beep sound');
  }
};