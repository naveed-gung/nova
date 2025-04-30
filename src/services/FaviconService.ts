import { BlobState } from '../components/BlobVisualization';

class FaviconService {
  private faviconLink: HTMLLinkElement | null = null;
  
  public initialize(): void {
    this.faviconLink = document.querySelector('link[rel="icon"]');
    
    if (!this.faviconLink) {
      this.faviconLink = document.createElement('link');
      this.faviconLink.rel = 'icon';
      this.faviconLink.type = 'image/svg+xml';
      document.head.appendChild(this.faviconLink);
    }

    this.updateState('idle');
  }
  
  /**
   * Update the favicon color based on the blob state
   */
  public updateState(state: BlobState): void {
    if (!this.faviconLink) return;

    try {
      // Force browser to reload favicon by adding timestamp
      const timestamp = new Date().getTime();
      const stateParam = state ? `?state=${state}` : '';
      this.faviconLink.href = `/favicon.svg${stateParam}&t=${timestamp}`;

      // Fetch the SVG content
      fetch(this.faviconLink.href)
        .then(response => response.text())
        .then(svgContent => {
          // Create a temporary DOM parser
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
          
          // Find the blob element
          const blob = svgDoc.querySelector('#blob');
          if (blob) {
            // Set the appropriate gradient based on state
            let gradient = '';
            switch (state) {
              case 'listening':
                gradient = 'url(#gradientListening)';
                break;
              case 'speaking':
                gradient = 'url(#gradientSpeaking)';
                break;
              case 'responding':
                gradient = 'url(#gradientResponding)';
                break;
              default:
                const isDarkMode = window.matchMedia && 
                  window.matchMedia('(prefers-color-scheme: dark)').matches;
                gradient = `url(#gradient${isDarkMode ? 'Dark' : 'Light'})`;
            }
            
            // Update the fill attribute
            blob.setAttribute('fill', gradient);
            
            // Convert back to string and update favicon
            const serializer = new XMLSerializer();
            const updatedSvgContent = serializer.serializeToString(svgDoc);
            const svgBlob = new Blob([updatedSvgContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            
            this.faviconLink.href = url;
            
            // Clean up the object URL after a delay
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        })
        .catch(error => {
          console.error('Error updating favicon:', error);
        });
    } catch (error) {
      console.error('Error in FaviconService:', error);
    }
  }
}

export default new FaviconService(); 