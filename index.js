const { Client, GatewayIntentBits } = require("discord.js");
const { google } = require("googleapis");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ΒΑΛΕ ΕΔΩ ΤΟ SPREADSHEET ID
const SPREADSHEET_ID = "1tyha74-xdSq7rF3zF2qVFPz8_KE2tZMhb8m3vWpaY_k";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS.replace(/\\n/g, '\n')),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

client.once("clientReady", () => {
  console.log("Degen's BetBot connected to Sheets 🔥");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!bet")) return;

  try {
    const content = message.content.replace("!bet", "").trim();
    const parts = content.split(" ");

     if (parts.length < 4) {
      return message.reply("❌ Λάθος format! Χρησιμοποίησε: !bet <kickOff> <event> <pick> <odds>");
    }

    const kickOff = parts[0];
    const odds = parts[parts.length - 1];
    let pick, event;
    if (parts.length >= 5) {
      pick = parts.slice(parts.length - 3, parts.length - 1).join(" "); // πχ "Kane 2+ SoT" γίνεται pick
      event = parts.slice(1, parts.length - 3).join(" "); // ό,τι μένει είναι event
    } else {
      pick = parts[parts.length - 2];
      event = parts.slice(1, parts.length - 2).join(" ");
    }
    
    const timestamp = new Date().toLocaleString("el-GR");

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "ironroukos!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[timestamp, kickOff, event, pick, odds]]
      }
    });

    message.reply("✅ Φέρτο μέσα παιδί μου");
  } catch (error) {
    console.error(error);
    message.reply("❌ Πάρτο Αλλιώς.");
  }
});

client.login(process.env.DISCORD_TOKEN);
