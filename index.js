require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Database Connected"));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const joinMap = new Map();

// --- ANTI-RAID ---
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const guildData = await Guild.findOne({ guildId: member.guild.id });
    if (!guildData?.antiRaid) return;
    const now = Date.now();
    const joins = joinMap.get(member.guild.id) || [];
    joins.push(now);
    joinMap.set(member.guild.id, joins);
    if (joins.filter(t => now - t < 10000).length >= 5) {
      member.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => null);
      });
    }
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) await member.kick("Anti-Raid").catch(() => null);
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id }) || await Guild.create({ guildId: msg.guild.id });

  // --- LỆNH AI (CHỐNG TIMED OUT 100%) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim().toLowerCase();
    if (!prompt) return msg.reply("❓ Muốn gì nè?");

    // Phản hồi tại chỗ (nhanh nhất)
    if (prompt.includes("ngu")) return msg.reply("Nah bro");
    if (prompt === "hi" || prompt === "hello") return msg.reply("Yo! Khỏe không bro?");

    // Với các câu khác, cho bot "suy nghĩ" để tránh Timed Out
    const waitingMsg = await msg.reply("🤖 Đang nạp não... chờ tí...");

    try {
      const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 15000 });
      await waitingMsg.edit(res.data.result || "🤖 Chịu, không biết trả lời sao luôn.");
    } catch (error) {
      // Nếu API quá lâu (uống cafe)
      await waitingMsg.edit("☕ AI đi uống cafe rồi, tí quay lại sau nha!");
    }
  }

  // --- LỆNH BAN/KICK ---
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.reply(`🔥 Đã tiễn **${user.user.tag}**.`)).catch(() => msg.reply("❌ Lỗi role."));
  }
  
  if (msg.content === "!unlock" && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    msg.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null);
    });
    msg.reply("🔓 Đã mở khóa server!");
  }
});

client.login(process.env.TOKEN);

const app = express();
app.get("/", (req, res) => res.send("Bot Online - Anti-TimedOut Version"));
app.listen(process.env.PORT || 3000);

