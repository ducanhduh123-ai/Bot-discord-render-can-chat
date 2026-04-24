require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// ===== 1. KẾT NỐI DATABASE =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

const Guild = mongoose.model("Guild", { 
    guildId: String, 
    aiEnabled: { type: Boolean, default: true } 
});

// ===== 2. KHỞI TẠO BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, (c) => {
  console.log(`🔥 Bot online: ${c.user.tag}`);
});

// ===== 3. XỬ LÝ LỆNH AI =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith("!ai")) return;

  const prompt = msg.content.slice(3).trim();
  if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

  // Lấy token và làm sạch (xóa khoảng trắng/xuống dòng thừa)
  const HF_TOKEN = process.env.HF_TOKEN ? process.env.HF_TOKEN.trim() : null;

  if (!HF_TOKEN) {
    return msg.reply("❌ Lỗi: Thiếu biến HF_TOKEN trên Railway. Hãy thêm nó vào mục Variables!");
  }

  try {
    const response = await axios.post(
      "https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill",
      { inputs: prompt },
      {
        headers: { 
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const data = response.data;

    // Trường hợp model đang khởi động (Cold Start)
    if (data.error && data.estimated_time) {
      return msg.reply(`⏳ AI đang khởi động, đợi tí (khoảng ${Math.round(data.estimated_time)}s) rồi hỏi lại nhé!`);
    }

    // Trả về kết quả
    let reply = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    msg.reply(reply || "🤖 AI phản hồi trống, thử lại câu khác nha.");

  } catch (error) {
    // Hiển thị lỗi chi tiết từ server để biết đường sửa
    const detailError = error.response?.data?.error || error.message;
    console.error("AI Error Details:", detailError);
    
    if (detailError.includes("Authorization")) {
        msg.reply("❌ Lỗi: Token AI (HF_TOKEN) không hợp lệ hoặc sai quyền. Hãy tạo lại Token mới (quyền Write)!");
    } else {
        msg.reply(`❌ Lỗi AI: ${detailError}`);
    }
  }
});

client.login(process.env.TOKEN);

// ===== 4. DASHBOARD GIỮ BOT ONLINE =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Online!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Dashboard chạy trên port ${PORT}`);
});

