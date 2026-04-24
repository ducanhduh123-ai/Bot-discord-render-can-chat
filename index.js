require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");
const mongoose = require("mongoose");

// Kết nối Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

mongoose.connect(process.env.MONGO_URI).catch(() => null);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once(Events.ClientReady, () => console.log("🚀 YEMIGI ĐÃ SẴN SÀNG - NÃO SIÊU CẤP!"));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // --- LỆNH AI (SỬ DỤNG GEMINI) ---
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Nhắn gì đi sếp?");

    // Phản hồi Nah bro tức thì
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    msg.channel.sendTyping().catch(() => null);
    const waiting = await msg.channel.send("⏳ Yemigi đang nặn não...").catch(() => null);

    (async () => {
      try {
        // Gọi não Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Cắt bớt nếu câu trả lời quá dài (Discord giới hạn 2000 ký tự)
        const finalAns = text.length > 1900 ? text.substring(0, 1900) + "..." : text;
        
        await waiting.edit(`🤖 **${msg.author.username}:** ${finalAns}`).catch(() => null);
      } catch (e) {
        console.error(e);
        await waiting.edit("☕ Gemini đang bảo trì hoặc Key sai, tí thử lại sếp ơi!").catch(() => null);
      }
    })();
    return;
  }

  // --- LỆNH MOD & ANTIRAID (GIỮ NGUYÊN) ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.channel.send("❌ Thiếu quyền.");
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã kick.")).catch(() => msg.channel.send("❌ Lỗi role."));
  }
  
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.channel.send("❌ Thiếu quyền.");
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã ban.")).catch(() => msg.channel.send("❌ Lỗi role."));
  }
});

// ANTI-RAID (KHÔNG ĐỔI)
const joinMap = new Map();
client.on(Events.GuildMemberAdd, async (m) => {
    const now = Date.now();
    const js = joinMap.get(m.guild.id) || [];
    js.push(now); joinMap.set(m.guild.id, js);
    if (js.filter(t => now - t < 10000).length >= 5) {
        m.guild.channels.cache.forEach(c => { if (c.isTextBased()) c.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: false }).catch(() => null); });
    }
    if (now - m.user.createdTimestamp < 259200000) await m.kick("AntiRaid").catch(() => null);
});

client.login(process.env.TOKEN);
express().get("/", (r, s) => s.send("Yemigi Live")).listen(process.env.PORT || 3000);

