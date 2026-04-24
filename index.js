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

  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 5000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- HỆ THỐNG AI SIÊU CẤP (KHÔNG LO QUÁ TẢI) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim().toLowerCase();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    // Lớp 1: Não bộ offline (Phản hồi ngay lập tức)
    const localBrain = {
        "hi": "Chào bạn! Ultra Max Bot đang trực chiến. 🛡️",
        "hello": "Xin chào! Chúc bạn một ngày tốt lành.",
        "ê": "Ơi, mình nghe đây!",
        "kick": "Dùng `!kick @user` nhé.",
        "ban": "Dùng `!ban @user` để tiễn khách.",
        "admin": "Admin là Tix - sếp tổng của mình!"
    };

    if (localBrain[prompt]) return msg.reply(localBrain[prompt]);

    try {
      // Lớp 2: API Siêu tốc (Sử dụng endpoint ổn định hơn)
      const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 3000 });
      if (res.data.result) return msg.reply(res.data.result);
      throw new Error("API Busy");
    } catch (error) {
      // Lớp 3: Nếu quá tải, bot sẽ trả lời thông minh thay vì báo lỗi
      const funReplies = [
          "🤖 Mình đang bận quét dọn server, tí mình trả lời nha!",
          "🤖 Sếp Tix đang bảo trì não cho mình, thử lại sau ít phút nhé.",
          "🤖 AI đang đi uống cafe rồi, bạn chờ tí được không?"
      ];
      msg.reply(funReplies[Math.floor(Math.random() * funReplies.length)]);
    }
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Không đủ quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    user.ban().then(() => msg.reply(`🔥 Đã ban: **${user.user.tag}**`)).catch(() => msg.reply("❌ Lỗi role bot thấp hơn."));
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Không đủ quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần kick.");
    user.kick().then(() => msg.reply(`✅ Đã kick: **${user.user.tag}**`)).catch(() => msg.reply("❌ Lỗi."));
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
app.get("/", (req, res) => res.send("Bot is Alive!"));
app.listen(process.env.PORT || 3000);

