require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// ===== 1. KẾT NỐI DATABASE =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Mongo connected"))
  .catch(err => console.log("❌ Mongo error:", err));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

// ===== 2. KHỞI TẠO BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== 3. HỆ THỐNG ANTI-RAID =====
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

    if (now - member.user.createdTimestamp < 1000 * 60 * 60 * 24 * 3) {
      await member.kick("Anti-raid: Tài khoản dưới 3 ngày tuổi").catch(() => null);
    }
  } catch (err) { console.error(err); }
});

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

// ===== 4. XỬ LÝ LỆNH =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- Lệnh AI (Qwen 2.5 - Bản ổn định nhất) ---
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

      if (response.data.error && response.data.estimated_time) {
        return msg.reply(`⏳ Đợi khoảng ${Math.round(response.data.estimated_time)}s để AI khởi động nhé!`);
      }

      let reply = Array.isArray(response.data) ? response.data[0]?.generated_text : response.data.generated_text;
      msg.reply(reply.replace(prompt, "").trim() || "🤖 AI không có câu trả lời.");
    } catch (error) {
      msg.reply(`❌ Lỗi AI: ${error.response?.data?.error || "Không thể kết nối"}`);
    }
  }

  // --- Lệnh BAN (Đã thêm lại đây) ---
  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Bạn không có quyền Ban.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần ban.");
    
    user.ban({ reason: "Bị ban bởi lệnh Admin" })
      .then(() => msg.reply(`🔥 Đã ban thành công: **${user.user.tag}**`))
      .catch(err => msg.reply(`❌ Không thể ban người này (Có thể do chức vụ cao hơn bot).`));
  }

  // --- Lệnh KICK ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Bạn không có quyền Kick.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("❗ Tag người cần kick.");
    
    user.kick()
      .then(() => msg.reply(`✅ Đã kick thành công: **${user.user.tag}**`))
      .catch(err => msg.reply(`❌ Không thể kick người này.`));
  }

  // --- Lệnh UNLOCK ---
  if (msg.content === "!unlock") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    msg.guild.channels.cache.forEach(ch => { 
        if (ch.isTextBased()) ch.permissionOverwrites.edit(msg.guild.roles.everyone, { SendMessages: true }).catch(() => null); 
    });
    msg.reply("🔓 Đã mở khóa tất cả các kênh chat.");
  }
  
  // --- Bật/Tắt Anti-Raid ---
  if (msg.content === "!antiraid on") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: true });
    msg.reply("🛡️ Đã BẬT hệ thống Anti-Raid.");
  }

  if (msg.content === "!antiraid off") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return msg.reply("❌ Cần quyền Admin.");
    await Guild.findOneAndUpdate({ guildId: msg.guild.id }, { antiRaid: false });
    msg.reply("⚠️ Đã TẮT hệ thống Anti-Raid.");
  }
});

client.login(process.env.TOKEN);

// ===== 5. DASHBOARD (Cần thiết cho Railway) =====
const app = express();
app.get("/", (req, res) => res.send("Bot Online"));
app.listen(process.env.PORT || 3000, "0.0.0.0");

