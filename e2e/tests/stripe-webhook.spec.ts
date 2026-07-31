/**
 * Stripe webhook signature verification tests.
 *
 * These tests verify that the Stripe SDK's webhook signature verification
 * mechanism works correctly. They use generateTestHeaderString to create
 * signed payloads, then verify them with constructEvent.
 *
 * GAP NOTE: The API (api/app/endpoints/) has no Stripe webhook endpoint.
 * These tests verify the mechanism (Stripe SDK's constructEvent) but cannot
 * test the actual endpoint. A webhook endpoint needs to be added to the API
 * (lane A) to receive and process Stripe webhooks. See .context/stripe-webhook-gap.md
 * for the full gap analysis.
 */

import { test, expect } from '@playwright/test';
import Stripe from 'stripe';

const TEST_SECRET = 'whsec_test_secret_for_verification';

test.describe('Stripe webhook signature verification', () => {
  test('valid signature verifies correctly', async () => {
    const stripe = new Stripe('sk_test_placeholder', { apiVersion: '2024-12-18.acacia' });
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_456',
          mode: 'subscription',
        },
      },
    });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_SECRET,
    });
    const event = stripe.webhooks.constructEvent(payload, header, TEST_SECRET);
    expect(event.type).toBe('checkout.session.completed');
    expect(event.id).toBe('evt_test_123');
  });

  test('bad signature fails verification', async () => {
    const stripe = new Stripe('sk_test_placeholder', { apiVersion: '2024-12-18.acacia' });
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
    });
    // Bad signature — wrong secret
    expect(() =>
      stripe.webhooks.constructEvent(payload, 't=1234,v1=bad_signature_here', TEST_SECRET)
    ).toThrow();
  });

  test('tampered payload fails verification', async () => {
    const stripe = new Stripe('sk_test_placeholder', { apiVersion: '2024-12-18.acacia' });
    const originalPayload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
    });
    const header = stripe.webhooks.generateTestHeaderString({
      payload: originalPayload,
      secret: TEST_SECRET,
    });
    // Tamper with the payload after signing
    const tamperedPayload = JSON.stringify({
      id: 'evt_test_999',
      type: 'customer.subscription.deleted',
    });
    expect(() =>
      stripe.webhooks.constructEvent(tamperedPayload, header, TEST_SECRET)
    ).toThrow();
  });

  test('missing signature fails verification', async () => {
    const stripe = new Stripe('sk_test_placeholder', { apiVersion: '2024-12-18.acacia' });
    const payload = JSON.stringify({
      id: 'evt_test_123',
      type: 'checkout.session.completed',
    });
    expect(() =>
      stripe.webhooks.constructEvent(payload, '', TEST_SECRET)
    ).toThrow();
  });
});