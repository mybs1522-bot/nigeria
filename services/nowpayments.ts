const SUPABASE_URL = 'https://aexrgtpxyzfxjecozstf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleHJndHB4eXpmeGplY296c3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTY0MjcsImV4cCI6MjA4Nzg3MjQyN30._ZSmh9iTP3etyGj5XrkEGJtRp9kR8z6jAmLOMesIvkg';

export interface NowPaymentsInvoice {
  invoice_url: string;
  id: string;
  order_id: string;
}

export const createCryptoInvoice = async (
  email: string,
  amount: number,
  successUrl: string,
  cancelUrl: string,
): Promise<NowPaymentsInvoice> => {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/create-nowpayments-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, amount, successUrl, cancelUrl }),
    });
  } catch (netErr) {
    console.error('[NowPayments] Network error:', netErr);
    throw new Error('Network error — could not reach payment server.');
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    console.error('[NowPayments] Non-JSON response, status:', res.status);
    throw new Error(`Server error (${res.status}).`);
  }

  if (!res.ok || !data.invoice_url) {
    throw new Error(data.error ?? `Failed to create crypto invoice (${res.status}).`);
  }

  return {
    invoice_url: data.invoice_url,
    id: data.id,
    order_id: data.order_id,
  };
};
