require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// ===== 1. DATABASE =====
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Database Connected"));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

// ===== 2. BOT CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const lastProcessedMessage = new Set();

// ===== 3. ANTI-RAID =====
const joinMap = new Map();
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
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== 4. XỬ LÝ LỆNH =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 5000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id }) || await Guild.create({ guildId: msg.guild.id });

  // --- HỆ THỐNG AI "NAH BRO" ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim().toLowerCase();
    if (!prompt) return msg.reply("❓ Muốn gì nè?");

    // Phản hồi đặc biệt
    if (prompt.includes("ngu")) return msg.reply("Nah bro");
    if (prompt === "hi" || prompt === "hello") return msg.reply("Yo! Khỏe không bro?");

    try {
      // Thử gọi API (Nếu lag thì đi uống cafe)
      const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 3000 });
      if (res.data.result) return msg.reply(res.data.result);
      throw new Error("Cafe time");
    } catch (error) {
      const cafeReplies = [
          "☕ AI đang đi uống cafe rồi, bạn chờ tí được không?",
          "🤖 Đang nhâm nhi tách bạc xỉu, tí quay lại trả lời sau nha!",
          "☕ Server AI chính quá tải, mình đi làm ly cafe đây."
      ];
      msg.reply(cafeReplies[Math.floor(Math.random() * cafeReplies.length)]);
    }
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Quyền đâu mà ban?");
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.reply(`🔥 Đã tiễn **${user.user.tag}** đi hái chè.`)).catch(() => msg.reply("❌ Bot bị 'đè' role rồi, không ban được."));
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Không có quyền.");
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.reply(`✅ Đuổi cổ **${user.user.tag}** thành công.`)).catch(() => msg.reply("❌ Lỗi rồi."));
  }
});

client.login(process.env.TOKEN);

// ===== 5. DASHBOARD =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Active - Nah Bro Edition"));
app.listen(process.env.PORT || 3000);

