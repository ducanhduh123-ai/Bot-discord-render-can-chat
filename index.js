require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");
const axios = require("axios");

// Cấu hình Gemini (Sếp nhớ check GEMINI_KEY trên Railway nhé)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once(Events.ClientReady, () => console.log("🚀 YEMIGI TỐC ĐỘ CAO ĐÃ ONLINE!"));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // --- LỆNH AI: CHỐNG TIMED OUT TUYỆT ĐỐI ---
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Nhắn gì đi sếp?");
    
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    // CHIÊU ĐỘC: Gửi tin nhắn chờ NGAY LẬP TỨC (Dưới 1 giây) để Discord không báo Timed Out
    const waiting = await msg.channel.send("⏳ *Yemigi đang suy nghĩ...*").catch(() => null);
    if (!waiting) return;

    // Chạy việc gọi AI ở luồng riêng (ngầm)
    (async () => {
      try {
        // Gọi Gemini (Tầng 1)
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        await waiting.edit(`🤖 **${msg.author.username}:** ${text.substring(0, 1900)}`).catch(() => null);
      } catch (err) {
        console.log("Gemini lag, thử SimSimi...");
        try {
          // Dự phòng SimSimi (Tầng 2)
          const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 5000 });
          await waiting.edit(`🤖 (Dự phòng) ${res.data.result}`).catch(() => null);
        } catch (e) {
          await waiting.edit("☕ Server AI quá tải, sếp thử lại câu khác xem!").catch(() => null);
        }
      }
    })();
    return;
  }

  // --- LỆNH MOD & ANTI-RAID (GIỮ NGUYÊN) ---
  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã tiễn.")).catch(() => msg.channel.send("❌ Thua role."));
  }
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã cút.")).catch(() => msg.channel.send("❌ Thua role."));
  }
});

// ANTI-RAID (Dưới 10s có 5 người vào là khóa)
const joinMap = new Map();
client.on(Events.GuildMemberAdd, async (m) => {
    const now = Date.now();
    const js = joinMap.get(m.guild.id) || [];
    js.push(now); joinMap.set(m.guild.id, js);
    if (js.filter(t => now - t < 10000).length >= 5) {
        m.guild.channels.cache.forEach(c => { if (c.isTextBased()) c.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: false }).catch(() => null); });
    }
});

client.login(process.env.TOKEN);
express().get("/", (r, s) => s.send("Bot Online")).listen(process.env.PORT || 3000);

