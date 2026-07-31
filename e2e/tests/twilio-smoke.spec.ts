/**
 * Twilio test-mode smoke tests.
 *
 * IMPORTANT: Twilio test credentials only validate auth + request shape.
 * They NEVER deliver SMS. A green check here means the API calls Twilio
 * with the correct credentials and request format. Actual SMS delivery
 * is a manual pre-launch check that must be performed before going live.
 *
 * Test phone numbers (Twilio magic numbers):
 * - +15005550006: Valid — accepts any verification code
 * - +15005550001: Invalid — will fail verification
 */

import { test, expect, request } from '@playwright/test';
import twilio from 'twilio';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_TEST_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_TEST_AUTH_TOKEN;
const TWILIO_SERVICE_SID = process.env.TWILIO_TEST_SERVICE_SID;

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;

test.describe('Twilio test-mode smoke', () => {
  test.skip(!TWILIO_ACCOUNT_SID, 'TWILIO_TEST_ACCOUNT_SID not set — skipping Twilio tests');
  test.skip(!TWILIO_AUTH_TOKEN, 'TWILIO_TEST_AUTH_TOKEN not set — skipping Twilio tests');

  test('Twilio client authenticates with test credentials', async () => {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const account = await client.api.accounts(TWILIO_ACCOUNT_SID).fetch();
    expect(account.sid).toBe(TWILIO_ACCOUNT_SID);
    // Test mode accounts have type 'standard' or 'subaccount'
    expect(account.type).toBeDefined();
  });

  test('Valid test number (+15005550006) accepts verification create', async () => {
    test.skip(!TWILIO_SERVICE_SID, 'TWILIO_TEST_SERVICE_SID not set');
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const verification = await client.verify.services(TWILIO_SERVICE_SID).verifications.create({
      to: '+15005550006',
      channel: 'sms',
    });
    expect(verification.status).toBe('pending');
    expect(verification.sid).toMatch(/^VJ/);
  });

  test('Invalid test number (+15005550001) returns canceled status', async () => {
    test.skip(!TWILIO_SERVICE_SID, 'TWILIO_TEST_SERVICE_SID not set');
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const verification = await client.verify.services(TWILIO_SERVICE_SID).verifications.create({
      to: '+15005550001',
      channel: 'sms',
    });
    // In test mode, +15005550001 is an invalid number that returns canceled status
    expect(verification.status).toBe('canceled');
  });

  test('API /recovery_prompt sends SMS via Twilio with test credentials', async () => {
    const requestCtx = await request.newContext();
    try {
      const suffix = Date.now().toString();
      const username = `twilio_test_${suffix}`;
      const phone = '15005550006'; // Twilio test valid number

      // Create a user with the Twilio test number
      const signupRes = await requestCtx.post(`${API_BASE}/signup`, {
        data: {
          provider: 'api.localhost',
          username,
          password: 'TestPass123!',
          new_pass: 'TestPass123!',
          retypepass: 'TestPass123!',
          phone,
          betacode: 'web10betacode',
        },
        timeout: 15000,
      });
      // Signup may return 200 or 400 (if node not configured yet — global-setup handles this)
      expect([200, 400]).toContain(signupRes.status());

      // Call /recovery_prompt — should send an SMS via Twilio
      const recoveryRes = await requestCtx.post(`${API_BASE}/recovery_prompt`, {
        data: { phone_number: phone },
        timeout: 15000,
      });
      expect(recoveryRes.status()).toBe(200);

      // The response is a Twilio message SID (starts with SM)
      const sid = await recoveryRes.text();
      expect(sid).toMatch(/^SM/);
    } finally {
      await requestCtx.dispose();
    }
  });
});