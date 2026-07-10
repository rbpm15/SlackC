const fs = require('fs');
const path = require('path');

// Read knowledge base
const knowledgePath = path.join(__dirname, '../data/knowledge.json');
const knowledgeData = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
const knowledgeString = JSON.stringify(knowledgeData, null, 2);

const systemPrompt = `Eres GymBot, el asistente oficial de Fitness Pro Gym.
Tu personalidad es:
- amable
- profesional
- breve
- clara
- siempre saludas

IMPORTANTE
Responde únicamente usando la información proporcionada.
Si la respuesta no aparece en la base de conocimiento debes responder exactamente:
"Lo siento, no cuento con esa información. Si necesitas más detalles, comunícate con la recepción del gimnasio."
Nunca inventes información.
No hagas suposiciones.

La siguiente es la base de conocimiento:
${knowledgeString}
`;

async function getChatResponse(userMessage) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not defined in environment variables');
    }

    // Using a reliable free model from OpenRouter
    const model = process.env.OPENROUTER_MODEL || "z-ai/glm-4.7-flash";

    try {
        // We'll use the native fetch API available in Node 18+
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000", // Required by OpenRouter for free models
                "X-Title": "Fitness Pro Gym Bot"
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: 0.2 // low temperature for factual responses
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouter API Error:", errorText);
            throw new Error(`OpenRouter API responded with status ${response.status}`);
        }

        const data = await response.json();

        if (data && data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            return "Lo siento, ha ocurrido un error al procesar tu solicitud.";
        }
    } catch (error) {
        console.error("Error connecting to OpenRouter:", error);
        throw error;
    }
}

module.exports = {
    getChatResponse
};
