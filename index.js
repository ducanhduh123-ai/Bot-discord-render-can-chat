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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const lastProcessedMessage = new Set();
const joinMap = new Map();

// --- ANTI-RAID (BẢO VỆ SERVER) ---
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
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) await member.kick("Anti-Raid").catch(() => null);
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// --- XỬ LÝ LỆNH CHÍNH ---
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // Chống lặp tin nhắn
  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 5000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id }) || await Guild.create({ guildId: msg.guild.id });

  // --- HỆ THỐNG AI (SIÊU KIÊN NHẪN + ANTI TIMED OUT) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Nhắn gì đi chứ bro?");

    const lowPrompt = prompt.toLowerCase();
    if (lowPrompt.includes("ngu")) return msg.reply("Nah bro");
    if (lowPrompt === "hi" || lowPrompt === "hello") return msg.reply("Yo! Khỏe không bro?");

    // BƯỚC 1: Phản hồi ngay lập tức để Discord KHÔNG báo Timed Out
    const waitingMsg = await msg.reply("⏳ Chờ mình tí, đang nặn não...");

    // BƯỚC 2: Chạy hàm xử lý AI riêng biệt (Async)
    (async () => {
      try {
        let result = null;

        // Thử Server 1: SimSimi (Kiên nhẫn 12s)
        try {
          const res1 = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 12000 });
          if (res1.data.result) result = res1.data.result;
        } catch (e) {}

        // Thử Server 2 nếu Server 1 tạch (Kiên nhẫn 10s)
        if (!result) {
          try {
            const res2 = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 10000 });
            if (res2.data.response) result = res2.data.response;
          } catch (e) {}
        }

        // BƯỚC 3: Cập nhật kết quả hoặc báo uống cafe
        if (result) {
          await waitingMsg.edit(`🤖 ${result}`);
        } else {
          await waitingMsg.edit("☕ Mình hỏi cả team AI rồi mà đứa nào cũng bận uống cafe. Thử lại sau nhé!");
        }
      } catch (error) {
        await waitingMsg.edit("🤖 Não bị chập mạch rồi, thử lại câu khác xem!");
      }
    })(); // Kết thúc hàm async tự chạy
  }

  // --- LỆNH MOD ---
  if (msg.content.startsWith("!ban") && msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.reply(`🔥 Đã tiễn **${user.user.tag}**.`)).catch(() => msg.reply("❌ Role bot thấp hơn."));
  }

  if (msg.content.startsWith("!kick") && msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.reply(`✅ Đã kick **${user.user.tag}**.`)).catch(() => msg.reply("❌ Lỗi."));
  }
});

client.login(process.env.TOKEN);

// --- DASHBOARD (GIỮ BOT 24/7) ---
const app = express();
app.get("/", (req, res) => res.send("Bot Online - Anti-TimedOut Version"));
app.listen(process.env.PORT || 3000);

