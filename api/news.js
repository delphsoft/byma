/**
 * GET /api/news?ticker=GGAL&sector=Financiero&lang=es
 * Devuelve noticias relevantes para un ticker/sector
 * Requiere: NEWS_API_KEY en .env (gratis: newsapi.org)
 *
 * Fallback: noticias curadas hardcodeadas si no hay API key
 */

const NEWSAPI_BASE = 'https://newsapi.org/v2/everything';

// Mapeo de tickers locales a términos de búsqueda en inglés
const TICKER_QUERIES = {
  GGAL:  'Grupo Galicia Argentina bank',
  YPF:   'YPF Argentina oil energy',
  PAMP:  'Pampa Energia Argentina energy',
  BMA:   'Banco Macro Argentina',
  VIST:  'Vista Energy Vaca Muerta',
  TXAR:  'Ternium Argentina steel',
  ALUA:  'Aluar aluminum Argentina',
  LOMA:  'Loma Negra cement Argentina',
  TGSU2: 'Transportadora Gas Sur Argentina',
  EDN:   'Edenor electricity Argentina',
};

// Queries de sector en español/inglés
const SECTOR_QUERIES = {
  'Financiero':    'Argentina bank financial sector economy',
  'Energía':       'Argentina energy oil gas Vaca Muerta',
  'Tecnología':    'technology AI artificial intelligence stocks',
  'Semiconductores':'semiconductor chip AI data center',
  'E-commerce':   'ecommerce Latin America MercadoLibre',
  'Automotriz':   'electric vehicle EV Tesla automotive',
  'Siderurgia':   'steel industry Argentina Latin America',
  'Metalurgia':   'aluminum metal commodities',
  'Construcción': 'construction cement Argentina',
  'Servicios':    'Argentina utilities energy services',
  'Fintech':      'fintech trading app retail investor',
  'Ciberseguridad':'cybersecurity ransomware enterprise security',
  'Nuclear':      'nuclear energy small modular reactor SMR',
  'Aeroespacial': 'space rocket launch satellite',
  'Bebidas':      'Coca Cola beverage consumer staples',
  'Entretenimiento':'Disney streaming entertainment media',
  'Minería':      'gold silver mining precious metals',
};

// Noticias fallback curadas por categoría
const FALLBACK_NEWS = {
  macro: [
    { title: 'BCRA mantiene tasas: impacto en renta fija y variable local', source: 'Ámbito Financiero', publishedAt: new Date(Date.now()-2*3600000).toISOString(), url: '#', sentiment: 'neutral' },
    { title: 'FMI revisa al alza proyecciones de crecimiento para Argentina en 2025', source: 'Reuters', publishedAt: new Date(Date.now()-5*3600000).toISOString(), url: '#', sentiment: 'positive' },
    { title: 'Reservas internacionales superan USD 30.000M por primera vez desde 2019', source: 'El Cronista', publishedAt: new Date(Date.now()-8*3600000).toISOString(), url: '#', sentiment: 'positive' },
    { title: 'Inflación de marzo confirma tendencia bajista: 3,7% mensual', source: 'INDEC / Infobae', publishedAt: new Date(Date.now()-12*3600000).toISOString(), url: '#', sentiment: 'positive' },
    { title: 'Riesgo país perfora los 600 puntos por primera vez en cinco años', source: 'Bloomberg', publishedAt: new Date(Date.now()-18*3600000).toISOString(), url: '#', sentiment: 'positive' },
  ],
  global: [
    { title: 'Fed mantiene tasas; mercados emergentes reaccionan con alzas moderadas', source: 'Bloomberg', publishedAt: new Date(Date.now()-3*3600000).toISOString(), url: '#', sentiment: 'positive' },
    { title: 'China anuncia estímulos fiscales adicionales; commodities suben', source: 'Reuters', publishedAt: new Date(Date.now()-6*3600000).toISOString(), url: '#', sentiment: 'positive' },
    { title: 'S&P 500 alcanza nuevo máximo histórico impulsado por sector tech', source: 'Wall St. Journal', publishedAt: new Date(Date.now()-9*3600000).toISOString(), url: '#', sentiment: 'positive' },
    { title: 'OPEP+ mantiene recortes de producción; WTI sube 1.8%', source: 'Reuters', publishedAt: new Date(Date.now()-14*3600000).toISOString(), url: '#', sentiment: 'positive' },
  ],
};

function buildFallback(ticker, sector) {
  const items = [...FALLBACK_NEWS.macro, ...FALLBACK_NEWS.global];
  // Agregar noticias de sector si existe
  if (sector && SECTOR_QUERIES[sector]) {
    items.unshift({
      title: `Sector ${sector}: análisis técnico y fundamental de las principales posiciones`,
      source: 'Pampa Terminal Research',
      publishedAt: new Date(Date.now()-1*3600000).toISOString(),
      url: '#',
      sentiment: 'neutral',
    });
  }
  return items.slice(0, 8).map(n => ({
    ...n,
    source: { name: n.source },
    description: null,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ticker = (req.query.ticker || '').toUpperCase();
  const sector = req.query.sector || '';
  const apiKey = process.env.NEWS_API_KEY;

  // Sin API key o en modo fallback
  if (!apiKey || apiKey === 'tu_key_aqui') {
    console.warn('[/api/news] Sin NEWS_API_KEY — usando noticias curadas');
    return res.status(200).json({
      articles: buildFallback(ticker, sector),
      total: 8,
      source: 'curated_fallback',
      ts: Date.now(),
    });
  }

  try {
    // Construir query: ticker específico o sector
    const q = TICKER_QUERIES[ticker]
      || SECTOR_QUERIES[sector]
      || `Argentina stock market ${ticker}`;

    const url = new URL(NEWSAPI_BASE);
    url.searchParams.set('q', q);
    url.searchParams.set('language', 'en');
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', '8');
    url.searchParams.set('apiKey', apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`NewsAPI ${response.status}`);

    const data = await response.json();

    // Clasificación de sentimiento muy básica por palabras clave en título
    const articles = (data.articles || []).map(a => {
      const t = (a.title || '').toLowerCase();
      const sentiment =
        t.includes('sube') || t.includes('gana') || t.includes('record') || t.includes('alza') || t.includes('rally') || t.includes('surge') ? 'positive' :
        t.includes('baja') || t.includes('cae') || t.includes('pierde') || t.includes('riesgo') || t.includes('crisis') || t.includes('drop') || t.includes('fall') ? 'negative' :
        'neutral';
      return { ...a, sentiment };
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600'); // 5 min cache
    return res.status(200).json({
      articles,
      total: data.totalResults,
      source: 'newsapi',
      ts: Date.now(),
    });

  } catch (error) {
    console.error('[/api/news]', error.message);
    return res.status(200).json({
      articles: buildFallback(ticker, sector),
      total: 8,
      source: 'curated_fallback',
      warning: error.message,
      ts: Date.now(),
    });
  }
}
