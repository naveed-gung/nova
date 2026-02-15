import VoiceAssistant from '@/components/VoiceAssistant';

const Index = () => {
  return (
    <div className="min-h-screen w-full bg-background">
      <a href="#nova-assistant" className="skip-link">
        Skip to Nova assistant
      </a>
      <main id="nova-assistant">
        <VoiceAssistant />
      </main>

      {/* Screen-reader description */}
      <div className="sr-only">
        <h1>Nova Voice Assistant</h1>
        <p>
          Click the blob or type in the text input to interact. Works in English, Arabic, and French.
          Say &ldquo;Speak Arabic&rdquo; to switch to Arabic, &ldquo;Speak French&rdquo; to switch to French,
          or use the language selector in the top-right corner.
        </p>
      </div>
    </div>
  );
};

export default Index;
