import type { AppInterface } from '../types';

declare global {
  interface Window {
    I?: AppInterface;
  }
}

export {};
