/**
 * GET /api/market
 * Devuelve datos de índices globales y commodities
 *
 * Fuentes:
 *  - Finnhub: S&P 500 (SPY ETF), NASDAQ (QQQ), DOW (DIA)
 *  - Finnhub: Oro (GC1!), WTI (CL1!), Brent (CB1!)
 *  - dolarapi.com: merval (próximamente via IOL/Cocos)
 *
 * Fallback completo si no hay API keys.
 */

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// ETFs como proxies de índices (disponibles en Finnhub gratuito)
const INDEX_SYMBOLS = {
  sp500:  { symbol: 'SPY',  name: 'S&P 500',    mult: 10,  currency: 'USD' },
  nasdaq: { symbol: 'QQQ',  name: 'NASDAQ',      mult: 55,  currency: 'USD' },
  dow:    { symbol: 'DIA',  name: 'DOW JONES',   mult: 100, currency: 'USD' },
};

// Commodities via Finnhub (formato: symbol en Finnhub)
const COMMODITY_SYMBOLS = {
  gold:   { symbol: 'OANDA:XAU_USD', name: 'Oro',   currency: 'USD/oz' },
  silver: { symbol: 'OANDA:XAG_USD', name: 'Plata', currency: 'USD/oz' },
  oil:    { symbol: 'OANDA:BCO_USD', name: 'Brent', currency: 'USD/bbl' },
};

// Valores de referencia para el fallback
const DEFAULTS = {
  merval: { v: 1_872_450, chg: 0.8 },
  sp500:  { v: 5_242.10,  chg: 0.3 },
  nasdaq: { v: 16_455.20, chg: 0.5 },
  dow:    { v: 38_841.50, chg: 0.2 },
  wti:    { v: 82.45,     chg: -0.4 },
  brent:  { v: 86.12,     chg: -0.3 },
  gold:   { v: 3_128.40,  chg: 0.6 },
  silver: { v: 31.82,     chg: 0.4 },
  blue:   { v: 1_278,     chg: 0.1 },
  ccl:    { v: 1_252,     chg: 0.1 },
};

function simulateMarket() {
  const result = {};
  for (const [key, d] of Object.entries(DEFAULTS)) {
    const noise = (Math.random() - 0.48) * 0.8;
    const v = d.v * (1 + noise / 100);
    result[key] = {
      value:     parseFloat(v.toFixed(key === 'merval' ? 0 : 2)),
      change:    parseFloat((d.chg + (Math.random() - 0.5) * 0.5).toFixed(2)),
      source:    'simulated',
    };
  }
  return result;
}

async function fetchFinnhubQuote(symbol, apiKey) {
  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  const d = await res.json();
  return {
    value:  d.c,
    change: d.pc > 0 ? ((d.c - d.pc) / d.pc) * 100 : 0,
    source: 'finnhub',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.FINNHUB_API_KEY;

  try {
    let market;

    if (apiKey && apiKey !== 'tu_key_aqui') {
      // Fetch índices en paralelo (limitado a 5 para no exceder rate limit gratis)
      const [spy, qqq] = await Promise.allSettled([
        fetchFinnhubQuote('SPY', apiKey),
        fetchFinnhubQuote('QQQ', apiKey),
      ]);

      // Dólar desde dolarapi
      const dolarRes = await fetch('https://dolarapi.com/v1/dolares', {
        signal: AbortSignal.timeout(4000),
      }).then(r => r.json()).catch(() => null);

      const blue = dolarRes?.find(d => d.casa === 'blue');
      const ccl  = dolarRes?.find(d => d.casa === 'contadoconliqui');

      // Simular los que no se pudieron obtener
      const sim = simulateMarket();

      market = {
        merval: sim.merval,
        sp500:  spy.status === 'fulfilled'
          ? { value: spy.value.value * 10, change: spy.value.change, source: 'finnhub/SPY' }
          : sim.sp500,
        nasdaq: qqq.status === 'fulfilled'
          ? { value: qqq.value.value * 55, change: qqq.value.change, source: 'finnhub/QQQ' }
          : sim.nasdaq,
        dow:    sim.dow,
        wti:    sim.wti,
        brent:  sim.brent,
        gold:   sim.gold,
        silver: sim.silver,
        blue:   blue  ? { value: blue.venta,  change: blue.variacion || 0, source: 'dolarapi' } : sim.blue,
        ccl:    ccl   ? { value: ccl.venta,   change: ccl.variacion  || 0, source: 'dolarapi' } : sim.ccl,
      };

    } else {
      // Modo simulado completo
      console.warn('[/api/market] Sin API keys — datos simulados');
      market = simulateMarket();
    }

    res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
    return res.status(200).json({ market, ts: Date.now() });

  } catch (error) {
    console.error('[/api/market]', error.message);
    return res.status(200).json({
      market: simulateMarket(),
      ts: Date.now(),
      warning: 'Datos simulados: ' + error.message,
    });
  }
}
