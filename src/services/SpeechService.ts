export type SupportedLanguage = 'en-US' | 'ar-LB' | 'fr-FR';

interface SpeechRecognitionResult {
  text: string;
  language: SupportedLanguage;
}

interface SpeechServiceState {
  isListening: boolean;
  recognizedLanguage: SupportedLanguage;
}

type LanguageChangeListener = (lang: SupportedLanguage) => void;

class SpeechService {
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesis;
  private state: SpeechServiceState = {
    isListening: false,
    recognizedLanguage: 'en-US',
  };

  // Event callbacks
  private onSpeechStartCallback: (() => void) | null = null;
  private onSpeechEndCallback: (() => void) | null = null;
  private onResultCallback: ((result: SpeechRecognitionResult) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private startListeningTimeout: ReturnType<typeof setTimeout> | null = null;
  private languageChangeListeners: LanguageChangeListener[] = [];

  // Wake word detection
  private isWakeWordMode = false;
  private onWakeWordCallback: ((query: string | null) => void) | null = null;
  private wakeWordRestartTimer: ReturnType<typeof setTimeout> | null = null;

  // Chrome 15s TTS workaround — keep-alive interval
  private ttsKeepAliveInterval: ReturnType<typeof setInterval> | null = null;

  // Cancellation flag for sentence-queue TTS
  private speakCancelled = false;

  // Wake word retry limit
  private static readonly MAX_WAKE_RETRIES = 5;
  private wakeWordRetryCount = 0;

  constructor() {
    this.synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : (null as unknown as SpeechSynthesis);

    if (typeof window === 'undefined' || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window))) {
      console.error('Speech recognition not supported by this browser');
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = this.state.recognizedLanguage;

    this.setupRecognitionEvents();
  }

  private setupRecognitionEvents(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.state.isListening = true;
    };

    this.recognition.onend = () => {
      this.state.isListening = false;
      this.clearListeningTimeout();

      // Auto-restart in wake word mode
      if (this.isWakeWordMode) {
        this.wakeWordRestartTimer = setTimeout(() => {
          this.startWakeWordListeningInternal();
        }, 300);
      }
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript.trim();

      // --- Wake word mode: look for "Nova" keyword ---
      if (this.isWakeWordMode && result.isFinal) {
        const lower = transcript.toLowerCase();
        const novaIdx = lower.indexOf('nova');
        if (novaIdx !== -1) {
          // Stop wake word listening — main flow takes over
          this.stopWakeWordListening();

          // Extract anything after "nova" as the query
          const afterNova = transcript.slice(novaIdx + 4).replace(/^[\s,.:]+/, '').trim();
          this.onWakeWordCallback?.(afterNova.length >= 2 ? afterNova : null);
        }
        return;
      }

      // --- Normal mode ---
      if (!result.isFinal) {
        this.onSpeechStartCallback?.();
      } else {
        this.onSpeechEndCallback?.();
        this.onResultCallback?.({
          text: transcript,
          language: this.state.recognizedLanguage,
        });
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // In wake word mode, "no-speech" is expected — just restart
      if (this.isWakeWordMode && event.error === 'no-speech') {
        return; // onend will restart
      }

      // In wake word mode, count audio-capture / not-allowed toward retries
      // so we don't loop forever when mic is unavailable
      if (this.isWakeWordMode && (event.error === 'audio-capture' || event.error === 'not-allowed')) {
        this.wakeWordRetryCount++;
        console.warn(`Wake word mic error (${event.error}), retry ${this.wakeWordRetryCount}/${SpeechService.MAX_WAKE_RETRIES}`);
        if (this.wakeWordRetryCount >= SpeechService.MAX_WAKE_RETRIES) {
          console.error('Max wake word retries reached — mic unavailable, stopping');
          this.isWakeWordMode = false;
          if (this.wakeWordRestartTimer) {
            clearTimeout(this.wakeWordRestartTimer);
            this.wakeWordRestartTimer = null;
          }
        }
        this.state.isListening = false;
        return; // onend will handle restart (if retries remain)
      }

      console.error('Recognition error:', event.error);
      this.onErrorCallback?.(event.error);
      this.state.isListening = false;
      this.clearListeningTimeout();
    };
  }

  private clearListeningTimeout(): void {
    if (this.startListeningTimeout) {
      clearTimeout(this.startListeningTimeout);
      this.startListeningTimeout = null;
    }
  }

  public startListening(): void {
    if (!this.recognition) return;

    // Stop wake word mode first — they share the same recognition instance
    if (this.isWakeWordMode) {
      this.stopWakeWordListening();
    }

    this.clearListeningTimeout();

    if (this.state.isListening) {
      this.stopListening();
      this.startListeningTimeout = setTimeout(() => {
        this.startListeningInternal();
      }, 250);
      return;
    }

    // Small delay to ensure previous recognition fully stopped
    this.startListeningTimeout = setTimeout(() => {
      this.startListeningInternal();
    }, 150);
  }

  private startListeningInternal(): void {
    if (!this.recognition || this.state.isListening) return;

    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      this.state.isListening = false;
      this.onErrorCallback?.('Failed to start recognition');
    }
  }

  public stopListening(): void {
    if (!this.recognition) return;

    this.clearListeningTimeout();

    try {
      if (this.state.isListening) {
        this.recognition.stop();
      }
    } catch (error) {
      console.error('Error stopping recognition:', error);
      this.state.isListening = false;
    }
  }

  /**
   * Speaks text aloud. Long text is automatically split into sentences
   * to work around Chrome's ~15-second SpeechSynthesis cutoff.
   */
  public async speak(text: string, language: SupportedLanguage): Promise<void> {
    if (!this.synthesis) return;

    this.synthesis.cancel();
    this.clearTTSKeepAlive();
    this.speakCancelled = false;

    const sentences = this.splitIntoSentences(text);
    if (sentences.length <= 1) {
      return this.speakSingle(text, language);
    }

    // Speak sentence by sentence to avoid the 15s cutoff
    for (const sentence of sentences) {
      if (this.speakCancelled) break;
      await this.speakSingle(sentence, language);
    }
  }

  /** Speak a single utterance (no splitting). */
  private speakSingle(text: string, language: SupportedLanguage): Promise<void> {
    if (!this.synthesis) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;

      const finishUp = () => {
        this.clearTTSKeepAlive();
        this.onSpeechEndCallback?.();
        resolve();
      };

      utterance.onstart = () => {
        this.onSpeechStartCallback?.();
        // Chrome keeps-alive: periodically resume to prevent silent cutoff
        this.startTTSKeepAlive();
      };
      utterance.onend = () => finishUp();
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
        finishUp();
      };

      // Select voice
      let voices = this.synthesis.getVoices();
      if (voices.length === 0) {
        const onVoicesChanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          voices = this.synthesis.getVoices();
          this.applyVoice(utterance, voices, language);
          this.synthesis.speak(utterance);
        };
        window.speechSynthesis.onvoiceschanged = onVoicesChanged;
      } else {
        this.applyVoice(utterance, voices, language);
        setTimeout(() => {
          if (this.synthesis.paused) this.synthesis.resume();
          this.synthesis.speak(utterance);
        }, 80);
      }
    });
  }

  /**
   * Split text into sentence-sized chunks.
   * Handles periods, question marks, exclamation marks, and Arabic/French punctuation.
   */
  private splitIntoSentences(text: string): string[] {
    // Match sequences ending with sentence-ending punctuation + optional whitespace
    const sentences = text.match(/[^.!?؟。]+[.!?؟。]+[\s]*/g);
    if (!sentences) return [text];

    // If there's leftover text without terminal punctuation, add it
    const joined = sentences.join('');
    if (joined.length < text.length) {
      sentences.push(text.slice(joined.length));
    }

    return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  /**
   * Chrome workaround: periodically call resume() to prevent the browser
   * from silently stopping long utterances after ~15 seconds.
   */
  private startTTSKeepAlive(): void {
    this.clearTTSKeepAlive();
    this.ttsKeepAliveInterval = setInterval(() => {
      if (this.synthesis.speaking && !this.synthesis.paused) {
        this.synthesis.pause();
        this.synthesis.resume();
      }
    }, 10000); // every 10s (well under the 15s limit)
  }

  private clearTTSKeepAlive(): void {
    if (this.ttsKeepAliveInterval) {
      clearInterval(this.ttsKeepAliveInterval);
      this.ttsKeepAliveInterval = null;
    }
  }

  /** Selects the best voice and configures pitch/rate on the utterance (does NOT call speak). */
  private applyVoice(
    utterance: SpeechSynthesisUtterance,
    voices: SpeechSynthesisVoice[],
    language: SupportedLanguage,
  ): void {
    const preferredVoices: Record<SupportedLanguage, string[]> = {
      'en-US': ['Samantha', 'Google US English Female', 'Microsoft Zira', 'en-US-Standard-F'],
      'ar-LB': [
        'Laila', 'Microsoft Hoda', 'ar-XA-Standard-A',
        'Microsoft Amira', 'Arabic Female', 'Fatima',
        'Google العربية', 'Amina', 'Salma', 'Noura',
        'Microsoft Naayf', 'Microsoft Ali',
      ],
      'fr-FR': [
        'Amélie', 'Google français Female', 'Microsoft Julie',
        'Audrey', 'Marie', 'Jolie', 'fr-FR-Standard-A', 'fr-FR-Standard-C',
      ],
    };

    const languageFallbacks: Record<SupportedLanguage, string[]> = {
      'ar-LB': ['ar', 'ar-SA', 'ar-EG'],
      'fr-FR': ['fr-CA', 'fr'],
      'en-US': ['en-GB', 'en'],
    };

    const matchesLang = (voice: SpeechSynthesisVoice, code: string): boolean =>
      voice.lang === code || voice.lang.startsWith(code + '-');

    // 1. Preferred name match
    let selected = voices.find((v) =>
      preferredVoices[language].some((pref) => v.name.includes(pref)),
    ) ?? null;

    // 2. Exact language match
    if (!selected) selected = voices.find((v) => matchesLang(v, language)) ?? null;

    // 3. Fallback languages
    if (!selected) {
      for (const fb of languageFallbacks[language]) {
        selected = voices.find((v) => matchesLang(v, fb)) ?? null;
        if (selected) break;
      }
    }

    // 4. Google voices as last resort
    if (!selected) {
      const googleMap: Record<SupportedLanguage, string> = {
        'ar-LB': 'Google العربية',
        'fr-FR': 'Google français',
        'en-US': 'Google US English',
      };
      selected = voices.find((v) => v.name.includes(googleMap[language])) ?? null;
    }

    if (selected) {
      utterance.voice = selected;
      utterance.lang = selected.lang;
    } else {
      utterance.lang = language.split('-')[0];
    }

    // Pitch & rate per language
    const isMale = selected?.name
      ? /male|thomas|nicolas|jean|ahmed|ali|naayf/i.test(selected.name)
      : false;

    switch (language) {
      case 'ar-LB':
        utterance.pitch = isMale ? 1.3 : 1.1;
        utterance.rate = 0.95;
        utterance.volume = 1.0;
        break;
      case 'fr-FR':
        utterance.pitch = isMale ? 1.4 : 1.15;
        utterance.rate = 0.95;
        break;
      default:
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
    }
  }

  // --- Public event subscriptions ---

  public onSpeechStart(callback: () => void): void {
    this.onSpeechStartCallback = callback;
  }

  public onSpeechEnd(callback: () => void): void {
    this.onSpeechEndCallback = callback;
  }

  public onResult(callback: (result: SpeechRecognitionResult) => void): void {
    this.onResultCallback = callback;
  }

  public onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  /** Subscribe to language changes without monkey-patching. */
  public onLanguageChange(listener: LanguageChangeListener): () => void {
    this.languageChangeListeners.push(listener);
    return () => {
      this.languageChangeListeners = this.languageChangeListeners.filter((l) => l !== listener);
    };
  }

  public setLanguage(language: SupportedLanguage): void {
    this.state.recognizedLanguage = language;
    if (this.recognition) {
      this.recognition.lang = language;
    }
    // Notify listeners
    this.languageChangeListeners.forEach((fn) => fn(language));
  }

  public getCurrentLanguage(): SupportedLanguage {
    return this.state.recognizedLanguage;
  }

  public stopSpeaking(): void {
    if (!this.synthesis) return;
    this.speakCancelled = true;
    this.clearTTSKeepAlive();
    this.synthesis.cancel();
  }

  // --- Wake word detection ---

  /** Register a callback for when the wake word "Nova" is detected.
   *  Callback receives the query text if the user said something after "Nova",
   *  or null if they just said the wake word alone (meaning: start listening). */
  public onWakeWord(callback: (query: string | null) => void): void {
    this.onWakeWordCallback = callback;
  }

  /** Start listening for "Hey Nova" / "Nova" wake word. */
  public startWakeWordListening(): void {
    if (!this.recognition || this.isWakeWordMode) return;

    // Stop any active normal listening first
    this.stopListening();

    this.isWakeWordMode = true;
    this.wakeWordRetryCount = 0;
    this.recognition.continuous = true;
    this.recognition.interimResults = false; // only final results for wake word
    this.recognition.lang = this.state.recognizedLanguage;

    this.startWakeWordListeningInternal();
  }

  private startWakeWordListeningInternal(): void {
    if (!this.recognition || !this.isWakeWordMode) return;

    try {
      if (!this.state.isListening) {
        this.recognition.start();
        this.wakeWordRetryCount = 0; // reset on success
      }
    } catch (error) {
      console.error('Error starting wake word listening:', error);
      this.wakeWordRetryCount++;
      if (this.wakeWordRetryCount >= SpeechService.MAX_WAKE_RETRIES) {
        console.error('Max wake word retries reached — stopping');
        this.isWakeWordMode = false;
        return;
      }
      // Retry after a delay
      this.wakeWordRestartTimer = setTimeout(() => {
        this.startWakeWordListeningInternal();
      }, 1000);
    }
  }

  /** Stop wake word listening and return to normal mode. */
  public stopWakeWordListening(): void {
    if (!this.recognition) return;

    this.isWakeWordMode = false;
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    if (this.wakeWordRestartTimer) {
      clearTimeout(this.wakeWordRestartTimer);
      this.wakeWordRestartTimer = null;
    }

    try {
      if (this.state.isListening) {
        this.recognition.stop();
      }
    } catch {
      // Ignore
    }
  }

  public isWakeWordActive(): boolean {
    return this.isWakeWordMode;
  }
}

export default new SpeechService();
