require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");
const axios = require("axios");

// Cấu hình Gemini
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

// --- HỆ THỐNG ANTI-RAID ---
const joinMap = new Map();
client.on(Events.GuildMemberAdd, async (member) => {
    const now = Date.now();
    const guildId = member.guild.id;
    const joins = joinMap.get(guildId) || [];
    joins.push(now);
    joinMap.set(guildId, joins);

    // 1. Chống Raid: Nếu 5 người vào trong 10 giây -> Khóa server
    const recentJoins = joins.filter(t => now - t < 10000);
    if (recentJoins.length >= 5) {
        member.guild.channels.cache.forEach(ch => {
            if (ch.isTextBased()) {
                ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false })
                  .catch(() => null);
            }
        });
        const systemChannel = member.guild.systemChannel || member.guild.channels.cache.find(c => c.isTextBased());
        if (systemChannel) systemChannel.send("🚨 **PHÁT HIỆN RAID!** Đã tạm khóa tất cả các kênh chat.");
    }

    // 2. Tự động kick acc clone (mới lập dưới 3 ngày)
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) {
        await member.kick("Anti-Raid: Tài khoản quá mới").catch(() => null);
    }
});

client.once(Events.ClientReady, () => console.log("🔥 BOT THIẾT GIÁP ĐÃ ONLINE"));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.channel.send("❌ Sếp không đủ quyền!");
    const user = msg.mentions.members.first();
    if (user) {
        user.ban().then(() => msg.channel.send(`🔥 Đã ban vĩnh viễn **${user.user.tag}**.`))
                  .catch(() => msg.channel.send("❌ Không ban được (Check role của bot)."));
    } else msg.channel.send("❗ Tag người cần ban đi sếp.");
    return;
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.channel.send("❌ Sếp không đủ quyền!");
    const user = msg.mentions.members.first();
    if (user) {
        user.kick().then(() => msg.channel.send(`✅ Đã kick **${user.user.tag}** khỏi server.`))
                   .catch(() => msg.channel.send("❌ Không kick được (Check role của bot)."));
    } else msg.channel.send("❗ Tag người cần kick đi sếp.");
    return;
  }

  // --- LỆNH UNLOCK (MỞ LẠI SERVER SAU KHI RAID) ---
  if (msg.content === "!unlock" && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    msg.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) {
            ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null);
        }
    });
    msg.channel.send("🔓 Đã mở khóa lại server!");
    return;
  }

  // --- LỆNH AI GEMINI (KHÔNG TIMED OUT) ---
  if (msg.content.startsWith("!ai")) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.channel.send("❓ Gõ gì đi sếp?");
    
    if (prompt.toLowerCase().includes("ngu")) return msg.channel.send("Nah bro");

    msg.channel.sendTyping().catch(() => null);
    const waiting = await msg.channel.send("⏳ Đang nặn não...").catch(() => null);

    (async () => {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        await waiting.edit(`🤖 **${msg.author.username}:** ${response.text()}`).catch(() => null);
      } catch (err) {
        // Dự phòng SimSimi nếu Gemini lỗi
        try {
          const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`);
          await waiting.edit(`🤖 (Dự phòng) ${res.data.result}`).catch(() => null);
        } catch (e) {
          await waiting.edit("☕ Bot mệt quá, đi ngủ đây. Thử lại sau nhé!").catch(() => null);
        }
      }
    })();
  }
});

client.login(process.env.TOKEN);
express().get("/", (r, s) => s.send("Bot Mod Ready")).listen(process.env.PORT || 3000);

