/**
 * GET /api/dolar
 * Devuelve cotizaciones del dólar: blue, oficial, CCL, MEP
 * Fuente: dolarapi.com — gratis, sin API key
 */
export default async function handler(req, res) {
  // Solo GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://dolarapi.com/v1/dolares', {
      headers: { 'User-Agent': 'PampaTerminal/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`dolarapi status: ${response.status}`);

    const data = await response.json();

    // Mapear casas a claves limpias
    const find = (casa) => data.find(d => d.casa === casa) || null;

    const blue   = find('blue');
    const ccl    = find('contadoconliqui');
    const mep    = find('bolsa');
    const oficial = find('oficial');
    const crypto = find('cripto');

    const result = {
      blue:    blue    ? { compra: blue.compra,    venta: blue.venta,    var: blue.variacion }    : null,
      ccl:     ccl     ? { compra: ccl.compra,     venta: ccl.venta,     var: ccl.variacion }     : null,
      mep:     mep     ? { compra: mep.compra,     venta: mep.venta,     var: mep.variacion }     : null,
      oficial: oficial ? { compra: oficial.compra, venta: oficial.venta, var: oficial.variacion } : null,
      crypto:  crypto  ? { compra: crypto.compra,  venta: crypto.venta,  var: crypto.variacion }  : null,
      // Brecha cambiaria blue vs oficial
      brecha: blue && oficial
        ? (((blue.venta - oficial.venta) / oficial.venta) * 100).toFixed(1)
        : null,
      ts: Date.now(),
      source: 'dolarapi.com',
    };

    // Cache 25s en Vercel Edge
    res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=30');
    return res.status(200).json(result);

  } catch (error) {
    console.error('[/api/dolar]', error.message);
    return res.status(503).json({
      error: 'No se pudo obtener el tipo de cambio',
      detail: error.message,
      ts: Date.now(),
    });
  }
}
