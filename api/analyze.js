export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, caption } = req.body;
  if (!url) return res.status(400).json({ error: 'URL fehlt' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key nicht konfiguriert' });

  let prompt;

  if (caption && caption.length > 20) {
    prompt = `Du bist ein Rezept-Extraktor für eine Meal-Planning App.

Der Nutzer hat folgenden Instagram/Pinterest/Facebook Post-Text kopiert:

"""
${caption}
"""

Extrahiere daraus das Rezept und antworte NUR mit einem JSON-Objekt (kein anderer Text, keine Backticks):
{
  "title": "Prägnanter Rezepttitel auf Deutsch",
  "ingredients": "Menge Zutat 1\\nMenge Zutat 2\\nMenge Zutat 3",
  "steps": "1. Schritt\\n2. Schritt\\n3. Schritt",
  "notes": "Optionaler Tipp aus dem Post",
  "portions": 2
}

Regeln:
- Extrahiere nur was wirklich im Text steht
- Übersetze ins Deutsche falls nötig
- Zutaten mit konkreten Mengenangaben, eine pro Zeile
- Schritte nummeriert und klar
- notes: hilfreiche Tipps aus dem Post, oder "" wenn keine vorhanden
- portions: Portionenanzahl aus dem Text, sonst 2`;
  } else {
    prompt = `Du bist ein Rezept-Extraktor für eine Meal-Planning App.

Der Nutzer hat folgenden Link geteilt: ${url}

Erstelle ein realistisches Rezept das zum Link passt und antworte NUR mit einem JSON-Objekt (kein anderer Text, keine Backticks):
{
  "title": "Prägnanter Rezepttitel auf Deutsch",
  "ingredients": "Menge Zutat 1\\nMenge Zutat 2\\nMenge Zutat 3",
  "steps": "1. Schritt\\n2. Schritt\\n3. Schritt",
  "notes": "",
  "portions": 2
}

Regeln:
- Titel appetitlich auf Deutsch
- Zutaten mit Mengenangaben, eine pro Zeile
- Schritte nummeriert
- Realistisches Rezept für 2 Personen`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      if (response.status === 429) {
        return res.status(429).json({ error: 'Guthaben aufgebraucht' });
      }
      return res.status(response.status).json({ error: err.error?.message || 'OpenAI Fehler' });
    }

    const data = await response.json();
    const raw = data.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Ungültiges Antwortformat' });

    const recipe = JSON.parse(jsonMatch[0]);
    return res.status(200).json(recipe);

  } catch (e) {
    console.error('Analyze error:', e);
    return res.status(500).json({ error: e.message || 'Unbekannter Fehler' });
  }
}
