declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module 'rectangles-npm' {
  import type { FC, ReactNode } from 'react';

  export const R: FC<Record<string, unknown>>;
  export const C: FC<Record<string, unknown>>;
  export function pass(props: Record<string, unknown>): Record<string, unknown>;
  export function startRectangles(root: HTMLElement | null): void;
}

declare module 'web10-npm' {
  export function wapiInit(
    authUrl: string,
    _arg1?: unknown,
    rtcHost?: string
  ): Record<string, unknown>;
}
