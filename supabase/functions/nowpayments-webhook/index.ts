import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createHmac } from 'https://deno.land/std@0.208.0/crypto/mod.ts';

const SUPABASE_URL = 'https://aexrgtpxyzfxjecozstf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleHJndHB4eXpmeGplY296c3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTY0MjcsImV4cCI6MjA4Nzg3MjQyN30._ZSmh9iTP3etyGj5XrkEGJtRp9kR8z6jAmLOMesIvkg';

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj)
    .sort()
    .reduce((result: Record<string, unknown>, key: string) => {
      result[key] = obj[key] != null && typeof obj[key] === 'object' && !Array.isArray(obj[key])
        ? sortObject(obj[key] as Record<string, unknown>)
        : obj[key];
      return result;
    }, {});
}

async function verifyIpnSignature(body: Record<string, unknown>, receivedSig: string, ipnSecret: string): Promise<boolean> {
  const sorted = sortObject(body);
  const jsonStr = JSON.stringify(sorted);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ipnSecret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(jsonStr));
  const hexSig = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hexSig === receivedSig;
}

async function sendFbPurchaseEvent(email: string, value: number): Promise<void> {
  if (!email) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/fb-purchase-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, value, currency: 'USD' }),
    });
  } catch (e) {
    console.error('[nowpayments-webhook] sendFbPurchaseEvent failed:', e);
  }
}

async function sendAccessEmail(email: string): Promise<void> {
  if (!email) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-access-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email }),
    });
  } catch (e) {
    console.error('[nowpayments-webhook] sendAccessEmail failed:', e);
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const IPN_SECRET = Deno.env.get('NOWPAYMENTS_IPN_SECRET') ?? '';
    if (!IPN_SECRET) {
      console.error('[nowpayments-webhook] NOWPAYMENTS_IPN_SECRET not set');
      return new Response('IPN secret not configured', { status: 500 });
    }

    const body = await req.json();
    const receivedSig = req.headers.get('x-nowpayments-sig') ?? '';

    // Verify HMAC-SHA512 signature
    const valid = await verifyIpnSignature(body, receivedSig, IPN_SECRET);
    if (!valid) {
      console.error('[nowpayments-webhook] Invalid signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
    }

    console.log('[nowpayments-webhook] IPN received:', JSON.stringify(body));

    const paymentStatus = body.payment_status as string;
    const orderId = body.order_id as string;
    const payAmount = body.actually_paid as number;
    const priceCurrency = body.price_currency as string;
    const priceAmount = body.price_amount as number;

    // Handle finished/confirmed payments
    if (paymentStatus === 'finished' || paymentStatus === 'confirmed') {
      console.log(`[nowpayments-webhook] Payment ${paymentStatus} for order ${orderId}, amount: ${priceAmount} ${priceCurrency}`);

      // Extract email from order_description or order_id if you encoded it.
      // For now, log it — the frontend handles email-based access via success_url redirect.
      // If you store email ↔ orderId in a DB table during invoice creation, look it up here.

      // Fire FB purchase event if email available
      // await sendFbPurchaseEvent(email, priceAmount);
      // await sendAccessEmail(email);
    } else if (paymentStatus === 'partially_paid') {
      console.log(`[nowpayments-webhook] Partial payment for order ${orderId}`);
    } else if (paymentStatus === 'expired') {
      console.log(`[nowpayments-webhook] Payment expired for order ${orderId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[nowpayments-webhook] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
