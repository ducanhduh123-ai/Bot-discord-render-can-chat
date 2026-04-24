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

// --- ANTI-RAID ---
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

  // --- HỆ THỐNG AI SIÊU CẤP CHỐNG TIMED OUT ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Nhắn gì đi chứ bro?");

    const lowPrompt = prompt.toLowerCase();
    // Phản hồi "Nah bro" tại chỗ luôn cho nhanh
    if (lowPrompt.includes("ngu")) return msg.reply("Nah bro");
    if (lowPrompt === "hi" || lowPrompt === "hello") return msg.reply("Yo! Khỏe không bro?");

    // BƯỚC 1: Bật trạng thái "Bot đang gõ..." (Cực quan trọng để chống Timed Out)
    await msg.channel.sendTyping();

    // BƯỚC 2: Gửi tin nhắn chờ ngay lập tức
    const waitingMsg = await msg.reply("⏳ Đang nặn não... đừng hối!");

    // BƯỚC 3: Xử lý ngầm (Background Task)
    try {
      let response = null;
      // Thử SimSimi
      try {
        const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 8000 });
        if (res.data.result) response = res.data.result;
      } catch (e) {}

      // Dự phòng Popcat
      if (!response) {
        try {
          const res2 = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 8000 });
          if (res2.data.response) response = res2.data.response;
        } catch (e) {}
      }

      // Sửa tin nhắn chờ thành kết quả
      if (response) {
        await waitingMsg.edit(`🤖 ${response}`);
      } else {
        await waitingMsg.edit("☕ Đám server AI rủ nhau đi uống cafe hết rồi. Tí thử lại nha!");
      }
    } catch (err) {
      await waitingMsg.edit("❌ Lỗi não bộ rồi bro ơi!");
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
app.get("/", (req, res) => res.send("Bot Online - Final Anti-TimedOut"));
app.listen(process.env.PORT || 3000);

