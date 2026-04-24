require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Mongo connected"));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- AI CHAT (Tối ưu Timeout & API dự phòng) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn nói gì?");

    try {
      // Tăng timeout lên 60s để tránh lỗi "Timed out"
      const res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}&owner=Tix&botname=UltraMax`, { timeout: 60000 });
      msg.reply(res.data.response || "🤖...");
    } catch (error) {
      // Nếu API chính lag, bot sẽ trả lời câu này thay vì báo lỗi đỏ
      msg.reply("🤖 Server đang bận xử lý dữ liệu, bạn đợi vài giây rồi thử lại nhé!");
    }
  }

  // --- LỆNH BAN (Đầy đủ quyền hạn) ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Bạn không đủ quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    
    user.ban({ reason: "Admin sử dụng lệnh" })
      .then(() => msg.reply(`🔥 Đã tiễn **${user.user.tag}** lên đường.`))
      .catch(() => msg.reply("❌ Lỗi: Kiểm tra lại thứ tự Role của Bot."));
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Bạn không đủ quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần kick.");
    user.kick().then(() => msg.reply(`✅ Đã kick: **${user.user.tag}**`)).catch(() => msg.reply("❌ Lỗi."));
  }
});

client.login(process.env.TOKEN);

const app = express();
app.get("/", (req, res) => res.send("Bot Online"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

