
import VoiceAssistant from '@/components/VoiceAssistant';

const Index = () => {
  return (
    <div className="min-h-screen w-full bg-background">
      <VoiceAssistant />
      
      {/* Invisible info message for screen readers only */}
      <div className="sr-only">
        <h1>Nova Voice Assistant</h1>
        <p>
          Say "Hey Nova" to activate. Works in English and Lebanese Arabic.
          Say "Speak Arabic" to switch to Arabic, or "تكلم إنجليزي" to switch to English.
        </p>
      </div>
    </div>
  );
};

export default Index;
