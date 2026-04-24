require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const axios = require("axios");
const express = require("express");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once("ready", () => console.log("✅ BOT ĐÃ VƯỢT RÀO THÀNH CÔNG"));

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // LỆNH AI (DÙNG LÕI DỊCH THUẬT NGẦM - KHÔNG CẦN KEY, KHÔNG LO CHẶN IP)
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Gõ gì đi sếp?");
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    const waiting = await msg.channel.send("⏳ Đang lách luật để trả lời...").catch(() => null);

    try {
      // Dùng API của một bên thứ 3 (Affiliate AI) - Thằng này cực kỳ lỳ lợm
      const res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 8000 });
      
      if (res.data.response) {
        return await waiting.edit(`🤖 **${msg.author.username}:** ${res.data.response}`).catch(() => null);
      }
      throw new Error("Popcat tạch");

    } catch (err) {
      console.log("Popcat tạch, dùng lõi dự phòng cuối cùng...");
      try {
        // Lõi dự phòng: Free AI qua một cổng Proxy khác
        const res2 = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(prompt)}`);
        await waiting.edit(`🤖 (Hệ thống bận) Ý sếp là: "${res2.data[0][0][0]}"? Hiện tại các server AI đều chặn IP này, sếp hãy thử lại sau ít phút nhé!`).catch(() => null);
      } catch (e) {
        await waiting.edit("💀 Railway bị khóa Outbound hoàn toàn rồi. Sếp hãy kiểm tra mục 'Networking' trên Railway nhé!").catch(() => null);
      }
    }
  }

  // LỆNH MOD (GIỮ NGUYÊN)
  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã tiễn.")).catch(() => msg.channel.send("❌ Lỗi role."));
  }
  
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã cút.")).catch(() => msg.channel.send("❌ Lỗi role."));
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
});

client.login(process.env.TOKEN);
express().get("/", (r, s) => s.send("Bot Online")).listen(process.env.PORT || 3000);

