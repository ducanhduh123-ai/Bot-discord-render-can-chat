require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// ===== 1. KẾT NỐI DATABASE =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

// ===== 2. KHỞI TẠO BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== 3. HỆ THỐNG ANTI-RAID =====
const joinMap = new Map();
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
  } catch (e) { console.error(e); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== 4. XỬ LÝ LỆNH =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- AI CHAT (Dùng API dự phòng ổn định) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn nói gì với mình?");

    try {
      // Sử dụng API của một dịch vụ chat mở không cần key
      const res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}&owner=Tix&botname=UltraMax`);
      msg.reply(res.data.response || "🤖 Đang suy nghĩ tí...");
    } catch (error) {
      msg.reply("🤖 AI đang hơi lag, bạn thử lại câu khác ngắn hơn xem!");
    }
  }

  // --- LỆNH BAN (Đầy đủ) ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Bạn không có quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    user.ban({ reason: "Admin ban" })
      .then(() => msg.reply(`🔥 Đã ban: **${user.user.tag}**`))
      .catch(() => msg.reply("❌ Lỗi: Có thể vai trò của Bot thấp hơn người này."));
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Bạn không có quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần kick.");
    user.kick()
      .then(() => msg.reply(`✅ Đã kick: **${user.user.tag}**`))
      .catch(() => msg.reply("❌ Lỗi kick."));
  }

  // --- LỆNH UNLOCK ---
  if (msg.content === "!unlock") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    msg.guild.channels.cache.forEach(ch => { 
        if (ch.isTextBased()) ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null); 
    });
    msg.reply("🔓 Đã mở khóa server.");
  }
});

client.login(process.env.TOKEN);

// ===== 5. DASHBOARD =====
const app = express();
app.get("/", (req, res) => res.send("Bot Online - No Token Mode"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

