import React from 'react';
import { FaGithub } from 'react-icons/fa';
import { BlobState } from './BlobVisualization';

interface FooterProps {
  blobState: BlobState;
}

const Footer: React.FC<FooterProps> = ({ blobState }) => {
  // Get color based on blob state
  const getIconColor = () => {
    switch (blobState) {
      case 'listening':
        return '#6BBFFF'; // Light blue
      case 'speaking':
        return '#9b87f5'; // Vivid purple
      case 'responding':
        return '#34D399'; // Teal
      default: // idle
        return '#9b87f5'; // Primary purple
    }
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 py-3 flex flex-col items-center justify-center backdrop-blur-sm bg-opacity-5 bg-black border-t border-gray-800/20">
      <a 
        href="https://github.com/naveed-gung/nova"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-transform hover:scale-110"
        aria-label="GitHub repository"
      >
        <FaGithub 
          size={28} 
          color={getIconColor()} 
          className="transition-colors duration-300"
        />
      </a>
      <div className="text-xs mt-1 text-gray-400">
        &copy; nova
      </div>
    </footer>
  );
};

export default Footer; 