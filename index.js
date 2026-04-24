require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// ===== 1. DATABASE CONNECTION =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

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

// ===== 3. ANTI RAID SYSTEM =====
const joinMap = new Map();

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const guildData = await Guild.findOne({ guildId: member.guild.id });
    if (!guildData?.antiRaid) return;

    const now = Date.now();
    const joins = joinMap.get(member.guild.id) || [];
    joins.push(now);
    joinMap.set(member.guild.id, joins);

    const recent = joins.filter(t => now - t < 10000);

    if (recent.length >= 5) {
      member.guild.channels.cache.forEach(channel => {
        if (channel.isTextBased() && channel.permissionsFor(member.guild.roles.everyone)?.has(PermissionsBitField.Flags.SendMessages)) {
          channel.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => null);
        }
      });
    }

    const accAge = now - member.user.createdTimestamp;
    if (accAge < 1000 * 60 * 60 * 24 * 3) {
      await member.kick("Anti-raid: Account quá mới").catch(() => null);
    }
  } catch (err) {
    console.error("Anti-raid error:", err);
  }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== 4. MESSAGE COMMANDS =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- Lệnh AI (Qwen 2.5 72B - Siêu mạnh) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    try {
      const response = await axios.post(
        "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct",
        { inputs: prompt },
        {
          headers: { 
            Authorization: `Bearer ${process.env.HF_TOKEN.trim()}`,
            "Content-Type": "application/json"
          },
          timeout: 25000
        }
      );

      const data = response.data;
      if (data.error && data.estimated_time) {
        return msg.reply(`⏳ AI đang khởi động, hãy đợi ${Math.round(data.estimated_time)}s nhé!`);
      }

      let reply = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
      
      // Xóa bỏ phần lặp lại của prompt nếu có
      const finalReply = reply.replace(prompt, "").trim();
      msg.reply(finalReply || "🤖 AI phản hồi trống.");
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      msg.reply(`❌ Lỗi AI: ${errorMsg}`);
    }
  }

  // --- Các lệnh cũ giữ nguyên ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Thiếu quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("Tag người cần kick.");
    user.kick().then(() => msg.reply("✅ Đã kick.")).catch(() => msg.reply("❌ Lỗi."));
  }

  if (msg.content === "!unlock") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    msg.guild.channels.cache.forEach(channel => {
      if (channel.isTextBased()) {
        channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null);
      }
    });
    msg.reply("🔓 Đã mở khóa server.");
  }
  
  if (msg.content === "!antiraid on") {
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: true });
    msg.reply("🛡️ Anti-raid: ON");
  }

  if (msg.content === "!antiraid off") {
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: false });
    msg.reply("⚠️ Anti-raid: OFF");
  }
});

client.login(process.env.TOKEN);

// ===== 5. DASHBOARD =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Online!"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

