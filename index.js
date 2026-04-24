require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// Khởi tạo Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "NO_KEY");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

mongoose.connect(process.env.MONGO_URI).catch(() => console.log("⚠️ DB chưa kết nối"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once(Events.ClientReady, () => console.log("🚀 YEMIGI FULL GIÁP ĐÃ ONLINE!"));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // --- LỆNH AI (ƯU TIÊN GEMINI -> DỰ PHÒNG SIMSIMI) ---
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Nhắn gì đi sếp?");

    // Phản hồi "Nah bro" tức thì nếu chửi bot ngu
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    msg.channel.sendTyping().catch(() => null);
    const waiting = await msg.channel.send("⏳ Đang nặn não...").catch(() => null);
    if (!waiting) return;

    (async () => {
      try {
        // Tầng 1: Thử gọi Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        if (text) {
            const finalAns = text.length > 1900 ? text.substring(0, 1900) + "..." : text;
            return await waiting.edit(`🤖 **${msg.author.username}:** ${finalAns}`).catch(() => null);
        }
        throw new Error("Gemini rỗng");
      } catch (e) {
        console.log("⚠️ Gemini lỗi, chuyển sang dự phòng SimSimi...");
        
        // Tầng 2: Dự phòng SimSimi nếu Gemini tạch
        try {
          const resFallback = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 5000 });
          if (resFallback.data.result) {
            return await waiting.edit(`🤖 (Dự phòng) **${msg.author.username}:** ${resFallback.data.result}`).catch(() => null);
          }
        } catch (e2) {
          await waiting.edit("☕ Cả Gemini và SimSimi đều rủ nhau đi cafe rồi! Thử lại sau sếp ơi.").catch(() => null);
        }
      }
    })();
    return;
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.channel.send("❌ Sếp không có quyền.");
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã tiễn khách.")).catch(() => msg.channel.send("❌ Lỗi role bot thấp hơn."));
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.channel.send("❌ Sếp không có quyền.");
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã ban vĩnh viễn.")).catch(() => msg.channel.send("❌ Lỗi quyền hạn."));
  }
});

// --- ANTI-RAID ---
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

const app = express();
app.get("/", (req, res) => res.send("Yemigi Ready"));
app.listen(process.env.PORT || 3000);

