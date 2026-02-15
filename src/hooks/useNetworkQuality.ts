import { useState, useEffect, useCallback } from 'react';

/**
 * Network quality information from the Network Information API.
 * Auto-detects slow connections (2G, slow-2G) and recommends
 * non-streaming requests to reduce payload overhead.
 */

// Effective connection types ordered by speed
type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g';

// Types for the Network Information API (not in all TS libs)
interface NetworkInformation extends EventTarget {
  readonly effectiveType: EffectiveType;
  readonly downlink: number; // Mbps
  readonly rtt: number; // ms
  readonly saveData: boolean;
  addEventListener(type: 'change', listener: EventListener): void;
  removeEventListener(type: 'change', listener: EventListener): void;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

export interface NetworkQuality {
  /** Current effective connection type (null if API unavailable) */
  effectiveType: EffectiveType | null;
  /** Estimated downlink speed in Mbps (null if API unavailable) */
  downlinkMbps: number | null;
  /** Estimated round-trip time in ms (null if API unavailable) */
  rttMs: number | null;
  /** Whether the user has requested reduced data usage */
  saveData: boolean;
  /** true when connection is too slow for streaming (2G, slow-2G, or saveData on) */
  isSlowNetwork: boolean;
  /** true when we recommend using non-streaming requests */
  shouldPreferNonStreaming: boolean;
}

function getConnection(): NetworkInformation | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as NavigatorWithConnection;
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

function readQuality(conn: NetworkInformation | null): NetworkQuality {
  if (!conn) {
    return {
      effectiveType: null,
      downlinkMbps: null,
      rttMs: null,
      saveData: false,
      isSlowNetwork: false,
      shouldPreferNonStreaming: false,
    };
  }

  const effectiveType = conn.effectiveType;
  const isSlow = effectiveType === 'slow-2g' || effectiveType === '2g';
  const saveData = conn.saveData ?? false;

  return {
    effectiveType,
    downlinkMbps: conn.downlink ?? null,
    rttMs: conn.rtt ?? null,
    saveData,
    isSlowNetwork: isSlow || saveData,
    shouldPreferNonStreaming: isSlow || saveData,
  };
}

/**
 * React hook — reactively monitors network quality.
 *
 * Returns `shouldPreferNonStreaming: true` on 2G / slow-2G / Save-Data,
 * allowing the app to skip SSE streaming and use smaller single-shot requests.
 */
export default function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>(() =>
    readQuality(getConnection()),
  );

  const handleChange = useCallback(() => {
    setQuality(readQuality(getConnection()));
  }, []);

  useEffect(() => {
    const conn = getConnection();
    if (!conn) return;

    // Sync initial state (connection may have changed before effect runs)
    setQuality(readQuality(conn));

    conn.addEventListener('change', handleChange);
    return () => conn.removeEventListener('change', handleChange);
  }, [handleChange]);

  return quality;
}
