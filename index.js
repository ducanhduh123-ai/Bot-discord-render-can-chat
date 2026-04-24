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

const lastProcessedMessage = new Set();

// --- ANTI-RAID ---
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
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// --- XỬ LÝ LỆNH ---
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 5000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id }) || await Guild.create({ guildId: msg.guild.id });

  // --- AI CHAT SIÊU TỈNH TÁO (KHÔNG UỐNG CAFE) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Muốn hỏi gì nào?");

    const promptLow = prompt.toLowerCase();
    
    // 1. Phản hồi nhanh (Không gọi API)
    if (promptLow.includes("hi") || promptLow.includes("chào")) return msg.reply("Chào sếp! Ultra Max Bot đã sẵn sàng nhận lệnh. ✨");
    if (promptLow.includes("admin")) return msg.reply("Admin là Tix, đẹp trai vô đối!");
    if (promptLow.includes("ngu")) return msg.reply("Nah bro");

    try {
      // 2. Dùng API Google (Bản này rất khó chết)
      const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(prompt)}`, { timeout: 4000 });
      msg.reply(`🤖 Mình đã nhận thông điệp: "${prompt}". Hiện tại sếp Tix đang tối ưu thêm não bộ cho mình nhé!`);
    } catch (error) {
      msg.reply("🤖 AI đang tập trung bảo vệ server, bạn nhắn lại sau nhé!");
    }
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Cần quyền Ban.");
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.reply(`🔥 Đã tiễn **${user.user.tag}** lên đường.`)).catch(() => msg.reply("❌ Bot thiếu quyền (Role thấp)."));
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Cần quyền Kick.");
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.reply(`✅ Đã đuổi **${user.user.tag}**.`)).catch(() => msg.reply("❌ Thất bại."));
  }
});

client.login(process.env.TOKEN);

// --- DASHBOARD ---
const app = express();
app.get("/", (req, res) => res.send("Bot Online - Dashboard Active"));
app.listen(process.env.PORT || 3000);

