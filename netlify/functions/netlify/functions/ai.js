const MENU = [
  {name:"NOVA Smash",price:12.95,category:"burger",description:"Double smashed beef burger, cheddar, caramelized onion, pickle, NOVA sauce."},
  {name:"Spicy Chicken",price:11.95,category:"burger",description:"Crispy chicken, lettuce, jalapeño, cheddar, spicy mayo."},
  {name:"Truffle Burger",price:14.50,category:"burger",description:"Beef burger, cheddar, mushrooms, caramelized onion, creamy truffle sauce."},
  {name:"Chicken Grill",price:16.95,category:"grill",description:"Grilled chicken breast, fresh herbs, fries, salad."},
  {name:"Mixed Grill",price:22.95,category:"grill",description:"Chicken, seasoned beef and lamb with fries, salad and sauces."},
  {name:"NOVA Steak",price:24.95,category:"grill",description:"Grilled steak with herb butter, fries and salad."},
  {name:"Cheesy Loaded",price:7.95,category:"loaded fries",description:"Fries, cheddar, crispy onion, house sauce."},
  {name:"Spicy Chicken Loaded",price:9.95,category:"loaded fries",description:"Fries, crispy chicken, jalapeño, cheddar and spicy mayo."},
  {name:"Coca-Cola",price:3.25,category:"drink",description:"Cold soft drink."},
  {name:"Spa Blauw",price:2.75,category:"drink",description:"Mineral water."},
  {name:"Homemade Lemonade",price:4.50,category:"drink",description:"Fresh homemade lemonade."}
];

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { message, language = "nl", history = [] } =
      JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing message" })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OPENAI_API_KEY ontbreekt" })
      };
    }

    const languages = {
      nl: "Dutch",
      en: "English",
      fr: "French",
      ar: "Arabic"
    };

    const instructions = `
You are NOVA AI, a restaurant menu assistant.
Reply in ${languages[language] || "Dutch"}.
Use ONLY the menu below for dishes, prices and ingredients.
Never invent menu information.
You may calculate combinations and totals.
For allergies, never claim a dish is safe.
Tell the customer to confirm allergens with restaurant staff.
Keep answers short, friendly and practical.

MENU:
${JSON.stringify(MENU)}
`;

    const input = [
      ...history.slice(-6).map(x => ({
        role: x.role === "assistant" ? "assistant" : "user",
        content: x.content
      })),
      { role: "user", content: message }
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        instructions,
        input,
        store: false,
        max_output_tokens: 350
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: data?.error?.message || "OpenAI request failed"
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: data.output_text || "Geen antwoord ontvangen."
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
