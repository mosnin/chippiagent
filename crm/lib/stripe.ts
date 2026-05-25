import Stripe from 'stripe';

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
  }

  _stripe = new Stripe(key);
  return _stripe;
}

/** The single Pro plan price ID from Stripe Dashboard. */
export function getPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error('Missing STRIPE_PRICE_ID environment variable');
  return id;
}
