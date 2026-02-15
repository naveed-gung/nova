/**
 * StorageService — persists conversation history in localStorage.
 * Falls back gracefully if storage is unavailable (private browsing, full quota, etc.).
 */

const STORAGE_KEY = 'nova_messages';
const MAX_STORED_MESSAGES = 200;

export interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export function loadMessages(): StoredMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate shape & trim to limit
    return parsed
      .filter(
        (m: unknown): m is StoredMessage =>
          typeof m === 'object' &&
          m !== null &&
          'role' in m &&
          'text' in m &&
          'timestamp' in m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof (m as StoredMessage).text === 'string' &&
          typeof (m as StoredMessage).timestamp === 'number',
      )
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

export function saveMessages(messages: StoredMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to save messages to localStorage:', e);
  }
}

export function clearMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear messages from localStorage:', e);
  }
}
