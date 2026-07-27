// Shared lucide-react mock for vitest.
//
// Why a Proxy: the old pattern was a hand-maintained list of icon names per
// test file. Every time a component gained a new icon, any test whose mock
// list lacked it failed with `No "<Icon>" export is defined on the
// "lucide-react" mock` — a failure class that reddened dev and blocked PRs
// (see CHANGELOG: unbrick — ci-failures tooling / lucide proxy mock).
// The Proxy fabricates any icon on demand, so new icons can never break tests.
//
// Usage in a test file:
//   import { lucideMock } from './helpers/lucideMock';
//   vi.mock('lucide-react', () => lucideMock);
import React from 'react';

const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();

const iconFactory = (name: string) => {
  const Comp = (props: Record<string, unknown>) => {
    const { ...rest } = props;
    return <span data-testid={`icon-${name.toLowerCase()}`} {...rest} />;
  };
  Comp.displayName = name;
  return Comp;
};

// 'then'/'catch'/'finally' must NOT exist on the mock: vitest checks
// `typeof exports.then === 'function'` to detect thenables, and a Proxy that
// fabricates a function for every name looks like a promise.
const NON_ICONS = new Set(['then', 'catch', 'finally']);

export const lucideMock = new Proxy({} as Record<string, unknown>, {
  get: (_target, prop) => {
    if (prop === '__esModule') return true;
    if (typeof prop !== 'string' || NON_ICONS.has(prop)) return undefined;
    let icon = cache.get(prop);
    if (!icon) {
      icon = iconFactory(prop);
      cache.set(prop, icon);
    }
    return icon;
  },
  // vitest validates named imports with `in` / property descriptors, not just
  // `get` — claim every export exists so any icon name passes validation.
  has: (_target, prop) =>
    typeof prop === 'string' && !NON_ICONS.has(prop),
  getOwnPropertyDescriptor: (_target, prop) =>
    typeof prop === 'string' && !NON_ICONS.has(prop)
      ? { enumerable: true, configurable: true }
      : undefined,
});
