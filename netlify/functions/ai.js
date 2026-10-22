// NOVA SmartMenu: AI-functie (Netlify).
// - actie 'vraag':   een gast stelt een vraag over het menu van één restaurant.
// - actie 'vertaal': een ingelogde eigenaar laat teksten vertalen in de beheerpagina.
//
// Nodig in Netlify (Site configuration → Environment variables):
//   OPENAI_API_KEY             je OpenAI-sleutel (geheim!)
//   SUPABASE_URL               bijvoorbeeld https://abcdefgh.supabase.co
//   SUPABASE_PUBLISHABLE_KEY   de publieke sleutel (sb_publishable_…)

const MODEL = 'gpt-5-mini';
const TALEN = { nl: 'Dutch', en: 'English', fr: 'French', ar: 'Arabic' };

// Het demomenu (NOVA GRILL) voor de demo zonder restaurantlink.
const DEMO = [
  { name: 'NOVA Smash', price: 12.95, category: 'Burgers', labels: ['beef'], description: 'Double smashed beef burger, cheddar, caramelized onion, pickle, NOVA sauce.' },
  { name: 'Spicy Chicken', price: 11.95, category: 'Burgers', labels: ['chicken', 'spicy'], description: 'Crispy chicken, lettuce, jalapeño, cheddar, spicy mayo.' },
  { name: 'Truffle Burger', price: 14.50, category: 'Burgers', labels: ['beef'], description: 'Beef burger, cheddar, mushrooms, caramelized onion, creamy truffle sauce.' },
  { name: 'Chicken Grill', price: 16.95, category: 'Grill', labels: ['chicken'], description: 'Grilled chicken breast, fresh herbs, fries, salad.' },
  { name: 'Mixed Grill', price: 22.95, category: 'Grill', labels: ['chicken', 'beef', 'lamb'], description: 'Chicken, seasoned beef and lamb with fries, salad and sauces.' },
  { name: 'NOVA Steak', price: 24.95, category: 'Grill', labels: ['beef'], description: 'Grilled steak with herb butter, fries and salad.' },
  { name: 'Cheesy Loaded', price: 7.95, category: 'Loaded fries', labels: ['vegetarian'], description: 'Fries, cheddar, crispy onion, house sauce.' },
  { name: 'Spicy Chicken Loaded', price: 9.95, category: 'Loaded fries', labels: ['chicken', 'spicy'], description: 'Fries, crispy chicken, jalapeño, cheddar and spicy mayo.' },
  { name: 'Coca-Cola', price: 3.25, category: 'Drinks', labels: ['drink'], description: 'Cold soft drink.' },
  { name: 'Spa Blauw', price: 2.75, category: 'Drinks', labels: ['drink'], description: 'Mineral water.' },
  { name: 'Homemade Lemonade', price: 4.50, category: 'Drinks', labels: ['drink'], description: 'Fresh homemade lemonade.' }
];
const LABEL_EN = { kip: 'chicken', rund: 'beef', lam: 'lamb', vis: 'fish', pittig: 'spicy', vega: 'vegetarian', vegan: 'vegan', halal: 'halal', drank: 'drink' };

const json = (statusCode, data) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

function supa() {
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
}

async function rest(pad) {
  const { url, key } = supa();
  const res = await fetch(`${url}/rest/v1/${pad}`, { headers: { apikey: key } });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

// Haalt het actuele menu van één restaurant op (alleen beschikbare gerechten).
async function haalMenu(slug) {
  if (!slug || slug === 'demo') return { naam: 'NOVA GRILL', aiAan: true, menu: DEMO };
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const r = await rest(`restaurants?slug=eq.${encodeURIComponent(slug)}&select=id,naam,ai_aan`);
  if (!r.length) return null;
  const id = encodeURIComponent(r[0].id);
  const [cats, dishes] = await Promise.all([
    rest(`categorieen?restaurant_id=eq.${id}&select=id,naam`),
    rest(`gerechten?restaurant_id=eq.${id}&beschikbaar=eq.true&select=naam,prijs,beschrijving,labels,categorie_id&order=volgorde.asc`)
  ]);
  const catNaam = Object.fromEntries(cats.map(c => [c.id, c.naam?.nl || c.naam?.en || '']));
  return {
    naam: r[0].naam,
    aiAan: r[0].ai_aan,
    menu: dishes.map(g => ({
      name: g.naam,
      price: Number(g.prijs),
      category: catNaam[g.categorie_id] || '',
      labels: (g.labels || []).map(l => LABEL_EN[l] || l),
      description: g.beschrijving?.en || g.beschrijving?.nl || ''
    }))
  };
}

async function openai(instructions, input, extra = {}) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, instructions, input, store: false, ...extra })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'OpenAI request failed');
  const tekst = data.output_text ??
    (data.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('');
  return tekst;
}

async function vraag(body) {
  const message = String(body.message || '').trim().slice(0, 300);
  if (!message) return json(400, { error: 'Missing message' });
  const language = TALEN[body.language] ? body.language : 'nl';

  const info = await haalMenu(String(body.restaurant || 'demo').toLowerCase());
  if (!info) return json(404, { error: 'Restaurant niet gevonden' });
  if (!info.aiAan) return json(403, { error: 'AI staat uit voor dit restaurant' });

  const instructions = `
You are NOVA AI, the menu assistant of the restaurant "${info.naam}".
Reply in ${TALEN[language]}.
Use ONLY the menu below for dishes, prices and ingredients. Never invent menu information.
If something is not on the menu, say so kindly.
You may calculate combinations and totals. Prices are in euros.
For allergies, never claim a dish is safe; tell the guest to confirm allergens with restaurant staff.
Only talk about this menu and this restaurant. Keep answers short, friendly and practical.

MENU:
${JSON.stringify(info.menu)}
`;
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6).map(x => ({
    role: x?.role === 'assistant' ? 'assistant' : 'user',
    content: String(x?.content || '').slice(0, 1000)
  }));
  const answer = await openai(instructions, [...history, { role: 'user', content: message }], { max_output_tokens: 350 });
  return json(200, { answer: answer || '…' });
}

// Alleen voor ingelogde eigenaren: controleer het inlogtoken bij Supabase.
async function isIngelogd(event) {
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const { url, key } = supa();
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return res.ok;
}

async function vertaal(event, body) {
  if (!(await isIngelogd(event))) return json(401, { error: 'Log opnieuw in' });
  const teksten = (Array.isArray(body.teksten) ? body.teksten : []).slice(0, 20).map(t => String(t || '').slice(0, 600));
  const naar = (Array.isArray(body.naar) ? body.naar : []).filter(t => TALEN[t] && t !== 'nl');
  if (!teksten.length || !naar.length) return json(400, { error: 'Niets te vertalen' });

  const instructions = `
You translate restaurant menu texts from Dutch.
Return ONLY a JSON object with these keys: ${naar.map(t => `"${t}"`).join(', ')}.
Each key holds an array with exactly ${teksten.length} translations, in the same order as the input.
Languages: ${naar.map(t => `${t} = ${TALEN[t]}`).join(', ')}.
Keep dish names, brand names and emojis as they are. Keep it natural and appetizing. Empty input stays empty.
`;
  const uit = await openai(instructions, JSON.stringify(teksten), { text: { format: { type: 'json_object' } }, max_output_tokens: 2500 });
  let vertaling;
  try {
    vertaling = JSON.parse(uit);
  } catch (e) {
    const m = uit.match(/\{[\s\S]*\}/);
    vertaling = m ? JSON.parse(m[0]) : {};
  }
  const resultaat = {};
  for (const t of naar) {
    const lijst = Array.isArray(vertaling[t]) ? vertaling[t] : [];
    resultaat[t] = teksten.map((_, i) => String(lijst[i] ?? ''));
  }
  return json(200, { vertalingen: resultaat });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!process.env.OPENAI_API_KEY) return json(500, { error: 'OPENAI_API_KEY ontbreekt' });
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.actie === 'vertaal') {
      if (!supa().url || !supa().key) return json(500, { error: 'SUPABASE_URL of SUPABASE_PUBLISHABLE_KEY ontbreekt' });
      return await vertaal(event, body);
    }
    if (body.restaurant && body.restaurant !== 'demo' && (!supa().url || !supa().key)) {
      return json(500, { error: 'SUPABASE_URL of SUPABASE_PUBLISHABLE_KEY ontbreekt' });
    }
    return await vraag(body);
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message });
  }
};
