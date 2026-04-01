const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { google } = require("googleapis");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User]
});

const SPREADSHEET_ID = "1tyha74-xdSq7rF3zF2qVFPz8_KE2tZMhb8m3vWpaY_k";
const ADMINS = ["776158830445985813", "508029101341147136"];

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

  const { bet, message, countdownMessage } = pending;

  try {
    const timestamp = new Date().toLocaleString("el-GR", { timeZone: "Europe/Athens", hour12: false });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${message.channel.name}!A:A`
    });
    const rowNumber = (response.data.values || []).length + 1;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${message.channel.name}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          timestamp,
          `${bet.date} ${bet.time}`,
          bet.event,
          bet.pick,
          bet.odds,
          "Pending",
          `=IF(F${rowNumber}="Won",(E${rowNumber}-1)*10,IF(F${rowNumber}="Lost",-10,0))`,
          message.id
        ]]
      }
    });

    // Αφαιρούμε το countdown μήνυμα και βάζουμε 🔒
    await countdownMessage.delete();
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
      "❌ Λάθος format! Χρησιμοποίησε:\n`!bet DD/MM HH:MM event - pick - odds`\nΠχ: `!bet 01/03 19:30 Arsenal v Chelsea - Arsenal to Win - 1.90`"
    );
  }

  const sendTime = Date.now();
  const countdownMessage = await message.reply(`🔓 Bet ανοιχτό για διόρθωση — κλειδώνει σε 20 δευτερόλεπτα`);
  const timeout = setTimeout(() => lockBet(message.id), 20000);
  pendingBets.set(message.id, { bet, message, countdownMessage, timeout, sendTime, edited: false });
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  const pending = pendingBets.get(newMessage.id);
  if (!pending) return;
  if (newMessage.author?.bot) return;
  if (!newMessage.content?.startsWith("!bet")) return;
  if (pending.edited) return;

  const newBet = parseBet(newMessage.content);
  if (!newBet) {
    await newMessage.reply("❌ Το edit έχει λάθος format, το παλιό bet παραμένει.");
    return;
  }

  // Υπολογίζουμε πόσος χρόνος έχει περάσει από το send
  const elapsed = Date.now() - pending.sendTime;
  const remaining = 60000 - elapsed;

  clearTimeout(pending.timeout);
  const newTimeout = setTimeout(() => lockBet(newMessage.id), remaining);

  await pending.countdownMessage.edit(`🔓 Bet επεξεργάστηκε — κλειδώνει σε ${Math.round(remaining / 1000)} δευτερόλεπτα`);

  pendingBets.set(newMessage.id, {
    ...pending,
    bet: newBet,
    timeout: newTimeout,
    edited: true
  });
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (!ADMINS.includes(user.id)) return;
  if (!["✅", "❌"].includes(reaction.emoji.name)) return;

  try {
    const message = reaction.message;
    const sheetName = message.channel.name;
    const rowIndex = await findRowByMessageId(sheetName, message.id);

    if (!rowIndex) return;

    const result = reaction.emoji.name === "✅" ? "Won" : "Lost";

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!F${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[result]]
      }
    });

    await message.reply(`${reaction.emoji.name === "✅" ? "🟢" : "🔴"} Bet marked as **${result}**!`);

  } catch (error) {
    console.error(error);
  }
});

async function findRowByMessageId(sheetName, messageId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!H:H`
  });

  const rows = response.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === messageId) return i + 1;
  }
  return null;
}

client.login(process.env.DISCORD_TOKEN);
