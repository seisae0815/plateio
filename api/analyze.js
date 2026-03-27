export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
 
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL fehlt' });
  }
 
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key nicht konfiguriert' });
  }
 
  const prompt = `Du bist ein Rezept-Extraktor für eine Meal-Planning App. Der Nutzer hat folgenden Link geteilt: ${url}
 
Analysiere den Link und erstelle ein passendes, realistisches Rezept auf Deutsch.
 
Antworte NUR mit einem JSON-Objekt (kein anderer Text, keine Markdown-Backticks):
{
  "title": "Rezepttitel auf Deutsch",
  "ingredients": "Menge Zutat 1\\nMenge Zutat 2\\nMenge Zutat 3",
  "steps": "1. Schritt\\n2. Schritt\\n3. Schritt",
  "notes": "Optionaler Tipp",
  "portions": 2
}
 
Regeln:
- Titel prägnant und appetitlich
- Zutaten mit konkreten Mengenangaben, eine pro Zeile
- Schritte nummeriert, klar und verständlich
- notes kann leer sein ("")
- Immer auf Deutsch`;
 
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }]
      })
    });
 
    if (!response.ok) {
      const err = await response.json();
      const msg = err.error?.message || 'OpenAI Fehler';
      if (response.status === 429) {
        return res.status(429).json({ error: 'Guthaben aufgebraucht — bitte OpenAI Konto aufladen' });
      }
      return res.status(response.status).json({ error: msg });
    }
 
    const data = await response.json();
    const raw = data.choices[0].message.content.trim();
 
    // JSON extrahieren (falls Backticks etc. dabei)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Ungültiges Antwortformat von KI' });
    }
 
    const recipe = JSON.parse(jsonMatch[0]);
    return res.status(200).json(recipe);
 
  } catch (e) {
    console.error('Analyze error:', e);
    return res.status(500).json({ error: e.message || 'Unbekannter Fehler' });
  }
}
 
