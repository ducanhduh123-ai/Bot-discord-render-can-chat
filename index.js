require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");
const axios = require("axios");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, () => console.log("🚀 BOT DA ONLINE - ANTI TIMED OUT MODE"));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Nhắn gì đi sếp?");
    
    // 1. Thông báo ngay là bot đang xử lý để né Discord check
    await msg.channel.sendTyping().catch(() => null);

    // 2. Chạy ngầm xử lý AI
    (async () => {
      let finalAns = null;
      try {
        const result = await model.generateContent(prompt);
        finalAns = result.response.text();
      } catch (err) {
        try {
          const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 5000 });
          if (res.data.result) finalAns = res.data.result;
        } catch (e) {}
      }

      // 3. GỬI TIN NHẮN MỚI (KHÔNG DÙNG EDIT) -> KHÔNG BAO GIỜ BỊ TIMED OUT ĐỎ
      if (finalAns) {
        await msg.reply(`🤖 ${finalAns.substring(0, 1900)}`).catch(() => null);
      } else {
        await msg.reply("🤖 AI đang bận tí, sếp thử lại sau nhé!").catch(() => null);
      }
    })();
    return;
  }

  // MOD LỆNH (Giữ nguyên)
  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.channel.send("✅ Đã tiễn.")).catch(() => null);
  }
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.channel.send("🔥 Đã cút.")).catch(() => null);
  }
});

client.login(process.env.TOKEN);
express().get("/", (r, s) => s.send("Bot Online")).listen(process.env.PORT || 3000);

