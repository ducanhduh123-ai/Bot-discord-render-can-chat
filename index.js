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

// ===== 3. HỆ THỐNG ANTI-RAID (ĐÃ QUAY TRỞ LẠI) =====
const joinMap = new Map();

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const guildData = await Guild.findOne({ guildId: member.guild.id });
    if (!guildData?.antiRaid) return;

    const now = Date.now();
    const joins = joinMap.get(member.guild.id) || [];
    joins.push(now);
    joinMap.set(member.guild.id, joins);

    // Nếu có 5 người vào trong 10 giây -> Khóa server tạm thời
    const recentJoins = joins.filter(t => now - t < 10000);
    if (recentJoins.length >= 5) {
      member.guild.channels.cache.forEach(ch => {
        if (ch.isTextBased() && ch.permissionsFor(member.guild.roles.everyone)?.has(PermissionsBitField.Flags.SendMessages)) {
          ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => null);
        }
      });
      console.log(`🛡️ Anti-Raid kích hoạt tại ${member.guild.name}`);
    }

    // Tự động kick tài khoản mới tạo dưới 3 ngày
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) {
      await member.kick("Anti-Raid: Tài khoản quá mới").catch(() => null);
    }
  } catch (err) { console.error("Lỗi Anti-Raid:", err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== 4. XỬ LÝ LỆNH =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- AI CHAT (TRÁNH TIMED OUT) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim().toLowerCase();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    const brain = {
        "hello": "Chào bạn nhé! Chúc một ngày tốt lành.",
        "hi": "Hi! Ultra Max Bot nghe đây.",
        "ê": "Ơi, có mình đây!",
        "bot ngu": "Mình đang học mà, đừng mắng mình nha!",
        "admin là ai": "Admin là Tix - đẹp trai nhất base!",
        "antiraid là gì": "Là hệ thống chặn người lạ vào phá server đó!"
    };

    if (brain[prompt]) return msg.reply(brain[prompt]);

    try {
      const res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 4000 });
      msg.reply(res.data.response || "🤖...");
    } catch (error) {
      msg.reply("🤖 Câu này mình chưa học, hỏi câu khác dễ hơn đi!");
    }
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Cần quyền Ban.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    user.ban().then(() => msg.reply(`🔥 Đã ban: **${user.user.tag}**`)).catch(() => msg.reply("❌ Lỗi ban."));
  }

  // --- LỆNH ANTI-RAID ON/OFF ---
  if (msg.content === "!antiraid on") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: true });
    msg.reply("🛡️ Đã BẬT Anti-Raid.");
  }

  if (msg.content === "!antiraid off") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: false });
    msg.reply("⚠️ Đã TẮT Anti-Raid.");
  }
});

client.login(process.env.TOKEN);

// ===== 5. DASHBOARD =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Active!"));
app.listen(process.env.PORT || 3000);

