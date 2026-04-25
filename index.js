require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");
const axios = require("axios");

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

client.once(Events.ClientReady, () => console.log("🚀 BOT DA ONLINE - MOI THU DA SAN SANG!"));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Nhắn gì đi sếp?");
    
    const waiting = await msg.channel.send("⏳ *Đang nặn não, đợi tí...*").catch(() => null);
    if (!waiting) return;

    (async () => {
      let finalAns = null;
      try {
        const result = await model.generateContent(prompt);
        finalAns = result.response.text();
      } catch (err) {
        try {
          const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 5000 });
          if (res.data.result) finalAns = res.data.result;
        } catch (e) {
          try {
            const res2 = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 5000 });
            if (res2.data.response) finalAns = res2.data.response;
          } catch (e2) {}
        }
      }

      if (finalAns) {
        await waiting.edit(`🤖 **${msg.author.username}:** ${finalAns.substring(0, 1900)}`).catch(() => null);
      } else {
        // DÒNG 56 ĐÃ FIX DẤU NGOẶC:
        await waiting.edit('🤖 Hiện tại tất cả các lõi AI đều đang bận "uống cafe". Sếp gõ lại sau 1 phút xem!').catch(() => null);
      }
    })();
  }

  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã tiễn.")).catch(() => null);
  }
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã cút.")).catch(() => null);
  }
});

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

