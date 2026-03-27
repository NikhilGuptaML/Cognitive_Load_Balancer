/// <reference types="vite/client" />
/**
 * Centralized API URL configuration.
 *
 * In browser (Vite dev), fetch calls use relative URLs which get proxied.
 * On mobile (Capacitor native), we need an absolute URL to the backend server.
 *
 * Set the VITE_API_BASE_URL env variable or change the fallback below
 * to point at the machine running the FastAPI backend.
 */

import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

/**
 * Backend base URL.
 * - In the browser with Vite proxy: empty string (relative URLs like '/document/upload')
 * - On native (Capacitor): absolute URL to the FastAPI backend
 *
 * Override at build time via VITE_API_BASE_URL env var:
 *   VITE_API_BASE_URL=http://192.168.1.42:8000 npm run build
 */
const envBase = import.meta.env.VITE_API_BASE_URL ?? '';
const API_BASE: string = isNative
  ? (envBase as string) || 'http://192.168.1.100:8000'
  : (envBase as string) || '';

/**
 * Get a full HTTP URL for an API path.
 * @example getApiUrl('/document/upload') => 'http://192.168.1.100:8000/document/upload'
 */
export function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Get a full WebSocket URL for a WS path.
 * @example getWsUrl('/ws/load/abc') => 'ws://192.168.1.100:8000/ws/load/abc'
 */
export function getWsUrl(path: string): string {
  if (isNative) {
    // Convert http(s) base to ws(s)
    const wsBase = API_BASE.replace(/^http/, 'ws');
    return `${wsBase}${path}`;
  }
  // Browser: construct from current location
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const backendHost = `${window.location.hostname}:8000`;
  return `${protocol}://${backendHost}${path}`;
}
