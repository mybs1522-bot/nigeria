import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const API_KEY = Deno.env.get('NOWPAYMENTS_API_KEY') ?? '';
    if (!API_KEY) {
      return new Response(
        JSON.stringify({ error: 'NOWPAYMENTS_API_KEY not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { email, amount, successUrl, cancelUrl } = await req.json();
    const rawAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 11;
    // Ensure we clear the NOWPayments minimum (~$10 for most pairs)
    const priceAmount = Math.max(rawAmount, 11);
    const orderId = `avada-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aexrgtpxyzfxjecozstf.supabase.co';
    const ipnCallbackUrl = `${SUPABASE_URL}/functions/v1/nowpayments-webhook`;

    const invoicePayload: Record<string, unknown> = {
      price_amount: priceAmount,
      price_currency: 'usd',
      pay_currency: 'usdttrc20',
      order_id: orderId,
      order_description: 'Avada Design Bundle',
      ipn_callback_url: ipnCallbackUrl,
    };

    if (successUrl) invoicePayload.success_url = successUrl;
    if (cancelUrl) invoicePayload.cancel_url = cancelUrl;

    const invoiceRes = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoicePayload),
    });

    const invoiceData = await invoiceRes.json();

    if (!invoiceRes.ok || !invoiceData.invoice_url) {
      console.error('[create-nowpayments-invoice] API error:', invoiceData);
      return new Response(
        JSON.stringify({ error: invoiceData.message ?? 'Failed to create invoice.' }),
        { status: invoiceRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Optionally store the order mapping (email ↔ orderId) for later IPN handling
    console.log(`[create-nowpayments-invoice] Created invoice for ${email}, orderId: ${orderId}`);

    return new Response(
      JSON.stringify({
        invoice_url: invoiceData.invoice_url,
        id: invoiceData.id,
        order_id: orderId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[create-nowpayments-invoice] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
