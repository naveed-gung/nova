import React, { useState, useEffect, useCallback, useRef } from 'react';
import BlobVisualization, { BlobState } from './BlobVisualization';
import Footer from './Footer';
import ConversationHistory from './ConversationHistory';
import OfflineBanner from './OfflineBanner';
import SpeechService, { SupportedLanguage } from '../services/SpeechService';
import { handleAIRequest, handleAIRequestStream, HistoryMessage } from '../services/AIProxyService';
import { loadMessages, saveMessages, clearMessages as clearStoredMessages } from '../services/StorageService';
import FaviconService from '../services/FaviconService';
import AnalyticsService from '../services/AnalyticsService';
import useOnlineStatus from '../hooks/useOnlineStatus';
import useNetworkQuality from '../hooks/useNetworkQuality';

// Language display names and flags
const LANGUAGE_DISPLAY: Record<SupportedLanguage, { name: string; flag: string }> = {
  'en-US': { name: 'English', flag: '🇺🇸' },
  'ar-LB': { name: 'Arabic', flag: '🇱🇧' },
  'fr-FR': { name: 'French', flag: '🇫🇷' },
};

// Shared error messages (used by both voice and text paths)
const ERROR_MESSAGES: Record<SupportedLanguage, string> = {
  'ar-LB': 'عذراً، حصل خطأ في المعالجة. الرجاء المحاولة مرة أخرى.',
  'fr-FR': "Désolé, une erreur s'est produite. Veuillez réessayer.",
  'en-US': 'Sorry, there was an error. Please try again.',
};

export interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

const CONTEXT_WINDOW = 10; // Number of messages to send as conversation context

const VoiceAssistant: React.FC = () => {
  const [blobState, setBlobState] = useState<BlobState>('idle');
  const [amplitude, setAmplitude] = useState<number>(0.5);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>('en-US');
  const [showLanguageMenu, setShowLanguageMenu] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>(() => loadMessages());
  const [greetingText, setGreetingText] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [textInput, setTextInput] = useState<string>('');
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(false);
  const hasGreeted = useRef<boolean>(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const lastClickTime = useRef<number>(0);
  const hasInteractedRef = useRef<boolean>(false);

  const isOnline = useOnlineStatus();
  const { shouldPreferNonStreaming, isSlowNetwork } = useNetworkQuality();

  // Ref for stable access inside callbacks
  const preferNonStreamingRef = useRef(shouldPreferNonStreaming);

  // Refs for stable callback references (prevents useEffect churn)
  const isProcessingRef = useRef(isProcessing);
  const currentLanguageRef = useRef(currentLanguage);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);

  // Keep refs in sync with state
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { currentLanguageRef.current = currentLanguage; }, [currentLanguage]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { preferNonStreamingRef.current = shouldPreferNonStreaming; }, [shouldPreferNonStreaming]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Time-appropriate greeting (text only, no auto-speak)
  const getTimeBasedGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning. I'm Nova, your voice assistant.";
    if (hour >= 12 && hour < 17) return "Good afternoon. I'm Nova, your voice assistant.";
    return "Good evening. I'm Nova, your voice assistant.";
  };

  // Update favicon when blob state changes
  const updateBlobState = useCallback((newState: BlobState) => {
    setBlobState(newState);
    FaviconService.updateState(newState);
  }, []);

  // Cancel any in-flight AI request
  const cancelPendingRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Handle blob click with debounce
  const handleBlobClick = useCallback(() => {
    const now = Date.now();
    if (now - lastClickTime.current < 400) return; // debounce
    lastClickTime.current = now;
    hasInteractedRef.current = true;

    if (blobState === 'listening') {
      updateBlobState('idle');
      SpeechService.stopListening();
      setIsProcessing(false);
      return;
    }

    // Don't start listening while an AI request is in-flight
    if (isProcessingRef.current) {
      cancelPendingRequest();
      SpeechService.stopSpeaking();
      setIsProcessing(false);
      updateBlobState('idle');
      return;
    }

    SpeechService.stopSpeaking();
    SpeechService.stopWakeWordListening();
    setIsProcessing(false);
    updateBlobState('listening');
    SpeechService.startListening();
  }, [blobState, updateBlobState, cancelPendingRequest]);

  // Shared AI query logic — tries streaming first, falls back to non-streaming
  const processQuery = useCallback(
    async (query: string) => {
      const lang = currentLanguageRef.current;

      cancelPendingRequest();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Build conversation context from last N messages
      const history: HistoryMessage[] = messagesRef.current
        .slice(-CONTEXT_WINDOW)
        .map((m) => ({ role: m.role, text: m.text }));

      try {
        updateBlobState('responding');

        // On slow networks, skip streaming entirely — use single-shot request
        if (preferNonStreamingRef.current) {
          try {
            const aiResponse = await handleAIRequest(
              { query, language: lang, history },
              controller.signal,
            );

            if (controller.signal.aborted) return;

            if (aiResponse?.responseText) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
              ]);
              await SpeechService.speak(aiResponse.responseText, lang);
            }
          } catch (nonStreamError) {
            if (controller.signal.aborted) return;
            console.error('Non-streaming request failed:', nonStreamError);
            const errorMsg = ERROR_MESSAGES[lang];
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', text: errorMsg, timestamp: Date.now() },
            ]);
            SpeechService.speak(errorMsg, lang);
          }
          return; // done — skip streaming path
        }

        // --- Try streaming first ---
        // Add a placeholder assistant message that gets updated progressively
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: '', timestamp: Date.now() },
        ]);

        const fullText = await handleAIRequestStream(
          { query, language: lang, history },
          (chunk) => {
            if (controller.signal.aborted) return;
            // Update the last (streaming) message with new chunk
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, text: last.text + chunk };
              }
              return updated;
            });
          },
          controller.signal,
        );

        if (controller.signal.aborted) return;

        // Speak the complete response
        if (fullText) {
          await SpeechService.speak(fullText, lang);
        }
      } catch (streamError) {
        if (controller.signal.aborted) return;
        console.warn('Streaming failed, falling back to non-streaming:', streamError);

        // Remove failed streaming placeholder (regardless of partial text)
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated.pop();
          }
          return updated;
        });

        // --- Non-streaming fallback ---
        try {
          const aiResponse = await handleAIRequest(
            { query, language: lang, history },
            controller.signal,
          );

          if (controller.signal.aborted) return;

          if (aiResponse?.responseText) {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
            ]);
            await SpeechService.speak(aiResponse.responseText, lang);
          }
        } catch (fallbackError) {
          if (controller.signal.aborted) return;
          console.error('Fallback also failed:', fallbackError);

          const errorMsg = ERROR_MESSAGES[lang];
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: errorMsg, timestamp: Date.now() },
          ]);
          SpeechService.speak(errorMsg, lang);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsProcessing(false);
          updateBlobState('idle');
        }
        abortControllerRef.current = null;
      }
    },
    [updateBlobState, cancelPendingRequest],
  );

  // --- Initialize speech service, analytics, and favicon (runs ONCE) ---
  useEffect(() => {
    FaviconService.initialize();
    AnalyticsService.init();

    SpeechService.onSpeechStart(() => {
      setBlobState((prev) => {
        if (prev === 'responding') return prev;
        FaviconService.updateState('speaking');
        return 'speaking';
      });
      setAmplitude(0.8);
    });

    SpeechService.onSpeechEnd(() => {
      setBlobState((prev) => {
        if (prev === 'responding') return prev;
        FaviconService.updateState('idle');
        return 'idle';
      });
      setAmplitude(0.5);
      setTimeout(() => setIsProcessing(false), 300);
    });

    SpeechService.onResult(({ text, language }) => {
      if (isProcessingRef.current) return;
      setIsProcessing(true);

      if (text.trim().length < 2) {
        setIsProcessing(false);
        return;
      }

      // Check for language switch command
      const lower = text.toLowerCase();
      const commands: Array<{ match: () => boolean; target: SupportedLanguage; confirm: string }> = [
        { match: () => language === 'en-US' && (lower.includes('speak arabic') || lower.includes('switch to arabic')), target: 'ar-LB', confirm: 'تم التحويل إلى اللغة العربية' },
        { match: () => language === 'ar-LB' && (lower.includes('تكلم انجليزي') || lower.includes('speak english')), target: 'en-US', confirm: 'Switched to English' },
        { match: () => language === 'fr-FR' && (lower.includes('parle anglais') || lower.includes("passer à l'anglais") || lower.includes('speak english')), target: 'en-US', confirm: 'Switched to English' },
        { match: () => language === 'en-US' && (lower.includes('speak french') || lower.includes('switch to french')), target: 'fr-FR', confirm: 'Passé au français' },
      ];
      const cmd = commands.find((c) => c.match());
      if (cmd) {
        SpeechService.setLanguage(cmd.target);
        SpeechService.speak(cmd.confirm, cmd.target);
        setIsProcessing(false);
        return;
      }

      // Add user message and process with streaming + context
      setMessages((prev) => [...prev, { role: 'user', text, timestamp: Date.now() }]);

      const lang = currentLanguageRef.current;

      // Cancel any previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Build conversation context
      const history: HistoryMessage[] = messagesRef.current
        .slice(-CONTEXT_WINDOW)
        .map((m) => ({ role: m.role, text: m.text }));

      setBlobState('responding');
      FaviconService.updateState('responding');

      // On slow networks, use single-shot request instead of streaming
      if (preferNonStreamingRef.current) {
        handleAIRequest({ query: text, language: lang, history }, controller.signal)
          .then((aiResponse) => {
            if (controller.signal.aborted) return;
            if (aiResponse?.responseText) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
              ]);
              return SpeechService.speak(aiResponse.responseText, lang);
            }
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            console.error('Voice non-streaming failed:', err);
            const errorMsg = ERROR_MESSAGES[lang];
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', text: errorMsg, timestamp: Date.now() },
            ]);
            SpeechService.speak(errorMsg, lang);
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setIsProcessing(false);
              setBlobState('idle');
              FaviconService.updateState('idle');
            }
            abortControllerRef.current = null;
          });
        return;
      }

      // Add streaming placeholder
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '', timestamp: Date.now() },
      ]);

      handleAIRequestStream(
        { query: text, language: lang, history },
        (chunk) => {
          if (controller.signal.aborted) return;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, text: last.text + chunk };
            }
            return updated;
          });
        },
        controller.signal,
      )
        .then((fullText) => {
          if (controller.signal.aborted) return;
          if (fullText) {
            return SpeechService.speak(fullText, lang);
          }
        })
        .catch((streamError) => {
          if (controller.signal.aborted) return;
          console.warn('Voice streaming failed, trying fallback:', streamError);

          // Remove failed streaming placeholder (regardless of partial text)
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') updated.pop();
            return updated;
          });

          return handleAIRequest({ query: text, language: lang, history }, controller.signal)
            .then((aiResponse) => {
              if (controller.signal.aborted) return;
              if (aiResponse?.responseText) {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
                ]);
                return SpeechService.speak(aiResponse.responseText, lang);
              }
            })
            .catch((fallbackError) => {
              if (controller.signal.aborted) return;
              console.error('Voice fallback also failed:', fallbackError);
              const errorMsg = ERROR_MESSAGES[lang];
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: errorMsg, timestamp: Date.now() },
              ]);
              SpeechService.speak(errorMsg, lang);
            });
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsProcessing(false);
            setBlobState('idle');
            FaviconService.updateState('idle');
          }
          abortControllerRef.current = null;
        });
    });

    SpeechService.onError(() => {
      setBlobState('idle');
      FaviconService.updateState('idle');
      setIsProcessing(false);
    });

    // --- Wake word handler ---
    SpeechService.onWakeWord((query) => {
      if (isProcessingRef.current) return;

      if (query) {
        // User said "Hey Nova, <query>" — process the query directly
        setIsProcessing(true);
        setMessages((prev) => [...prev, { role: 'user', text: query, timestamp: Date.now() }]);

        const lang = currentLanguageRef.current;

        // Cancel any previous in-flight request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const history: HistoryMessage[] = messagesRef.current
          .slice(-CONTEXT_WINDOW)
          .map((m) => ({ role: m.role, text: m.text }));

        setBlobState('responding');
        FaviconService.updateState('responding');

        // On slow networks, use single-shot request instead of streaming
        if (preferNonStreamingRef.current) {
          handleAIRequest({ query, language: lang, history }, controller.signal)
            .then((aiResponse) => {
              if (controller.signal.aborted) return;
              if (aiResponse?.responseText) {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
                ]);
                return SpeechService.speak(aiResponse.responseText, lang);
              }
            })
            .catch((err) => {
              if (controller.signal.aborted) return;
              console.error('Wake word non-streaming failed:', err);
              const errorMsg = ERROR_MESSAGES[lang];
              setMessages((prev) => [...prev, { role: 'assistant', text: errorMsg, timestamp: Date.now() }]);
              SpeechService.speak(errorMsg, lang);
            })
            .finally(() => {
              if (!controller.signal.aborted) {
                setIsProcessing(false);
                setBlobState('idle');
                FaviconService.updateState('idle');
              }
              abortControllerRef.current = null;
            });
          return;
        }

        setMessages((prev) => [...prev, { role: 'assistant', text: '', timestamp: Date.now() }]);

        handleAIRequestStream(
          { query, language: lang, history },
          (chunk) => {
            if (controller.signal.aborted) return;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, text: last.text + chunk };
              }
              return updated;
            });
          },
          controller.signal,
        )
          .then((fullText) => {
            if (controller.signal.aborted) return;
            if (fullText) return SpeechService.speak(fullText, lang);
          })
          .catch((streamError) => {
            if (controller.signal.aborted) return;
            console.warn('Wake word streaming failed, trying fallback:', streamError);

            // Remove failed streaming placeholder
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') updated.pop();
              return updated;
            });

            return handleAIRequest({ query, language: lang, history }, controller.signal)
              .then((aiResponse) => {
                if (controller.signal.aborted) return;
                if (aiResponse?.responseText) {
                  setMessages((prev) => [
                    ...prev,
                    { role: 'assistant', text: aiResponse.responseText, timestamp: Date.now() },
                  ]);
                  return SpeechService.speak(aiResponse.responseText, lang);
                }
              })
              .catch((fallbackError) => {
                if (controller.signal.aborted) return;
                console.error('Wake word fallback also failed:', fallbackError);
                const errorMsg = ERROR_MESSAGES[lang];
                setMessages((prev) => [...prev, { role: 'assistant', text: errorMsg, timestamp: Date.now() }]);
                SpeechService.speak(errorMsg, lang);
              });
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              setIsProcessing(false);
              setBlobState('idle');
              FaviconService.updateState('idle');
            }
            abortControllerRef.current = null;
            // Wake word restart is handled by the wakeWordEnabled effect
          });
      } else {
        // User just said "Hey Nova" — start normal listening
        setBlobState('listening');
        FaviconService.updateState('listening');
        SpeechService.startListening();
      }
    });

    // Show greeting text (no auto-speak — browsers block it)
    // Only if there are no persisted messages
    if (!hasGreeted.current) {
      const greeting = getTimeBasedGreeting();
      setGreetingText(greeting);
      setMessages((prev) => {
        if (prev.length === 0) {
          return [{ role: 'assistant', text: greeting, timestamp: Date.now() }];
        }
        return prev;
      });
      hasGreeted.current = true;
    }

    return () => {
      SpeechService.stopListening();
      SpeechService.stopSpeaking();
      SpeechService.stopWakeWordListening();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — uses refs for mutable values

  // Subscribe to language changes via event (no monkey-patching)
  useEffect(() => {
    const unsubscribe = SpeechService.onLanguageChange((lang) => {
      setCurrentLanguage(lang);
    });

    // Ensure default is en-US
    const current = SpeechService.getCurrentLanguage();
    if (current !== 'en-US') {
      SpeechService.setLanguage('en-US');
    } else {
      setCurrentLanguage('en-US');
    }

    return unsubscribe;
  }, []);

  // Close language menu on outside click
  useEffect(() => {
    if (!showLanguageMenu) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showLanguageMenu]);

  // Wake word toggle — start/stop listening when toggle changes
  // Only start wake word after user has interacted (user gesture required for mic)
  useEffect(() => {
    if (wakeWordEnabled && hasInteractedRef.current) {
      if (blobState === 'idle' && !isProcessing) {
        SpeechService.startWakeWordListening();
      }
    } else if (!wakeWordEnabled) {
      SpeechService.stopWakeWordListening();
    }
    return () => {
      // Don't stop on cleanup if component unmounts — the mount cleanup handles it
    };
  }, [wakeWordEnabled, blobState, isProcessing]);

  // Restart wake word listening after processing completes (if enabled)
  useEffect(() => {
    if (wakeWordEnabled && hasInteractedRef.current && !isProcessing && blobState === 'idle' && !SpeechService.isWakeWordActive()) {
      const timer = setTimeout(() => {
        SpeechService.startWakeWordListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [wakeWordEnabled, isProcessing, blobState]);

  // Handle clear history
  const handleClearHistory = useCallback(() => {
    clearStoredMessages();
    const greeting = getTimeBasedGreeting();
    setMessages([{ role: 'assistant', text: greeting, timestamp: Date.now() }]);
    setShowHistory(false);
  }, []);

  const handleLanguageSelect = useCallback((language: SupportedLanguage) => {
    SpeechService.setLanguage(language);
    setCurrentLanguage(language);
    setShowLanguageMenu(false);

    const confirmations: Record<SupportedLanguage, string> = {
      'en-US': 'Switched to English',
      'ar-LB': 'تم التحويل إلى اللغة العربية',
      'fr-FR': 'Passé au français',
    };
    SpeechService.speak(confirmations[language], language);
  }, []);

  // Handle text input submission
  const handleTextSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const query = textInput.trim();
      if (!query || isProcessing) return;

      setTextInput('');
      setIsProcessing(true);

      // Stop any ongoing voice activity
      SpeechService.stopListening();
      SpeechService.stopSpeaking();

      setMessages((prev) => [...prev, { role: 'user', text: query, timestamp: Date.now() }]);
      await processQuery(query);
    },
    [textInput, isProcessing, processQuery],
  );

  return (
    <div className="voice-assistant">
      {/* Offline banner */}
      {!isOnline && <OfflineBanner language={currentLanguage} />}

      {/* Slow network indicator */}
      {isOnline && isSlowNetwork && (
        <div
          role="status"
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-orange-800/80 text-white text-xs py-1.5 px-4 backdrop-blur-sm animate-slide-down"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Slow connection detected — using compact responses</span>
        </div>
      )}

      {/* Language selector + wake word toggle */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Wake word toggle */}
        <button
          onClick={() => setWakeWordEnabled((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium shadow-lg transition-all duration-300 ease-in-out border ${
            wakeWordEnabled
              ? 'bg-purple-600/80 border-purple-400 text-white'
              : 'bg-gray-800/80 border-gray-600/50 text-gray-400 hover:bg-gray-700/80 hover:text-white'
          }`}
          aria-label={wakeWordEnabled ? 'Disable "Hey Nova" wake word' : 'Enable "Hey Nova" wake word'}
          aria-pressed={wakeWordEnabled}
          title={wakeWordEnabled ? '"Hey Nova" active' : 'Enable "Hey Nova"'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <span className="hidden sm:inline">Hey Nova</span>
          {wakeWordEnabled && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-400"></span>
            </span>
          )}
        </button>

        {/* Language selector */}
        <div ref={langMenuRef}>
        <button
          onClick={() => setShowLanguageMenu((prev) => !prev)}
          className="flex items-center justify-center bg-gray-800/80 hover:bg-gray-700/80 p-3 rounded-full text-lg shadow-lg transition-all duration-300 ease-in-out border border-purple-500/50 hover:border-purple-400"
          aria-label={`Current language: ${LANGUAGE_DISPLAY[currentLanguage].name}. Click to change.`}
          aria-expanded={showLanguageMenu}
          aria-haspopup="listbox"
        >
          <span className="text-2xl">{LANGUAGE_DISPLAY[currentLanguage].flag}</span>
        </button>

        {showLanguageMenu && (
          <div
            className="absolute top-full mt-2 right-0 bg-gray-800/90 backdrop-blur-md rounded-lg shadow-lg overflow-hidden border border-gray-700/50 transition-all duration-300 ease-in-out"
            role="listbox"
            aria-label="Select language"
          >
            {(Object.entries(LANGUAGE_DISPLAY) as [SupportedLanguage, { name: string; flag: string }][]).map(
              ([langCode, langInfo]) => (
                <button
                  key={langCode}
                  role="option"
                  aria-selected={currentLanguage === langCode}
                  onClick={() => handleLanguageSelect(langCode)}
                  className={`flex items-center w-full px-4 py-3 text-left text-white hover:bg-gray-700/80 transition-all duration-300 ease-in-out
                    ${currentLanguage === langCode ? 'bg-gray-900/80 font-medium border-l-2 border-purple-500/70' : ''}`}
                >
                  <span className="mr-3 text-2xl">{langInfo.flag}</span>
                  <span className="text-lg">{langInfo.name}</span>
                </button>
              ),
            )}
          </div>
        )}
      </div>
      </div>

      {/* Greeting text displayed above the blob */}
      {greetingText && blobState === 'idle' && messages.length <= 1 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 text-center z-10 pointer-events-none px-4">
          <p className="text-white/70 text-sm md:text-base font-medium animate-fade-in">
            {greetingText}
          </p>
        </div>
      )}

      <BlobVisualization
        state={blobState}
        amplitude={amplitude}
        onClick={handleBlobClick}
      />

      {/* Text input bar */}
      <form
        onSubmit={handleTextSubmit}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-4"
      >
        <div className="flex items-center gap-2 bg-gray-800/80 backdrop-blur-md rounded-full border border-gray-700/50 px-4 py-2 shadow-lg focus-within:border-purple-500/60 transition-colors">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={
              currentLanguage === 'ar-LB' ? 'اكتب رسالتك...' :
              currentLanguage === 'fr-FR' ? 'Tapez votre message...' :
              'Type your message...'
            }
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-400 outline-none"
            disabled={isProcessing}
            dir={currentLanguage === 'ar-LB' ? 'rtl' : 'ltr'}
            aria-label="Message input"
          />
          {/* History toggle */}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="p-1.5 rounded-full hover:bg-gray-700/60 transition-colors text-gray-400 hover:text-white"
            aria-label="Show conversation history"
            disabled={messages.length === 0}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          {/* Send button */}
          <button
            type="submit"
            disabled={isProcessing || !textInput.trim()}
            className="p-1.5 rounded-full bg-purple-600/80 hover:bg-purple-500/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-white"
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>

      {/* Conversation history panel */}
      <ConversationHistory
        messages={messages}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onClear={handleClearHistory}
      />

      <Footer blobState={blobState} />
    </div>
  );
};

export default VoiceAssistant;
