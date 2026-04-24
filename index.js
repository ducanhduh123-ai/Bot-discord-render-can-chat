require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios"); // Chuyển sang axios

// ===== DATABASE CONNECTION =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

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

// ===== READY EVENT =====
client.once(Events.ClientReady, (c) => {
  console.log(`🔥 Bot online: ${c.user.tag}`);
});

// ===== MESSAGE COMMANDS =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- Lệnh AI (Qwen 2.5 Model - Rất mạnh) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    try {
      const response = await axios.post(
        "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct",
        { inputs: prompt },
        {
          headers: { 
            "Authorization": `Bearer ${process.env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          timeout: 30000 // Chờ tối đa 30 giây
        }
      );

      const data = response.data;
      
      // Xử lý lỗi đang tải model
      if (data.error && data.estimated_time) {
        return msg.reply(`⏳ AI đang khởi động, hãy đợi khoảng ${Math.round(data.estimated_time)} giây nữa rồi gõ lại nhé!`);
      }

      let reply = "";
      if (Array.isArray(data)) {
        reply = data[0]?.generated_text;
      } else {
        reply = data.generated_text;
      }

      // Xóa phần bị lặp lại nếu model trả về cả prompt
      const cleanReply = reply ? reply.replace(prompt, "").trim() : "🤖 AI không có câu trả lời.";
      msg.reply(cleanReply || "🤖 AI phản hồi trống.");

    } catch (error) {
      if (error.response) {
        // Lỗi từ phía Hugging Face (Token sai, Model bận...)
        console.error("HF Error:", error.response.data);
        if (error.response.status === 503) {
            return msg.reply("⏳ Server AI đang quá tải hoặc đang tải model, thử lại sau 1 phút nhé.");
        }
        msg.reply(`❌ Lỗi từ server AI: ${error.response.data.error || "Không xác định"}`);
      } else {
        // Lỗi mạng hoặc timeout
        console.error("Connection Error:", error.message);
        msg.reply("❌ Không thể kết nối với server AI (Timeout).");
      }
    }
  }

  // --- Lệnh Mod ---
  if (msg.content === "!unlock") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    msg.guild.channels.cache.forEach(channel => {
      if (channel.isTextBased()) {
        channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null);
      }
    });
    msg.reply("🔓 Đã mở khóa server.");
  }
});

client.login(process.env.TOKEN);

// ===== DASHBOARD =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Online!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🌐 Port: ${PORT}`));

