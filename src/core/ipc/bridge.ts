import type { AuraOSBridge } from '../../../shared/bridge'
import { createMockBridge } from './mockBridge'

/**
 * The single bridge the whole UI talks to.
 *
 * - In Electron, `window.auraos` is injected by the sandboxed preload script.
 * - In a plain browser (`npm run dev:web`) we fall back to an in-memory mock so
 *   every feature stays explorable without the native host.
 */
function resolveBridge(): AuraOSBridge {
  if (typeof window !== 'undefined' && window.auraos) return window.auraos
  return createMockBridge()
}

export const bridge: AuraOSBridge = resolveBridge()

export const isNative = bridge.mode === 'native'
