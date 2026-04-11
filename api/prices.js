/**
 * GET /api/prices?symbols=AAPL,MSFT,NVDA
 *
 * Precios en tiempo real via Yahoo Finance — sin API key.
 * Fallback automático por símbolo si Yahoo no responde.
 */

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

const BASE_PRICES = {
  AAPL: 185.2, GOOGL: 152.8, MSFT: 221.0, TSLA: 124.4,
  AMZN: 198.0, META:   93.5, NVDA: 142.5, KO:    67.8,
  DIS:  104.5, BABA:   89.2, GOLD:  18.5, MELI: 245.0,
  HOOD:  32.8, CRWD:  389.0, OKLO:  15.8, RKLB:  28.9, ALAB: 89.2,
};

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
  const res = await fetch(url, {
    headers: YAHOO_HEADERS,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status} para ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Sin datos para ${symbol}`);
  const meta      = result.meta;
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const change    = price - prevClose;
  return {
    symbol,
    price:      parseFloat(price.toFixed(2)),
    prevClose:  parseFloat(prevClose.toFixed(2)),
    open:       parseFloat((meta.regularMarketOpen    || price).toFixed(2)),
    high:       parseFloat((meta.regularMarketDayHigh || price).toFixed(2)),
    low:        parseFloat((meta.regularMarketDayLow  || price).toFixed(2)),
    volume:     meta.regularMarketVolume || 0,
    change:     parseFloat(change.toFixed(2)),
    changePct:  parseFloat((prevClose > 0 ? (change / prevClose) * 100 : 0).toFixed(3)),
    currency:   meta.currency || 'USD',
    marketState: meta.marketState || 'CLOSED',
    ts:         Date.now(),
    source:     'yahoo',
  };
}

function simulatedQuote(symbol) {
  const base  = BASE_PRICES[symbol] || 100;
  const pct   = (Math.random() - 0.48) * 3;
  const price = parseFloat((base * (1 + pct / 100)).toFixed(2));
  return {
    symbol,
    price,
    prevClose:  base,
    open:       parseFloat((base * (1 + (Math.random() - 0.5) * 0.008)).toFixed(2)),
    high:       parseFloat((price * (1 + Math.random() * 0.012)).toFixed(2)),
    low:        parseFloat((price * (1 - Math.random() * 0.012)).toFixed(2)),
    volume:     Math.floor(500000 + Math.random() * 5000000),
    change:     parseFloat((price - base).toFixed(2)),
    changePct:  parseFloat(pct.toFixed(3)),
    currency:   'USD',
    marketState: 'SIMULATED',
    ts:         Date.now(),
    source:     'simulated',
  };
}

async function fetchWithFallback(symbol) {
  try {
    return await fetchYahoo(symbol);
  } catch (err) {
    console.warn(`[prices] Yahoo falló para ${symbol}: ${err.message}`);
    return simulatedQuote(symbol);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbols = (req.query.symbols || '').toString()
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  if (!symbols.length) return res.status(400).json({ error: 'symbols requerido. Ej: ?symbols=AAPL,MSFT' });
  if (symbols.length > 20) return res.status(400).json({ error: 'Máximo 20 símbolos.' });

  const quotes = await Promise.all(symbols.map(fetchWithFallback));
  const result = Object.fromEntries(quotes.map(q => [q.symbol, q]));
  const src    = quotes.every(q => q.source === 'simulated') ? 'simulated'
               : quotes.some(q => q.source === 'yahoo') ? 'yahoo' : 'mixed';

  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
  return res.status(200).json({ quotes: result, source: src, ts: Date.now() });
}
