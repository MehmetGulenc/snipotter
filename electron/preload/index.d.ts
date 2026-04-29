/**
 * Type augmentation for the renderer so `window.snipotter` is fully typed.
 */
import type { SnipotterAPI } from './index'

declare global {
  interface Window {
    snipotter: SnipotterAPI
  }
}

export {}
