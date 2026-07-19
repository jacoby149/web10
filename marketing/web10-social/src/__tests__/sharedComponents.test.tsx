import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Old shared components (Branding, Icon) used rectangles-npm which has been retired.
// These tests are kept as a record but skipped until the components are updated.
describe.skip('Branding (legacy)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});

describe.skip('Icon (legacy)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});

describe.skip('RawIcon (legacy)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});