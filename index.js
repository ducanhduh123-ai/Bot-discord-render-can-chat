require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// ===== 1. DATABASE =====
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Database Connected"));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

// ===== 2. BOT CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const lastProcessedMessage = new Set();
const joinMap = new Map();

// ===== 3. HỆ THỐNG ANTI-RAID (CHẾ ĐỘ BẢO VỆ) =====
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const guildData = await Guild.findOne({ guildId: member.guild.id });
    if (!guildData?.antiRaid) return;

    const now = Date.now();
    const joins = joinMap.get(member.guild.id) || [];
    joins.push(now);
    joinMap.set(member.guild.id, joins);

    // Phát hiện Raid: 5 người vào trong 10 giây
    const recentJoins = joins.filter(t => now - t < 10000);
    if (recentJoins.length >= 5) {
      member.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) {
          ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => null);
        }
      });
      console.log(`🛡️ Anti-Raid: Đã khóa server ${member.guild.name}`);
    }

    // Tự động kick tài khoản mới tạo dưới 3 ngày
    const accountAge = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAge < 3) {
      await member.kick("Anti-Raid: Tài khoản quá mới (dưới 3 ngày)").catch(() => null);
    }
  } catch (err) { console.error("Lỗi Anti-Raid:", err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== 4. XỬ LÝ LỆNH =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 5000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id }) || await Guild.create({ guildId: msg.guild.id });

  // --- LỆNH AI ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim().toLowerCase();
    if (!prompt) return msg.reply("❓ Muốn gì nè?");

    // Phản hồi tại chỗ
    if (prompt.includes("ngu")) return msg.reply("Nah bro");
    if (prompt === "hi" || prompt === "hello") return msg.reply("Yo! Khỏe không bro?");

    try {
      // API chính (Timeout 10s)
      const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 10000 });
      if (res.data.result) return msg.reply(res.data.result);
      throw new Error("Slow");
    } catch (error) {
      try {
        // API dự phòng
        const res2 = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 5000 });
        if (res2.data.response) return msg.reply(res2.data.response);
      } catch (e) {
        msg.reply("☕ AI đang đi uống cafe rồi, bạn chờ tí được không?");
      }
    }
  }

  // --- LỆNH QUẢN TRỊ ---
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.reply(`🔥 Đã ban: **${user.user.tag}**`)).catch(() => msg.reply("❌ Lỗi role."));
  }

  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.reply(`✅ Đã kick: **${user.user.tag}**`)).catch(() => msg.reply("❌ Lỗi."));
  }

  if (msg.content === "!unlock" && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    msg.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null);
    });
    msg.reply("🔓 Server đã được mở khóa!");
  }
});

client.login(process.env.TOKEN);

// ===== 5. DASHBOARD =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Active - Anti-Raid & Nah Bro Edition"));
app.listen(process.env.PORT || 3000);

