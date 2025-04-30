import React, { useState, useEffect, useCallback, useRef } from 'react';
import BlobVisualization, { BlobState } from './BlobVisualization';
import Footer from './Footer';
import SpeechService, { SupportedLanguage } from '../services/SpeechService';
import AIService from '../services/AIService';
import { handleAIRequest } from '../services/AIProxyService';
import FaviconService from '../services/FaviconService';

// Language display names and flags
const LANGUAGE_DISPLAY = {
  'en-US': { name: 'English', flag: '🇺🇸' },
  'ar-LB': { name: 'Arabic', flag: '🇱🇧' },
  'fr-FR': { name: 'French', flag: '🇫🇷' },
};

const VoiceAssistant: React.FC = () => {
  // State for the blob visualization
  const [blobState, setBlobState] = useState<BlobState>('idle');
  const [amplitude, setAmplitude] = useState<number>(0.5);
  const [isClickMode, setIsClickMode] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>('en-US');
  const [showLanguageMenu, setShowLanguageMenu] = useState<boolean>(false);
  const hasGreeted = useRef<boolean>(false);

  // Get time-appropriate greeting in English
  const getTimeBasedGreeting = (): { text: string; language: SupportedLanguage } => {
    const hour = new Date().getHours();
    
    // Always use English for greeting
    const language: SupportedLanguage = 'en-US';
    
    // Morning greeting (5 AM - 12 PM)
    if (hour >= 5 && hour < 12) {
      return { 
        text: 'Good morning. I\'m Nova, your voice assistant.',
        language: 'en-US'
      };
    } 
    // Afternoon greeting (12 PM - 5 PM)
    else if (hour >= 12 && hour < 17) {
      return { 
        text: 'Good afternoon. I\'m Nova, your voice assistant.',
        language: 'en-US'
      };
    } 
    // Evening/Night greeting (5 PM - 5 AM)
    else {
      return { 
        text: 'Good evening. I\'m Nova, your voice assistant.',
        language: 'en-US'
      };
    }
  };

  // Update favicon when blob state changes
  const updateBlobState = useCallback((newState: BlobState) => {
    setBlobState(newState);
    FaviconService.updateState(newState);
  }, []);

  // Handle blob click to start listening
  const handleBlobClick = useCallback(() => {
    // If already listening, stop
    if (blobState === 'listening') {
      updateBlobState('idle');
      SpeechService.stopListening();
      setIsProcessing(false);
      return;
    }
    
    // Always stop any current speech when the blob is clicked
    SpeechService.stopSpeaking();
    
    // Reset processing state
    setIsProcessing(false);
    
    // Update blob to listening state
    updateBlobState('listening');
    
    // Start listening
    SpeechService.startListening();
  }, [blobState, updateBlobState]);

  // Handle hotword detection (keeping for backward compatibility)
  const handleHotwordDetected = useCallback(() => {
    if (isProcessing) return;
    
    // Hotword detected! Listening for query...
    updateBlobState('listening');
    setIsClickMode(false);
  }, [isProcessing, updateBlobState]);

  // Handle speech start (for user and assistant)
  const handleSpeechStart = useCallback(() => {
    updateBlobState('speaking');
    setAmplitude(0.8);
  }, [updateBlobState]);

  // Handle speech end
  const handleSpeechEnd = useCallback(() => {
    // Speech ended callback
    updateBlobState('idle');
    setAmplitude(0.5);
    
    // Wait a bit to set processing to false to prevent race conditions
    setTimeout(() => {
      setIsProcessing(false);
    }, 300);
  }, [updateBlobState]);

  // Handle voice commands for language switching
  const handleLanguageCommand = useCallback((text: string, currentLanguage: SupportedLanguage) => {
    const lowerText = text.toLowerCase();
    
    // Handle language switching commands
    if ((currentLanguage === 'en-US' && lowerText.includes('speak arabic')) ||
        (currentLanguage === 'en-US' && lowerText.includes('switch to arabic'))) {
      SpeechService.setLanguage('ar-LB');
      SpeechService.speak('تم التحويل إلى اللغة العربية', 'ar-LB');
      return true;
    }
    else if ((currentLanguage === 'ar-LB' && lowerText.includes('تكلم انجليزي')) ||
             (currentLanguage === 'ar-LB' && lowerText.includes('speak english'))) {
      SpeechService.setLanguage('en-US');
      SpeechService.speak('Switched to English', 'en-US');
      return true;
    }
    // French to English
    else if ((currentLanguage === 'fr-FR' && lowerText.includes('parle anglais')) ||
             (currentLanguage === 'fr-FR' && lowerText.includes('passer à l\'anglais')) ||
             (currentLanguage === 'fr-FR' && lowerText.includes('speak english'))) {
      SpeechService.setLanguage('en-US');
      SpeechService.speak('Switched to English', 'en-US');
      return true;
    }
    // English to French
    else if ((currentLanguage === 'en-US' && lowerText.includes('speak french')) ||
             (currentLanguage === 'en-US' && lowerText.includes('switch to french'))) {
      SpeechService.setLanguage('fr-FR');
      SpeechService.speak('Passé au français', 'fr-FR');
      return true;
    }
    
    return false;
  }, []);

  // Process the speech recognition result
  const handleSpeechResult = useCallback(async ({ text, language }) => {
    // Prevent processing if we're already handling a request
    if (isProcessing) return;
    
    // Processing speech result
    setIsProcessing(true);
    
    // If text is too short, ignore it (likely noise)
    if (text.trim().length < 2) {
      setIsProcessing(false);
      return;
    }
    
    // Process query with AI
    try {
      updateBlobState('responding');
      
      // Determine the appropriate system message based on current language
      let systemMessage = '';
      if (currentLanguage === 'ar-LB') {
        systemMessage = 'أنت مساعد شخصي ذكي اسمه نوفا. أجب بشكل مباشر على الأسئلة بدون مقدمات أو أسئلة توضيحية. قدم معلومات مختصرة ودقيقة فقط. لا تطلب من المستخدم توضيحًا أو تسأله عما يريد، بل قدم إجابة مباشرة فقط.';
      } else if (currentLanguage === 'fr-FR') {
        systemMessage = 'Vous êtes un assistant personnel intelligent nommé Nova. Répondez directement aux questions sans introduction et sans poser de questions de clarification. Soyez concis et précis. Ne demandez pas à l\'utilisateur ce qu\'il veut, fournissez simplement une réponse directe.';
      } else {
        systemMessage = 'You are an intelligent personal assistant named Nova. Answer questions directly without introductions or asking clarifying questions back. Be concise and accurate. Do not ask the user what they want - simply provide a direct answer to their query.';
      }
      
      // Call the AI service with the current language
      const aiResponse = await handleAIRequest({
        query: text,
        language: currentLanguage,
        systemMessage
      });
      
      // Speak the AI response
      if (aiResponse && aiResponse.responseText) {
        SpeechService.speak(aiResponse.responseText, currentLanguage);
      }
    } catch (error) {
      console.error('Error processing request:', error);
      
      // Provide error feedback in current language
      const errorMessage = currentLanguage === 'ar-LB'
        ? 'عذراً، حصل خطأ في المعالجة. الرجاء التحقق من اتصال الإنترنت والمحاولة مرة أخرى.'
        : currentLanguage === 'fr-FR'
        ? 'Désolé, une erreur s\'est produite. Veuillez vérifier votre connexion internet et réessayer.'
        : 'Sorry, there was an error. Please check your internet connection and try again.';
      
      SpeechService.speak(errorMessage, currentLanguage);
    } finally {
      setIsProcessing(false);
      updateBlobState('idle');
    }
  }, [handleLanguageCommand, isProcessing, updateBlobState, currentLanguage]);

  // Initialize speech service and favicon
  useEffect(() => {
    // Initialize the favicon service
    FaviconService.initialize();
    
    // Set up event listeners
    SpeechService.onSpeechStart(handleSpeechStart);
    SpeechService.onSpeechEnd(handleSpeechEnd);
    SpeechService.onResult(handleSpeechResult);
    SpeechService.onError((error) => {
      updateBlobState('idle');
      setIsProcessing(false);
    });

    // Show greeting only once when component mounts
    if (!hasGreeted.current) {
      const greeting = getTimeBasedGreeting();
      
      // Wait for voices to load before speaking
      const loadVoicesAndGreet = async () => {
        // Wait for voices to load
        if (window.speechSynthesis.getVoices().length === 0) {
          await new Promise(resolve => {
            window.speechSynthesis.onvoiceschanged = resolve;
          });
        }
        
        // Initial greeting after voices are loaded
        updateBlobState('responding');
        await SpeechService.speak(greeting.text, greeting.language);
        hasGreeted.current = true;
        
        // Reset to idle state after greeting
        setTimeout(() => {
          updateBlobState('idle');
          setIsProcessing(false);
        }, 500);
      };

      // Start loading voices and greeting after a delay
      const timer = setTimeout(() => {
        loadVoicesAndGreet();
      }, 2000);

      return () => clearTimeout(timer);
    }
    
    return () => {
      // Cleanup
      SpeechService.stopListening();
      SpeechService.stopSpeaking();
    };
  }, [handleSpeechStart, handleSpeechEnd, handleSpeechResult, updateBlobState]);

  // Subscribe to language changes from SpeechService
  useEffect(() => {
    const handleLanguageChange = (newLanguage: SupportedLanguage) => {
      setCurrentLanguage(newLanguage);
    };
    
    // Add event listener for language changes
    const originalSetLanguage = SpeechService.setLanguage;
    SpeechService.setLanguage = (language: SupportedLanguage) => {
      originalSetLanguage.call(SpeechService, language);
      handleLanguageChange(language);
    };
    
    // Initialize with English as default language
    const currentLang = SpeechService.getCurrentLanguage();
    if (currentLang !== 'en-US') {
      SpeechService.setLanguage('en-US');
    } else {
      setCurrentLanguage('en-US');
    }

    // Cleanup
    return () => {
      SpeechService.setLanguage = originalSetLanguage;
    };
  }, []);

  // Language selector click handler
  const handleLanguageClick = useCallback(() => {
    setShowLanguageMenu(prev => !prev);
  }, []);

  // Handle language selection
  const handleLanguageSelect = useCallback((language: SupportedLanguage) => {
    SpeechService.setLanguage(language);
    setCurrentLanguage(language);
    setShowLanguageMenu(false);
    
    // Provide feedback for language change
    const messages = {
      'en-US': 'Switched to English',
      'ar-LB': 'تم التحويل إلى اللغة العربية',
      'fr-FR': 'Passé au français',
    };
    
    SpeechService.speak(messages[language], language);
  }, []);

  return (
    <div className="voice-assistant">
      {/* Language selector */}
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={handleLanguageClick}
          className="flex items-center justify-center bg-gray-800/80 hover:bg-gray-700/80 p-3 rounded-full text-lg shadow-lg transition-all duration-300 ease-in-out border border-purple-500/50 hover:border-purple-400"
          title={`Current language: ${LANGUAGE_DISPLAY[currentLanguage].name}`}
        >
          <span className="text-2xl">{LANGUAGE_DISPLAY[currentLanguage].flag}</span>
        </button>
        
        {showLanguageMenu && (
          <div className="absolute top-full mt-2 right-0 bg-gray-800/90 backdrop-blur-md rounded-lg shadow-lg overflow-hidden border border-gray-700/50 transition-all duration-300 ease-in-out">
            {Object.entries(LANGUAGE_DISPLAY).map(([langCode, langInfo]) => (
              <button
                key={langCode}
                onClick={() => handleLanguageSelect(langCode as SupportedLanguage)}
                className={`flex items-center w-full px-4 py-3 text-left text-white hover:bg-gray-700/80 transition-all duration-300 ease-in-out
                           ${currentLanguage === langCode ? 'bg-gray-900/80 font-medium border-l-2 border-purple-500/70' : ''}`}
              >
                <span className="mr-3 text-2xl">{langInfo.flag}</span>
                <span className="text-lg">{langInfo.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      
      <BlobVisualization 
        state={blobState} 
        amplitude={amplitude} 
        onClick={handleBlobClick}
      />
      <Footer blobState={blobState} />
    </div>
  );
};

export default VoiceAssistant;
