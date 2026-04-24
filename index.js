require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Database Connected"));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const lastProcessedMessage = new Set();
const joinMap = new Map();

// --- ANTI-RAID (FULL SERVER PROTECTION) ---
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const guildData = await Guild.findOne({ guildId: member.guild.id });
    if (!guildData?.antiRaid) return;
    const now = Date.now();
    const joins = joinMap.get(member.guild.id) || [];
    joins.push(now);
    joinMap.set(member.guild.id, joins);
    if (joins.filter(t => now - t < 10000).length >= 5) {
      member.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => null);
      });
    }
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) await member.kick("Anti-Raid").catch(() => null);
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 5000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id }) || await Guild.create({ guildId: msg.guild.id });

  // --- HỆ THỐNG AI SIÊU KIÊN NHẪN + FULL SERVER ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Muốn gì nè bro?");

    // 1. Phản hồi "Nah bro" và các câu cứng ngay lập tức
    const lowPrompt = prompt.toLowerCase();
    if (lowPrompt.includes("ngu")) return msg.reply("Nah bro");
    if (lowPrompt === "hi" || lowPrompt === "hello") return msg.reply("Yo! Khỏe không bro?");

    // 2. Trả lời ngay để chống Timed Out đỏ
    const waitingMsg = await msg.reply("🤖 Đang nạp não cực mạnh... đợi mình tí...");

    // 3. Quy trình quét qua tất cả server AI (Full Server)
    const getAIResponse = async () => {
      // Thử Server 1: SimSimi (10s kiên nhẫn)
      try {
        const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 10000 });
        if (res.data.result) return res.data.result;
      } catch (e) {}

      // Thử Server 2: Popcat (8s kiên nhẫn)
      try {
        const res2 = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 8000 });
        if (res2.data.response) return res2.data.response;
      } catch (e) {}

      // Thử Server 3: Google Mirror (Dự phòng cuối cùng)
      try {
        const res3 = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(prompt)}`, { timeout: 5000 });
        return `🤖 Ý bạn là: "${prompt}" đúng không? Mình đang nâng cấp thêm não để trả lời sâu hơn nhé!`;
      } catch (e) {}

      return null;
    };

    const finalResult = await getAIResponse();

    if (finalResult) {
      await waitingMsg.edit(finalResult);
    } else {
      await waitingMsg.edit("☕ Mình đã hỏi hết 3 server mà chúng nó đều bận uống cafe rồi. Thử lại sau nhé!");
    }
  }

  // --- LỆNH MOD ---
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.reply(`🔥 Đã tiễn **${user.user.tag}**.`)).catch(() => msg.reply("❌ Role thấp."));
  }
  
  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.reply(`✅ Đã đuổi **${user.user.tag}**.`)).catch(() => msg.reply("❌ Lỗi."));
  }
});

client.login(process.env.TOKEN);

const app = express();
app.get("/", (req, res) => res.send("Bot Online - Unlimited Patience Version"));
app.listen(process.env.PORT || 3000);

