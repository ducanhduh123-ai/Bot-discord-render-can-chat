require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const axios = require("axios");
const express = require("express");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once("ready", () => console.log("✅ BOT TỐC BIẾN ĐÃ ONLINE"));

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // LỆNH AI - CHIÊU CUỐI TRIỆT TIÊU TIMED OUT
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Nhắn gì đi sếp?");
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    // 1. Thông báo ngay lập tức để Discord biết bot đang sống
    msg.channel.sendTyping().catch(() => null);

    // 2. Chạy ngầm, không để Discord phải đợi (Né Timed Out)
    (async () => {
      try {
        // Thử Popcat (nhanh nhất hiện tại)
        const res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 8000 });
        
        if (res.data.response) {
          // GỬI TIN MỚI: Không bao giờ bị lỗi đỏ Timed Out như bản cũ
          return msg.channel.send(`🤖 **${msg.author.username}:** ${res.data.response}`);
        }
      } catch (err) {
        // Nếu sập, dùng dự phòng Google Mirror (Bất tử)
        try {
          const res2 = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(prompt)}`);
          msg.channel.send(`🤖 **${msg.author.username}:** Server AI đang lag, ý sếp là "${res2.data[0][0][0]}"?`);
        } catch (e) {
          msg.channel.send("💀 Mạng Railway bị nghẽn rồi sếp ơi!");
        }
      }
    })();
    return;
  }

  // --- LỆNH QUẢN TRỊ (KICK/BAN/ANTIRAID) ---
  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã tiễn.")).catch(() => msg.channel.send("❌ Role bot thấp hơn."));
  }
  
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã tiễn vĩnh viễn.")).catch(() => msg.channel.send("❌ Role bot thấp hơn."));
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

