require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ Mongo connected"));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith("!ai")) return;

  const prompt = msg.content.slice(3).trim();
  if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

  try {
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill",
      { inputs: prompt },
      {
        headers: { Authorization: `Bearer ${process.env.HF_TOKEN.trim()}` },
        timeout: 20000
      }
    );

    const data = response.data;

    // Nếu model đang tải, nó sẽ trả về estimated_time
    if (data.error && data.estimated_time) {
      return msg.reply(`⏳ AI đang khởi động, đợi tí (khoảng ${Math.round(data.estimated_time)}s) rồi hỏi lại nhé!`);
    }

    const reply = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    msg.reply(reply || "🤖 AI phản hồi trống, thử lại câu khác nha.");

  } catch (error) {
    console.error("Lỗi AI:", error.response?.data || error.message);
    msg.reply("❌ Vẫn không kết nối được. Hãy đảm bảo bạn đã dán Token mới vào Railway và nhấn Save!");
  }
});

client.login(process.env.TOKEN);
const app = express();
app.get("/", (req, res) => res.send("Bot Online"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

