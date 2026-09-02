import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as v3 from '../data/v3';

// v3 stub: the token handoff bug (Bug A) no longer applies because v3 uses a
// single client instance. This stub verifies the v3 client's token handling
// works correctly — setToken propagates to readToken and isSignedIn.

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const payload = btoa(JSON.stringify({ username: 'testuser', provider: 'test.localhost' }));
  return `${header}.${payload}.fake`;
}

describe('v3 token handling', () => {
  const client = v3.getV3Client();

  beforeEach(() => {
    client.scrubToken();
  });

  it('setToken makes the client signed-in and readable', () => {
    expect(client.isSignedIn()).toBe(false);
    expect(client.readToken()).toBeNull();

    client.setToken(makeFakeJwt());
    expect(client.isSignedIn()).toBe(true);
    const token = client.readToken();
    expect(token).not.toBeNull();
    expect(token?.username).toBe('testuser');
  });

  it('scrubToken clears the token', () => {
    client.setToken(makeFakeJwt());
    expect(client.isSignedIn()).toBe(true);

    client.scrubToken();
    expect(client.isSignedIn()).toBe(false);
    expect(client.readToken()).toBeNull();
  });

  it('signOut clears the token', () => {
    client.setToken(makeFakeJwt());
    expect(client.isSignedIn()).toBe(true);

    client.signOut();
    expect(client.isSignedIn()).toBe(false);
  });
});