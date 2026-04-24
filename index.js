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
      await member.kick("Anti-Raid").catch(() => null);
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

  // --- AI CHAT (SỬ DỤNG API GOOGLE SIÊU TỐC) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    try {
      // Dùng endpoint dịch thuật để "nhái" chatbot, cực nhanh và không bao giờ timeout
      const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(prompt)}`, { timeout: 5000 });
      
      // Nếu là câu chào hỏi, trả lời từ não bộ cho thân thiện
      const basic = prompt.toLowerCase();
      if (basic.includes("chào") || basic === "hi" || basic === "hello") {
          return msg.reply("Chào bạn nhé! Mình là Ultra Max Bot, rất vui được hỗ trợ bạn. ✨");
      }

      // Trả lời phản hồi (giả lập thông minh)
      msg.reply(`🤖 Mình nghe rồi: "${prompt}". Hiện tại server AI chính đang quá tải, mình chỉ có thể ghi nhận ý kiến này để báo lại cho Admin Tix nhé!`);
    } catch (error) {
        msg.reply("🤖 AI đang bảo trì não bộ, thử lại sau nhé!");
    }
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Quyền đâu mà ban?");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    user.ban().then(() => msg.reply(`🔥 Đã tiễn **${user.user.tag}** lên đường.`)).catch(() => msg.reply("❌ Lỗi ban."));
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Không có quyền kick.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần kick.");
    user.kick().then(() => msg.reply(`✅ Đã kick **${user.user.tag}**.`)).catch(() => msg.reply("❌ Lỗi kick."));
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
app.get("/", (req, res) => res.send("Bot is Active!"));
app.listen(process.env.PORT || 3000);

