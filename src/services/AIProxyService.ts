// AI Proxy Service — calls the Netlify serverless function to keep API keys server-side

import { SupportedLanguage } from './SpeechService';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ProxyRequestBody {
  query: string;
  language: SupportedLanguage;
  history?: HistoryMessage[];
}

export interface AIResponse {
  responseText: string;
  language: SupportedLanguage;
  error?: boolean;
}

const REQUEST_TIMEOUT_MS = 20000;
const STREAM_TIMEOUT_MS = 30000;

/**
 * Sends a query to the AI proxy (non-streaming).
 * Throws on network/server errors so callers can handle them explicitly.
 */
export async function handleAIRequest(
  request: ProxyRequestBody,
  signal?: AbortSignal,
): Promise<AIResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch('/.netlify/functions/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        query: request.query.trim(),
        language: request.language,
        history: request.history,
      }),
    });

    const data: AIResponse = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.responseText || `AI proxy returned status ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sends a query to the streaming AI endpoint.
 * Calls `onChunk` with each text fragment as it arrives.
 * Returns the full accumulated response text when the stream ends.
 * Falls back to non-streaming if the streaming endpoint fails.
 */
export async function handleAIRequestStream(
  request: ProxyRequestBody,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch('/api/ai-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        query: request.query.trim(),
        language: request.language,
        history: request.history,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream endpoint returned status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              onChunk(parsed.text);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }

    // Process any remaining data left in the buffer
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice(6).trim();
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(parsed.text);
          }
        } catch {
          // Skip malformed final chunk
        }
      }
    }

    return fullText;
  } finally {
    clearTimeout(timeoutId);
  }
}

