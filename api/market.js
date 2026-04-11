/**
 * GET /api/market
 * Índices globales y commodities — sin API key.
 * Fuentes: Yahoo Finance (índices/commodities) + dolarapi.com (FX)
 */

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// Símbolos de Yahoo para cada índice/commodity
const YAHOO_SYMBOLS = {
  sp500:  '^GSPC',   // S&P 500
  nasdaq: '^IXIC',   // NASDAQ Composite
  dow:    '^DJI',    // Dow Jones
  wti:    'CL=F',    // WTI Crude Oil Futures
  brent:  'BZ=F',    // Brent Crude Futures
  gold:   'GC=F',    // Gold Futures
  silver: 'SI=F',    // Silver Futures
  merval: '^MERV',   // MERVAL
};

const DEFAULTS = {
  merval: 1_872_450, sp500: 5_242, nasdaq: 16_455,
  dow: 38_841,       wti: 82.45,   brent: 86.12,
  gold: 3_128,       silver: 31.82,
  blue: 1_278,       ccl: 1_252,
};

async function fetchYahooIndex(key, yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`;
  const res = await fetch(url, {
    headers: YAHOO_HEADERS,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status} para ${yahooSymbol}`);
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`Sin meta para ${yahooSymbol}`);
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
  return {
    value:   parseFloat(price.toFixed(key === 'merval' ? 0 : 2)),
    change:  parseFloat(changePct.toFixed(2)),
    source:  'yahoo',
  };
}

function simulated(key) {
  const base = DEFAULTS[key] || 100;
  const chg  = (Math.random() - 0.48) * 1.4;
  return {
    value:  parseFloat((base * (1 + chg / 100)).toFixed(key === 'merval' ? 0 : 2)),
    change: parseFloat(chg.toFixed(2)),
    source: 'simulated',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Fetch Yahoo indices en paralelo + dolar API
  const [yahooResults, dolarData] = await Promise.all([
    Promise.allSettled(
      Object.entries(YAHOO_SYMBOLS).map(async ([key, sym]) => {
        try {
          const data = await fetchYahooIndex(key, sym);
          return [key, data];
        } catch (e) {
          console.warn(`[market] Yahoo falló para ${key}: ${e.message}`);
          return [key, simulated(key)];
        }
      })
    ),
    fetch('https://dolarapi.com/v1/dolares', {
      headers: { 'User-Agent': 'PampaTerminal/1.0' },
      signal: AbortSignal.timeout(5000),
    }).then(r => r.json()).catch(() => null),
  ]);

  // Armar objeto market desde Yahoo
  const market = {};
  for (const result of yahooResults) {
    if (result.status === 'fulfilled') {
      const [key, data] = result.value;
      market[key] = data;
    }
  }

  // Agregar dólar desde dolarapi
  if (dolarData) {
    const blue = dolarData.find(d => d.casa === 'blue');
    const ccl  = dolarData.find(d => d.casa === 'contadoconliqui');
    market.blue = blue ? { value: blue.venta,  change: blue.variacion  || 0, source: 'dolarapi' } : simulated('blue');
    market.ccl  = ccl  ? { value: ccl.venta,   change: ccl.variacion   || 0, source: 'dolarapi' } : simulated('ccl');
  } else {
    market.blue = simulated('blue');
    market.ccl  = simulated('ccl');
  }

  // Cualquier clave que haya fallado → simulada
  for (const key of [...Object.keys(YAHOO_SYMBOLS), 'blue', 'ccl']) {
    if (!market[key]) market[key] = simulated(key);
  }

  res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
  return res.status(200).json({ market, ts: Date.now() });
}
