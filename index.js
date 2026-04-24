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

// ===== ANTI-RAID =====
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
    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) await member.kick("Anti-Raid").catch(() => null);
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== XỬ LÝ LỆNH =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  if (lastProcessedMessage.has(msg.id)) return;
  lastProcessedMessage.add(msg.id);
  setTimeout(() => lastProcessedMessage.delete(msg.id), 5000);

  let guildData = await Guild.findOne({ guildId: msg.guild.id }) || await Guild.create({ guildId: msg.guild.id });

  // --- AI CHAT SIÊU TỐC ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    try {
      // Dùng model Gemma của Google trên Hugging Face (Cần HF_TOKEN trong Railway)
      const res = await axios.post(
        "https://api-inference.huggingface.co/models/google/gemma-1.1-2b-it",
        { inputs: prompt },
        { headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` }, timeout: 8000 }
      );
      
      let reply = Array.isArray(res.data) ? res.data[0].generated_text : res.data.generated_text;
      msg.reply(reply.replace(prompt, "").trim() || "🤖 Mình nghe rồi nhưng chưa biết trả lời sao.");
    } catch (error) {
      // Nếu API xịn lỗi, dùng SimSimi dự phòng ngay
      try {
        const sim = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 3000 });
        msg.reply(sim.data.result || "🤖 Đang quá tải, tí hỏi lại nha!");
      } catch (e) {
        msg.reply("🤖 AI đang đi uống cafe rồi, bạn chờ tí được không?");
      }
    }
  }

  // --- LỆNH MOD ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Cần quyền Ban.");
    const user = msg.mentions.members.first();
    if (user) user.ban().then(() => msg.reply(`🔥 Đã ban **${user.user.tag}**.`)).catch(() => msg.reply("❌ Lỗi role."));
  }

  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Cần quyền Kick.");
    const user = msg.mentions.members.first();
    if (user) user.kick().then(() => msg.reply(`✅ Đã kick **${user.user.tag}**.`)).catch(() => msg.reply("❌ Lỗi."));
  }
});

client.login(process.env.TOKEN);

const app = express();
app.get("/", (req, res) => res.send("Bot Online"));
app.listen(process.env.PORT || 3000);

