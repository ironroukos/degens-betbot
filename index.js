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

// Κρατάμε τα pending bets σε memory
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

  // Βάζουμε ⏳ reaction και αποθηκεύουμε το bet
  await message.react("⏳");
  pendingBets.set(message.id, { bet, message });

  // Μετά από 60 δευτερόλεπτα κλειδώνουμε
  setTimeout(async () => {
    const pending = pendingBets.get(message.id);
    if (!pending) return;

    pendingBets.delete(message.id);

    try {
      const { bet, message: msg } = pending;
      const timestamp = new Date().toLocaleString("el-GR");

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "ironroukos!A:F",
        valueInputOption: "RAW",
        requestBody: {
          values: [[timestamp, `${bet.date} ${bet.time}`, bet.event, bet.pick, bet.odds]]
        }
      });

      // Αφαιρούμε ⏳ και βάζουμε 🔒
      await msg.reactions.cache.get("⏳")?.remove();
      await msg.react("🔒");

    } catch (error) {
      console.error(error);
    }
  }, 60000);
});

// Αν γίνει edit μέσα στο 1 λεπτό, ανανεώνουμε το bet
client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!pendingBets.has(newMessage.id)) return;
  if (newMessage.author?.bot) return;
  if (!newMessage.content?.startsWith("!bet")) return;

  const newBet = parseBet(newMessage.content);

  if (!newBet) {
    await newMessage.reply("❌ Το edit έχει λάθος format, το παλιό bet παραμένει.");
    return;
  }

  // Ανανεώνουμε το bet με το νέο περιεχόμενο
  const existing = pendingBets.get(newMessage.id);
  existing.bet = newBet;
  pendingBets.set(newMessage.id, existing);

  await newMessage.react("✏️");
});

client.login(process.env.DISCORD_TOKEN);
