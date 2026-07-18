'use strict';

/**
 * services/agendaAI.js
 * Responsabilidad: Detectar intención de cita usando OpenRouter (AI).
 * Si la API falla, cae a detección por Regex como fallback.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL     = 'https://openrouter.ai/api/v1/chat/completions';
const AI_MODEL           = 'meta-llama/llama-3.1-8b-instruct:free'; // modelo gratuito

// ── Fallback Regex ────────────────────────────────────────────
const PATRON_CITA = /\b(?:nos\s+vemos|quedamos|reuni[oó]n|junta|cita|llamada|videollamada|meet(?:ing)?|agend(?:ar)?|vemos|vernos|pasamos)\b[^.!?]{0,80}\b(ma[nñ]ana|hoy|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b[^.!?]{0,40}\ba\s+las?\s+(\d{1,2}(?::\d{2})?)\s*(am|pm|hrs?|h)?\b/i;

function detectarCitaRegex(texto) {
  const match = texto.match(PATRON_CITA);
  if (!match) return null;

  const dia  = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const hora = match[2] + (match[3] ? ' ' + match[3].toLowerCase().replace(/\./g, '') : ':00 hrs');

  return { dia, hora };
}

// ── Detección con IA via OpenRouter ──────────────────────────
const SYSTEM_PROMPT = `Eres un extractor de eventos de calendario.
Analiza el siguiente mensaje de chat y determina si contiene una cita, reunión, encuentro o evento agendado.
Responde SOLO con un JSON válido en este formato exacto:
{"detectado": true, "dia": "Mañana", "hora": "10:00 hrs", "titulo": "texto resumido del evento"}
Si NO hay ninguna cita o evento, responde SOLO:
{"detectado": false}
No escribas nada más, solo el JSON.`;

/**
 * Analiza un mensaje con IA y retorna { detectado, dia, hora, titulo } o null.
 * @param {string} texto
 * @returns {Promise<{dia:string, hora:string, titulo:string}|null>}
 */
async function detectarCitaIA(texto) {
  if (!OPENROUTER_API_KEY) {
    console.warn('[AgendaAI] Sin OPENROUTER_API_KEY — usando fallback Regex.');
    return detectarCitaRegex(texto);
  }

  try {
    const res = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'https://slackc.onrender.com',
        'X-Title':       'SlackC',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system',  content: SYSTEM_PROMPT },
          { role: 'user',    content: texto },
        ],
        temperature: 0,
        max_tokens:  80,
      }),
      signal: AbortSignal.timeout(6000), // 6 seg timeout
    });

    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);

    const json = await res.json();
    const raw  = json.choices?.[0]?.message?.content?.trim() || '';

    // Extraer JSON de la respuesta (puede venir con ```json ... ```)
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();
    const parsed  = JSON.parse(jsonStr);

    if (!parsed.detectado) return null;

    return {
      dia:    parsed.dia    || 'Sin fecha',
      hora:   parsed.hora   || 'Sin hora',
      titulo: parsed.titulo || texto.slice(0, 80),
    };

  } catch (err) {
    console.warn('[AgendaAI] Error IA:', err.message, '— usando fallback Regex.');
    // Fallback: Regex
    const cita = detectarCitaRegex(texto);
    if (!cita) return null;
    return { ...cita, titulo: texto.slice(0, 80) };
  }
}

module.exports = { detectarCitaIA };
