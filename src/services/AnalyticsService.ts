/**
 * AnalyticsService — lightweight analytics (Plausible) + global error tracking.
 *
 * Usage: call `AnalyticsService.init()` once at app startup.
 *
 * For Plausible, set your domain in the PLAUSIBLE_DOMAIN constant below
 * or pass it via the `data-domain` attribute on the script tag in index.html.
 * If you don't use Plausible, this module still provides error tracking.
 */

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';

/** Set to your Plausible domain (e.g., "nova-assistant.netlify.app") */
const PLAUSIBLE_DOMAIN = 'nova-assistant.netlify.app';

interface ErrorReport {
  message: string;
  source?: string;
  line?: number;
  col?: number;
  stack?: string;
  timestamp: number;
  url: string;
  userAgent: string;
}

class AnalyticsService {
  private initialized = false;
  private errorBuffer: ErrorReport[] = [];
  private readonly MAX_BUFFER = 20;

  /** Call once to set up Plausible script injection + global error handlers. */
  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // --- Plausible analytics (only in production) ---
    if (IS_PROD && PLAUSIBLE_DOMAIN) {
      this.injectPlausible();
    }

    // --- Global error tracking ---
    window.addEventListener('error', (event) => {
      this.captureError({
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        stack: event.error?.stack,
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.captureError({
        message: reason?.message || String(reason),
        stack: reason?.stack,
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    });
  }

  /** Track a custom event (forwarded to Plausible if available). */
  trackEvent(name: string, props?: Record<string, string | number | boolean>): void {
    if (!IS_PROD) {
      console.debug('[Analytics] event:', name, props);
      return;
    }

    // Plausible custom event API
    const plausible = (window as unknown as Record<string, unknown>).plausible as
      | ((name: string, options?: { props: Record<string, string | number | boolean> }) => void)
      | undefined;

    if (plausible) {
      plausible(name, props ? { props } : undefined);
    }
  }

  /** Buffer error reports. In production, these could be flushed to Sentry or a custom endpoint. */
  private captureError(report: ErrorReport): void {
    if (!IS_PROD) {
      console.error('[ErrorTracker]', report.message, report.stack);
      return;
    }

    // Buffer errors (FIFO)
    if (this.errorBuffer.length >= this.MAX_BUFFER) {
      this.errorBuffer.shift();
    }
    this.errorBuffer.push(report);

    // TODO: If you add Sentry, call Sentry.captureException here.
    // For now, errors are buffered and logged.
    console.error('[ErrorTracker]', report.message);
  }

  /** Returns buffered errors (useful for debug panels). */
  getErrors(): readonly ErrorReport[] {
    return this.errorBuffer;
  }

  private injectPlausible(): void {
    if (document.querySelector('script[data-domain]')) return; // already injected

    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', PLAUSIBLE_DOMAIN);
    script.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(script);
  }
}

export default new AnalyticsService();
