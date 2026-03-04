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

const pendingBets = new Map();

function parseBet(content) {
  const cleaned = content.replace("!bet", "").trim();
  
  const firstSpace = cleaned.indexOf(" ");
  const secondSpace = cleaned.indexOf(" ", firstSpace + 1);
  
  const date = cleaned.substring(0, firstSpace).trim();
  const time = cleaned.substring(firstSpace + 1, secondSpace).trim();
  const rest = cleaned.substring(secondSpace + 1).trim();
  
  const parts = rest.split(" - ").map(p => p.trim());
  
  if (parts.length !== 3) return null;
  
  const [event, pick, odds] = parts;
  
  if (isNaN(parseFloat(odds))) return null;
  
  return { date, time, event, pick, odds };
}

async function lockBet(messageId) {
  const pending = pendingBets.get(messageId);
  if (!pending) return;

  pendingBets.delete(messageId);

  const { bet, message } = pending;

  try {
    const timestamp = new Date().toLocaleString("el-GR");

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${message.channel.name}!A:F`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[timestamp, `${bet.date} ${bet.time}`, bet.event, bet.pick, bet.odds]]
      }
    });

    await message.reactions.cache.get("⏳")?.remove();
    await message.react("🔒");
    await message.reply(`✅ Bet καταχωρήθηκε!\n📅 ${bet.date} ⏰ ${bet.time}\n⚽ ${bet.event}\n🎯 ${bet.pick} @ ${bet.odds}`);

  } catch (error) {
    console.error(error);
  }
}

client.once("clientReady", () => {
  console.log("Degen's BetBot connected to Sheets 🔥");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!bet")) return;

  const bet = parseBet(message.content);

  if (!bet) {
    return message.reply(
      "❌ Λάθος format! Χρησιμοποίησε:\n`!bet DD/MM HH:MM event - pick - odds`\nΠχ: `!bet 26/05 23:30 Boca Juniors v River Plate - Di Maria 2+ Shots on Target - 1.90`"
    );
  }

  await message.react("⏳");

  const timeout = setTimeout(() => lockBet(message.id), 26000);
  pendingBets.set(message.id, { bet, message, timeout, edited: false });
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  const pending = pendingBets.get(newMessage.id);
  if (!pending) return;
  if (newMessage.author?.bot) return;
  if (!newMessage.content?.startsWith("!bet")) return;

  // Μόνο μια φορά reset
  if (pending.edited) return;

  const newBet = parseBet(newMessage.content);
  if (!newBet) {
    await newMessage.reply("❌ Το edit έχει λάθος format, το παλιό bet παραμένει.");
    return;
  }

  // Reset timer και ανανέωση bet
  clearTimeout(pending.timeout);
  const newTimeout = setTimeout(() => lockBet(newMessage.id), 26000);
  
  pendingBets.set(newMessage.id, {
    bet: newBet,
    message: pending.message,
    timeout: newTimeout,
    edited: true
  });
});

client.login(process.env.DISCORD_TOKEN);
