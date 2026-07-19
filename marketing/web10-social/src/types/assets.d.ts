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

declare module 'web10-npm' {
  export function wapiInit(
    authUrl: string,
    _arg1?: unknown,
    rtcHost?: string
  ): Record<string, unknown>;
}
