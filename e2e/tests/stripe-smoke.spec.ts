import { test, expect } from '@playwright/test';
import Stripe from 'stripe';

test.describe('Stripe test-mode smoke', () => {
  test('API reaches Stripe test mode with sk_test key', async () => {
    const apiKey = process.env.STRIPE_TEST_KEY;
    if (!apiKey || apiKey === 'sk_test_placeholder') {
      console.warn('STRIPE_TEST_KEY not set — skipping smoke assertion');
      return;
    }

    const stripe = new Stripe(apiKey, { apiVersion: '2024-12-18.acacia' });
    const balance = await stripe.balance.retrieve();
    expect(balance.object).toBe('balance');
    // In test mode, the balance object is present and available exists
    expect(balance.available).toBeDefined();
  });
});