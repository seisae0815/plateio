export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, caption } = req.body;
  if (!url) return res.status(400).json({ error: 'URL fehlt' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const apifyToken = process.env.APIFY_API_TOKEN;

  if (!openaiKey) return res.status(500).json({ error: 'OpenAI API Key nicht konfiguriert' });

  let captionText = caption || '';

  // ── APIFY: Instagram Caption holen ──
  const isInstagram = url.includes('instagram.com');
  if (isInstagram && apifyToken && captionText.length < 20) {
    try {
      // Instagram Scraper — optimiert für einzelne Posts
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${apifyToken}&timeout=45&memory=256`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directUrls: [url],
            resultsType: 'posts',
            resultsLimit: 1,
            addParentData: false
          })
        }
      );

      if (runRes.ok) {
        const posts = await runRes.json();
        if (posts && posts.length > 0) {
          // Caption kann in verschiedenen Feldern liegen
          captionText = posts[0].caption || posts[0].text || posts[0].description || '';
          console.log('Apify caption gefunden, Länge:', captionText.length);
        } else {
          console.log('Apify: keine Posts zurückgegeben');
        }
      } else {
        const errText = await runRes.text();
        console.log('Apify HTTP Fehler:', runRes.status, errText.substring(0, 200));
      }
    } catch (e) {
      console.log('Apify Fehler:', e.message);
    }
  }

  // ── OPENAI: Rezept generieren ──
  let prompt;

  if (captionText && captionText.length > 20) {
    prompt = `Du bist ein Rezept-Extraktor für eine Meal-Planning App.

Folgender Text stammt aus einem Instagram/Pinterest/Facebook Post:

"""
${captionText.substring(0, 3000)}
"""

Extrahiere daraus das Rezept. Antworte NUR mit einem JSON-Objekt (kein Text davor/danach, keine Backticks):
{
  "title": "Prägnanter Rezepttitel auf Deutsch",
  "ingredients": "Menge Zutat 1\\nMenge Zutat 2\\nMenge Zutat 3",
  "steps": "1. Schritt\\n2. Schritt\\n3. Schritt",
  "notes": "Tipp aus dem Post oder leer",
  "portions": 2
}`;
  } else {
    prompt = `Du bist ein Rezept-Extraktor für eine Meal-Planning App.

Link: ${url}

Erstelle ein passendes Rezept. Antworte NUR mit einem JSON-Objekt (kein Text davor/danach, keine Backticks):
{
  "title": "Rezepttitel auf Deutsch",
  "ingredients": "Menge Zutat 1\\nMenge Zutat 2\\nMenge Zutat 3",
  "steps": "1. Schritt\\n2. Schritt\\n3. Schritt",
  "notes": "",
  "portions": 2
}`;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
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
    recipe._source = captionText.length > 20 ? 'apify' : 'generated';
    return res.status(200).json(recipe);

  } catch (e) {
    console.error('OpenAI Fehler:', e);
    return res.status(500).json({ error: e.message || 'Unbekannter Fehler' });
  }
}
