require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const axios = require("axios");
const express = require("express");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once("ready", () => console.log("✅ BOT ĐÃ ONLINE - ĐANG ĐỢI LỆNH"));

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // LỆNH AI (DÙNG AXIOS GỌI TRỰC TIẾP)
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Gõ gì đi sếp?");
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    const waiting = await msg.channel.send("⏳ Đang nặn não...").catch(() => null);

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { "Content-Type": "application/json" }, timeout: 10000 }
      );

      const result = response.data.candidates[0].content.parts[0].text;
      await waiting.edit(`🤖 **${msg.author.username}:** ${result.substring(0, 1900)}`).catch(() => null);
      
    } catch (err) {
      console.error("Lỗi:", err.response?.data || err.message);
      // Nếu Gemini tạch, dùng SimSimi cứu net ngay
      try {
        const sim = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`);
        await waiting.edit(`🤖 (Sim) ${sim.data.result}`).catch(() => null);
      } catch (e) {
        await waiting.edit("💀 Cả Google và Sim đều chặn IP Railway rồi sếp ơi!").catch(() => null);
      }
    }
  }

  // LỆNH MOD (KICK/BAN)
  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã kick.")).catch(() => msg.channel.send("❌ Thua role."));
  }
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã ban.")).catch(() => msg.channel.send("❌ Thua role."));
  }
});

// ANTI-RAID
const joinMap = new Map();
client.on("guildMemberAdd", async (m) => {
    const now = Date.now();
    const js = joinMap.get(m.guild.id) || [];
    js.push(now); joinMap.set(m.guild.id, js);
    if (js.filter(t => now - t < 10000).length >= 5) {
        m.guild.channels.cache.forEach(c => { if (c.isTextBased()) c.permissionOverwrites.edit(m.guild.roles.everyone, { SendMessages: false }).catch(() => null); });
    }
    if (now - m.user.createdTimestamp < 259200000) await m.kick("AntiRaid").catch(() => null);
});

client.login(process.env.TOKEN);
express().get("/", (r, s) => s.send("Bot Online")).listen(process.env.PORT || 3000);

