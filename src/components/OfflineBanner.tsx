import React from 'react';

interface OfflineBannerProps {
  language?: string;
}

const OFFLINE_TEXT: Record<string, string> = {
  'en-US': "You're offline — responses unavailable",
  'ar-LB': 'أنت غير متصل — الردود غير متاحة',
  'fr-FR': 'Vous êtes hors ligne — réponses indisponibles',
};

const OfflineBanner: React.FC<OfflineBannerProps> = ({ language = 'en-US' }) => {
  const text = OFFLINE_TEXT[language] || OFFLINE_TEXT['en-US'];

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-600/90 text-white text-sm py-2 px-4 backdrop-blur-sm animate-slide-down"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span>{text}</span>
    </div>
  );
};

export default OfflineBanner;
