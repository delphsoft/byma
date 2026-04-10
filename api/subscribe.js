/**
 * POST /api/subscribe
 * Body: { email: string, src?: string }
 *
 * Guarda el email en Vercel KV (si está configurado)
 * Fallback: log en consola (sirve para desarrollo)
 *
 * Para activar Vercel KV:
 *   1. Ir a tu proyecto en vercel.com → Storage → Create KV Database
 *   2. Conectarlo al proyecto → las env vars se agregan solas
 */

// Validación de email simple pero sólida
function isValidEmail(email) {
  return typeof email === 'string'
    && email.length >= 5
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Parse body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Body JSON inválido' });
  }

  const { email, src = 'unknown', ts } = body || {};

  // Validar email
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  const record = {
    email: email.toLowerCase().trim(),
    src,
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
    ua: req.headers['user-agent'] || '',
    subscribedAt: ts || new Date().toISOString(),
  };

  try {
    // ── Opción A: Vercel KV (recomendado en producción) ──────────────────
    // Vercel KV se instala automáticamente si configuraste el Storage.
    // El paquete @vercel/kv se importa dinámicamente para no romper
    // cuando no está disponible (desarrollo sin KV).
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (kvUrl && kvToken) {
      const { kv } = await import('@vercel/kv');

      // Usamos un SET con la clave `subscriber:email` para deduplicar
      const key = `subscriber:${record.email}`;
      const exists = await kv.exists(key);

      if (!exists) {
        await kv.set(key, JSON.stringify(record));
        // También guardamos en una lista ordenada por timestamp
        await kv.lpush('subscribers:list', record.email);
        console.log(`[subscribe] Nuevo suscriptor: ${record.email} | src: ${src}`);
      } else {
        console.log(`[subscribe] Ya registrado: ${record.email}`);
      }

      return res.status(200).json({ ok: true, message: 'Registrado correctamente' });
    }

    // ── Opción B: Sin KV — solo log (desarrollo) ─────────────────────────
    console.log('[subscribe] Sin Vercel KV — registro local:', JSON.stringify(record));
    return res.status(200).json({
      ok: true,
      message: 'Registrado (modo desarrollo — configurá Vercel KV para persistencia)',
    });

  } catch (error) {
    console.error('[/api/subscribe]', error.message);
    return res.status(500).json({ error: 'Error al guardar el email. Intentá de nuevo.' });
  }
}
