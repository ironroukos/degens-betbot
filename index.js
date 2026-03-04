const { Client, GatewayIntentBits } = require("discord.js");
const { google } = require("googleapis");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const SPREADSHEET_ID = "1tyha74-xdSq7rF3zF2qVFPz8_KE2tZMhb8m3vWpaY_k";

const credsString = process.env.GOOGLE_CREDENTIALS.replace(/\n/g, '\\n');
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(credsString),
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
    
    // Παίρνουμε ημερομηνία και ώρα από τις πρώτες δύο λέξεις
    const firstSpace = content.indexOf(" ");
    const secondSpace = content.indexOf(" ", firstSpace + 1);
    
    const date = content.substring(0, firstSpace).trim();
    const time = content.substring(firstSpace + 1, secondSpace).trim();
    const rest = content.substring(secondSpace + 1).trim();
    
    // Χωρίζουμε το υπόλοιπο με -
    const parts = rest.split(" - ").map(p => p.trim());
    
    if (parts.length !== 3) {
      return message.reply("❌ Λάθος format! Χρησιμοποίησε:\n`!bet DD/MM HH:MM event - pick - odds`\nΠχ: `!bet 26/05 23:30 Boca Juniors v River Plate - Di Maria 2+ Shots on Target - 1.90`");
    }
    
    const event = parts[0];
    const pick = parts[1];
    const odds = parts[2];
    
    // Validation για odds
    if (isNaN(parseFloat(odds))) {
      return message.reply("❌ Τα odds πρέπει να είναι αριθμός! Πχ: `1.90`");
    }

    const timestamp = new Date().toLocaleString("el-GR");

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "ironroukos!A:F",
      valueInputOption: "RAW",
      requestBody: {
        values: [[timestamp, `${date} ${time}`, event, pick, odds]]
      }
    });

    message.reply(`✅ Bet καταχωρήθηκε!\n📅 ${date} ⏰ ${time}\n⚽ ${event}\n🎯 ${pick} @ ${odds}`);
  } catch (error) {
    console.error(error);
    message.reply("❌ Κάτι πήγε στραβά, δοκίμασε ξανά.");
  }
});

client.login(process.env.DISCORD_TOKEN);
