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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- HỆ THỐNG AI SIÊU TỐC (CÓ DỰ PHÒNG) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim().toLowerCase();
    if (!prompt) return msg.reply("❓ Bạn muốn nói gì?");

    // Chế độ trả lời nhanh cho các câu hỏi phổ biến (Tránh Timed out)
    const quickResponses = {
        "hi": "Chào bạn! Mình là Ultra Max Bot, mình có thể giúp gì cho bạn?",
        "hello": "Chào bạn nhé! Chúc một ngày tốt lành.",
        "ê": "Ơi, mình nghe đây!",
        "bot ngu": "Mình vẫn đang học hỏi mà, đừng mắng mình nhé!"
    };

    if (quickResponses[prompt]) {
        return msg.reply(quickResponses[prompt]);
    }

    try {
      // Thử gọi API siêu tốc (đặt timeout cực ngắn 5s)
      const res = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 5000 });
      msg.reply(res.data.response);
    } catch (error) {
      // Nếu API lag > 5s, Bot tự trả lời theo phong cách AI để không bị lỗi
      const backupReplies = [
          "Câu này khó quá, đợi mình nâng cấp não bộ tí nhé!",
          "Server AI đang hơi lag, nhưng mình vẫn ở đây bảo vệ server cho bạn!",
          "Mình nghe rồi, nhưng tín hiệu hơi yếu, bạn thử lại sau nhé."
      ];
      msg.reply(backupReplies[Math.floor(Math.random() * backupReplies.length)]);
    }
  }

  // --- LỆNH BAN (CHUẨN 100%) ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Quyền đâu mà ban?");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    
    user.ban({ reason: "Admin ra lệnh" })
      .then(() => msg.reply(`🔥 Đã tống khứ **${user.user.tag}** ra khỏi server.`))
      .catch(err => msg.reply("❌ Lỗi: Bot phải có chức vụ (Role) cao hơn người này mới ban được!"));
  }

  // --- LỆNH KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Không có quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần kick.");
    user.kick().then(() => msg.reply(`✅ Đã kick **${user.user.tag}**.`)).catch(() => msg.reply("❌ Thất bại."));
  }
});

client.login(process.env.TOKEN);

const app = express();
app.get("/", (req, res) => res.send("Bot Online"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

