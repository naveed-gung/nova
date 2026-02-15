import { BlobState } from '../components/BlobVisualization';

/** Maps blob state to the corresponding pre-made SVG favicon. */
const FAVICON_MAP: Record<BlobState, string> = {
  idle: '/favicon.svg',
  listening: '/favicon-listening.svg',
  speaking: '/favicon-speaking.svg',
  responding: '/favicon-responding.svg',
};

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

  /** Swap the favicon href to the state-specific SVG. */
  public updateState(state: BlobState): void {
    if (!this.faviconLink) return;
    this.faviconLink.href = FAVICON_MAP[state] ?? FAVICON_MAP.idle;
  }
}

export default new FaviconService(); 