require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// Kết nối DB ngầm hoàn toàn
mongoose.connect(process.env.MONGO_URI).catch(() => console.log("⚠️ DB chưa kết nối"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// --- ANTI-RAID (BẢO VỆ SERVER) ---
const joinMap = new Map();
client.on(Events.GuildMemberAdd, async (member) => {
    const now = Date.now();
    const joins = joinMap.get(member.guild.id) || [];
    joins.push(now);
    joinMap.set(member.guild.id, joins);

    // 1. Chống Raid: 5 người vào/10 giây -> Khóa server
    if (joins.filter(t => now - t < 10000).length >= 5) {
        member.guild.channels.cache.forEach(ch => {
            if (ch.isTextBased()) ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => null);
        });
    }
    // 2. Tự động kick tài khoản quá mới (dưới 3 ngày)
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) {
        await member.kick("Anti-Raid: Tài khoản mới").catch(() => null);
    }
});

client.once(Events.ClientReady, () => console.log("🔥 BOT FULL GIÁP ĐÃ SẴN SÀNG"));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // --- LỆNH AI (CHỐNG TIMED OUT) ---
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Nhắn gì đi bro?");

    // Phản hồi "Nah bro" tức thì
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    // Hiện trạng thái đang gõ và gửi tin nhắn chờ
    msg.channel.sendTyping().catch(() => null);
    const waiting = await msg.channel.send("⏳ Đang nặn não...").catch(() => null);
    if (!waiting) return;

    // Gọi AI ngầm
    (async () => {
      try {
        const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 8000 });
        await waiting.edit(`🤖 **Trả lời cho ${msg.author.username}:** ${res.data.result || "Uống cafe rồi!"}`).catch(() => null);
      } catch (e) {
        await waiting.edit("☕ AI đi uống cafe rồi, tí thử lại nha!").catch(() => null);
      }
    })();
    return;
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.channel.send("❌ Sếp không có quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.channel.send("❗ Tag ai đó để kick sếp ơi.");
    user.kick().then(() => msg.channel.send("✅ Đã tiễn khách.")).catch(() => msg.channel.send("❌ Lỗi role bot thấp hơn người này."));
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.channel.send("❌ Sếp không có quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.channel.send("❗ Tag ai đó để ban sếp ơi.");
    user.ban().then(() => msg.channel.send("🔥 Đã ban vĩnh viễn.")).catch(() => msg.channel.send("❌ Lỗi quyền hạn."));
  }

  // --- LỆNH MỞ KHÓA SERVER (SAU KHI RAID) ---
  if (msg.content === "!unlock" && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    msg.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null);
    });
    msg.channel.send("🔓 Đã mở khóa server!");
  }
});

client.login(process.env.TOKEN);

// Dashboard cho Railway
const app = express();
app.get("/", (req, res) => res.send("Bot Online - Full Armor Version"));
app.listen(process.env.PORT || 3000);

