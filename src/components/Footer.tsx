import React from 'react';
import { BlobState } from './BlobVisualization';

interface FooterProps {
  blobState: BlobState;
}

const STATE_COLORS: Record<BlobState, string> = {
  idle: '#9b87f5',
  listening: '#6BBFFF',
  speaking: '#9b87f5',
  responding: '#34D399',
};

const Footer: React.FC<FooterProps> = ({ blobState }) => {
  const color = STATE_COLORS[blobState];

  return (
    <footer className="fixed bottom-0 left-0 right-0 py-3 flex flex-col items-center justify-center backdrop-blur-sm bg-black/5 border-t border-gray-800/20">
      <a
        href="https://github.com/naveed-gung/nova"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-transform hover:scale-110"
        aria-label="GitHub repository"
      >
        {/* Inline SVG replaces react-icons/FaGithub */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill={color}
          className="transition-colors duration-300"
          aria-hidden="true"
        >
          <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.333-1.723-1.333-1.723-1.089-.73.083-.716.083-.716 1.205.083 1.838 1.215 1.838 1.215 1.07 1.802 2.807 1.281 3.492.98.109-.762.418-1.281.762-1.576-2.665-.297-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.228-3.164-.123-.298-.532-1.497.117-3.12 0 0 1.001-.314 3.28 1.209A11.5 11.5 0 0 1 12 6.292c1.014.005 2.034.134 2.988.394 2.277-1.523 3.276-1.209 3.276-1.209.65 1.623.241 2.822.118 3.12.764.825 1.226 1.877 1.226 3.164 0 4.53-2.805 5.527-5.476 5.817.43.364.814 1.084.814 2.184 0 1.576-.014 2.846-.014 3.232 0 .316.216.683.825.567C20.565 21.917 24 17.5 24 12.292 24 5.78 18.627.5 12 .5z" />
        </svg>
      </a>
      <div className="text-xs mt-1 text-gray-400">
        &copy; {new Date().getFullYear()} Nova
      </div>
    </footer>
  );
};

export default Footer; 