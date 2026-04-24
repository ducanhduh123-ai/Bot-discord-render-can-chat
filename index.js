require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// ===== KẾT NỐI DATABASE =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

const Guild = mongoose.model("Guild", { guildId: String, aiEnabled: { type: Boolean, default: true } });

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith("!ai")) return;

  const prompt = msg.content.slice(3).trim();
  if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

  try {
    // Sử dụng model BlenderBot - Cực nhẹ và ổn định cho bản Free
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill",
      { inputs: prompt },
      {
        headers: { 
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    const data = response.data;

    // Kiểm tra nếu model đang tải
    if (data.error && data.estimated_time) {
      return msg.reply(`⏳ AI đang khởi động, đợi khoảng ${Math.round(data.estimated_time)}s nhé!`);
    }

    let reply = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    msg.reply(reply || "🤖 AI phản hồi trống, thử lại câu khác nhé.");

  } catch (error) {
    console.error("AI Error:", error.message);
    msg.reply("❌ Lỗi kết nối AI. Hãy kiểm tra lại HF_TOKEN trên Railway!");
  }
});

client.login(process.env.TOKEN);

// DASHBOARD GIỮ BOT ONLINE
const app = express();
app.get("/", (req, res) => res.send("Bot is Online!"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

