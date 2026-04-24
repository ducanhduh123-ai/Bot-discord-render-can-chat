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

// ===== READY EVENT =====
client.once(Events.ClientReady, (c) => {
  console.log(`🔥 Bot online: ${c.user.tag}`);
});

// ===== MESSAGE COMMANDS =====
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  let guildData = await Guild.findOne({ guildId: msg.guild.id });
  if (!guildData) guildData = await Guild.create({ guildId: msg.guild.id });

  // --- Lệnh AI (Gemma-2-9b Model) ---
  if (msg.content.startsWith("!ai") && guildData.aiEnabled) {
    const prompt = msg.content.slice(3).trim();
    if (!prompt) return msg.reply("❓ Bạn muốn hỏi gì?");

    try {
      const res = await fetch(
        "https://api-inference.huggingface.co/models/google/gemma-2-9b-it",
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.HF_TOKEN}`,
            "User-Agent": "DiscordBot (https://github.com/ducanhduh123-ai, 1.0.0)"
          },
          body: JSON.stringify({ 
            inputs: prompt,
            parameters: { max_new_tokens: 500, return_full_text: false }
          })
        }
      );

      const data = await res.json();
      
      if (data.error && data.estimated_time) {
        return msg.reply(`⏳ AI đang khởi động, đợi tí (khoảng ${Math.round(data.estimated_time)}s) rồi hỏi lại nhé!`);
      }

      if (data.error) return msg.reply(`❌ Lỗi hệ thống: ${data.error}`);

      let reply = "";
      if (Array.isArray(data)) {
        reply = data[0]?.generated_text;
      } else {
        reply = data.generated_text;
      }

      msg.reply(reply || "🤖 AI không đưa ra phản hồi nào.");
    } catch (error) {
      console.error("AI Error:", error);
      msg.reply("❌ Lỗi kết nối server AI.");
    }
  }

  // --- Lệnh Mod ---
  if (msg.content.startsWith("!kick")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Thiếu quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("Tag người cần kick.");
    user.kick().then(() => msg.reply("✅ Đã kick.")).catch(() => msg.reply("❌ Lỗi."));
  }

  if (msg.content.startsWith("!ban")) {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Thiếu quyền.");
    const user = msg.mentions.members.first();
    if (!user) return msg.reply("Tag người cần ban.");
    user.ban().then(() => msg.reply("🔥 Đã ban.")).catch(() => msg.reply("❌ Lỗi."));
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
});

// ===== START BOT =====
client.login(process.env.TOKEN);

// ===== DASHBOARD (Railway Port fix) =====
const app = express();
app.get("/", (req, res) => res.send("Bot is Online!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🌐 Port: ${PORT}`));

