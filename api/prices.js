/**
 * GET /api/prices?symbols=AAPL,MSFT,NVDA
 * Devuelve precios en tiempo real para tickers USA via Finnhub
 * Requiere: FINNHUB_API_KEY en .env
 *
 * Fallback: si no hay API key, devuelve precios simulados
 * para que el terminal siga funcionando durante desarrollo.
 */

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// Precios base de referencia (se usan como fallback si no hay API key)
const FALLBACK_PRICES = {
  AAPL: 185.2, GOOGL: 152.8, MSFT: 221.0, TSLA: 124.4,
  AMZN: 198.0, META:  93.5,  NVDA: 142.5, KO:    67.8,
  DIS:  104.5, BABA:  89.2,  GOLD:  18.5,  MELI: 245.0,
  HOOD:  32.8, CRWD:  389.0, OKLO:  15.8,  RKLB:  28.9, ALAB: 89.2,
};

async function fetchQuote(symbol, apiKey) {
  const url = `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Finnhub ${res.status} for ${symbol}`);
  const d = await res.json();
  // Finnhub response: c=current, pc=prevClose, h=high, l=low, o=open, t=timestamp
  return {
    symbol,
    price:     d.c,
    prevClose: d.pc,
    open:      d.o,
    high:      d.h,
    low:       d.l,
    change:    d.c - d.pc,
    changePct: d.pc > 0 ? ((d.c - d.pc) / d.pc) * 100 : 0,
    ts:        d.t * 1000,
    source:    'finnhub',
  };
}

function simulatedQuote(symbol) {
  const base = FALLBACK_PRICES[symbol] || 100;
  const pct   = (Math.random() - 0.48) * 4;
  const price = parseFloat((base * (1 + pct / 100)).toFixed(2));
  return {
    symbol,
    price,
    prevClose: base,
    open:      base * (1 + (Math.random() - 0.5) * 0.01),
    high:      price * (1 + Math.random() * 0.015),
    low:       price * (1 - Math.random() * 0.015),
    change:    price - base,
    changePct: pct,
    ts:        Date.now(),
    source:    'simulated',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw     = req.query.symbols || '';
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  if (symbols.length === 0) {
    return res.status(400).json({ error: 'Parámetro symbols requerido. Ej: ?symbols=AAPL,MSFT' });
  }

  if (symbols.length > 20) {
    return res.status(400).json({ error: 'Máximo 20 símbolos por request' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;

  try {
    let quotes;

    if (apiKey && apiKey !== 'tu_key_aqui') {
      // Fetch real prices en paralelo
      quotes = await Promise.all(symbols.map(s => fetchQuote(s, apiKey)));
    } else {
      // Sin API key → datos simulados (para desarrollo)
      console.warn('[/api/prices] Sin FINNHUB_API_KEY — usando datos simulados');
      quotes = symbols.map(simulatedQuote);
    }

    // Convertir array a mapa { AAPL: {...}, MSFT: {...} }
    const result = Object.fromEntries(quotes.map(q => [q.symbol, q]));

    res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
    return res.status(200).json({ quotes: result, ts: Date.now() });

  } catch (error) {
    console.error('[/api/prices]', error.message);
    // En caso de error parcial, devolver simulados como fallback
    const fallback = Object.fromEntries(symbols.map(s => [s, simulatedQuote(s)]));
    return res.status(200).json({
      quotes: fallback,
      ts: Date.now(),
      warning: 'Datos simulados por error en fuente: ' + error.message,
    });
  }
}
