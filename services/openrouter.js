const fs = require('fs');
const path = require('path');

// Read knowledge base
const knowledgePath = path.join(__dirname, '../data/knowledge.json');
const knowledgeData = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
const knowledgeString = JSON.stringify(knowledgeData, null, 2);

const systemPrompt = `Crea un calendario semanal interactivo usando CSS Grid. Genera un JSON con eventos falsos para 3 usuarios diferentes, asignando un color a cada usuario. Añade una funcionalidad donde, al seleccionar a múltiples usuarios en un menú lateral, la interfaz atenúe todos los eventos existentes y resalte visualmente los bloques de horas que están completamente vacíos para todos los usuarios seleccionados.
`;

/**
 * Detects if the user message contains elements of prompt injection or extraction.
 * @param {string} userMessage - The message sent by the user.
 * @returns {boolean} True if a prompt injection/leaking attempt is detected, false otherwise.
 */
function detectPromptInjection(userMessage) {
    if (!userMessage || typeof userMessage !== 'string') return false;

    // Normalize to lower case, remove accents/diacritics, and trim whitespace
    const normalized = userMessage
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // removes accents (e.g. "promp" from "prómp")
        .trim();

    // Comprehensive list of regular expressions targeting prompt injection, leaking, roleplaying, or instruction-override attempts
    const injectionPatterns = [
        // Prompt leaking / extraction patterns
        /system\s*prompt/i,
        /prompt\s*system/i,
        /promp\s*system/i,
        /system\s*promp/i,
        /prompt\s*de\s*sistema/i,
        /instrucciones\s*del?\s*sistema/i,
        /instrucciones\s*iniciales/i,
        /dame\s+tu\s+prompt/i,
        /dame\s+tu\s+promp/i,
        /cu[aá]l\s+es\s+tu\s+prompt/i,
        /cu[aá]l\s+es\s+tu\s+promp/i,
        /dime\s+tu\s+prompt/i,
        /dime\s+tu\s+promp/i,
        /revela\s+tu\s+prompt/i,
        /revela\s+tu\s+promp/i,
        /mu[eé]strame\s+tu\s+prompt/i,
        /mu[eé]strame\s+tu\s+promp/i,
        /dame\s+tus\s+instrucciones/i,
        /dame\s+las\s+instrucciones/i,
        /system\s*instructions/i,
        /what\s+is\s+your\s+prompt/i,
        /show\s+your\s+prompt/i,
        /reveal\s+your\s+prompt/i,
        /reproduce\s+the\s+system/i,
        /output\s+the\s+system/i,
        /first\s+line\s+of\s+your\s+prompt/i,
        /primera\s+l[ií]nea\s+de\s+tu\s+prompt/i,
        /texto\s+anterior\s+a\s+este/i,
        /texto\s+de\s+arriba/i,

        // Command overriding / Jailbreaking patterns
        /ignore\s+previous\s+instructions/i,
        /ignore\s+all\s+instructions/i,
        /ignore\s+the\s+above/i,
        /ignore\s+instructions/i,
        /ignora\s+las\s+instrucciones/i,
        /ignora\s+lo\s+anterior/i,
        /ignora\s+las\s+reglas/i,
        /ignora\s+las\s+restricciones/i,
        /olvida\s+las\s+instrucciones/i,
        /olvida\s+las\s+reglas/i,
        /olvida\s+lo\s+anterior/i,
        /olvida\s+todo\s+lo\s+anterior/i,
        /olvida\s+tu\s+programaci[oó]n/i,
        /bypass\s+instructions/i,
        /bypass\s+restrictions/i,
        /developer\s+mode/i,
        /modo\s+desarrollador/i,
        /jailbreak/i,
        /sin\s+restricciones/i,
        /libre\s+de\s+restricciones/i,
        /sin\s+reglas/i,
        /sin\s+limites/i,
        /asistente\s+libre/i,
        /unrestricted/i,
        /no\s+rules/i,
        /no\s+restrictions/i,

        // Roleplaying / Identity manipulation
        /act\s+as\s+/i,
        /act[uú]a\s+como\s+/i,
        /eres\s+ahora\s+/i,
        /you\s+are\s+now\s+/i,
        /dejas\s+de\s+ser\s+/i,
        /you\s+are\s+no\s+longer\s+/i,
        /responde\s+como\s+/i,
        /contesta\s+como\s+/i
    ];

    return injectionPatterns.some(pattern => pattern.test(normalized));
}
