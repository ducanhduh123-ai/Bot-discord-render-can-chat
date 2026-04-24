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

// Chống phản hồi trùng lặp
const lastProcessedMessage = new Set();

// ===== 3. ANTI-RAID =====
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
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) {
      await member.kick("Anti-Raid: Nick mới").catch(() => null);
    }
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== 4. XỬ LÝ LỆNH =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // Chống bot trả lời 2 lần
  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 10000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- LỆNH AI ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim().toLowerCase();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    const brain = {
        "hello": "Chào bạn nhé! Chúc một ngày tốt lành.",
        "hi": "Hi! Ultra Max Bot nghe đây.",
        "ê": "Ơi, có mình đây!",
        "admin là ai": "Admin là Tix - đẹp trai nhất base!",
        "antiraid là gì": "Là hệ thống chặn người lạ vào phá server đó!"
    };

    if (brain[prompt]) return msg.reply(brain[prompt]);

    try {
      const res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 4000 });
      if (res.data.response) msg.reply(res.data.response);
    } catch (error) {
      msg.reply("🤖 Server đang bận, hỏi lại sau nha!");
    }
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Cần quyền Ban.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    user.ban().then(() => msg.reply(`🔥 Đã ban: **${user.user.tag}**`)).catch(() => msg.reply("❌ Lỗi ban."));
  }

  // --- LỆNH KICK (ĐÃ THÊM LẠI) ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Bạn không có quyền Kick.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần kick.");
    
    user.kick()
      .then(() => msg.reply(`✅ Đã kick thành công: **${user.user.tag}**`))
      .catch(err => msg.reply(`❌ Không thể kick người này (Có thể do role thấp hơn).`));
  }

  // --- LỆNH UNLOCK ---
  if (msg.content === "!unlock") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    msg.guild.channels.cache.forEach(ch => { 
        if (ch.isTextBased()) ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null); 
    });
    msg.reply("🔓 Đã mở khóa toàn bộ server.");
  }
});

client.login(process.env.TOKEN);

// ===== 5. DASHBOARD =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Active!"));
app.listen(process.env.PORT || 3000);

