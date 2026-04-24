require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const fetch = require("node-fetch");

// ===== DATABASE CONNECTION =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

// Schema
const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

// ===== BOT CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== ANTI RAID SYSTEM =====
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

    // Phát hiện Raid (5 người vào trong 10 giây)
    if (recent.length >= 5) {
      console.log(`🚨 RAID DETECTED in ${member.guild.name}`);
      member.guild.channels.cache.forEach(channel => {
        if (channel.isTextBased() && channel.permissionsFor(member.guild.roles.everyone)?.has(PermissionsBitField.Flags.SendMessages)) {
          channel.permissionOverwrites.edit(member.guild.roles.everyone, {
            SendMessages: false
          }).catch(() => null);
        }
      });
    }

    // Chặn tài khoản mới (dưới 3 ngày)
    const accAge = now - member.user.createdTimestamp;
    if (accAge < 1000 * 60 * 60 * 24 * 3) {
      await member.kick("Anti-raid: Account quá mới (dưới 3 ngày)").catch(() => null);
    }
  } catch (err) {
    console.error("Anti-raid error:", err);
  }
});

// ===== READY EVENT =====
client.once(Events.ClientReady, (c) => {
  console.log(`🔥 Bot online: ${c.user.tag}`);
});

// ===== MESSAGE COMMANDS =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // Lấy dữ liệu server từ DB
  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) {
    guildData = await Guild.create({ guildId: msg.guild.id });
  }

  // --- Lệnh AI ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    try {
      const res = await fetch(
        "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium",
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.HF_TOKEN}` 
          },
          body: JSON.stringify({ inputs: prompt })
        }
      );

      const data = await res.json();
      
      let reply = "🤖 AI đang bận khởi động, đợi tí rồi hỏi lại nhé!";
      if (Array.isArray(data)) {
        reply = data[0]?.generated_text || reply;
      } else if (data.generated_text) {
        reply = data.generated_text;
      } else if (data.error) {
        reply = `❌ AI Error: ${data.error}`;
      }

      msg.reply(reply);
    } catch (error) {
      console.error("AI Fetch Error:", error);
      msg.reply("❌ Không thể kết nối với trí tuệ nhân tạo.");
    }
  }

  // --- Lệnh Mod ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Bạn không có quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("Tag người cần kick.");
    user.kick().then(() => msg.reply("✅ Đã kick.")).catch(() => msg.reply("❌ Lỗi khi kick."));
  }

  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Bạn không có quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("Tag người cần ban.");
    user.ban().then(() => msg.reply("🔥 Đã ban.")).catch(() => msg.reply("❌ Lỗi khi ban."));
  }

  // --- Control Anti-Raid ---
  if (msg.content === "!antiraid on") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: true }, { upsert: true });
    msg.reply("🛡️ Anti-raid đã BẬT.");
  }

  if (msg.content === "!antiraid off") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: false }, { upsert: true });
    msg.reply("⚠️ Anti-raid đã TẮT.");
  }

  if (msg.content === "!unlock") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    msg.guild.channels.cache.forEach(channel => {
      if (channel.isTextBased()) {
        channel.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null);
      }
    });
    msg.reply("🔓 Đã mở khóa tất cả kênh chat.");
  }
});

// ===== START BOT =====
client.login(process.env.TOKEN);

// ===== DASHBOARD & KEEP-ALIVE =====
const app = express();
app.use(express.json());

// Trang chủ để ping giữ cho bot không ngủ
app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.get("/guild/:id", async (req, res) => {
  const data = await Guild.findOne({ guildId: req.params.id });
  res.json(data || { message: "Không tìm thấy dữ liệu" });
});

app.post("/guild/:id", async (req, res) => {
  const data = await Guild.findOneAndUpdate(
    { guildId: req.params.id },
    req.body,
    { upsert: true, new: true }
  );
  res.json(data);
});

// Render cần process.env.PORT để không bị lỗi
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});

