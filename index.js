require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField, Events } = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");

// Kết nối DB ngầm
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected")).catch(e => console.log("❌ DB Error"));

const Guild = mongoose.model("Guild", {
  guildId: String,
  aiEnabled: { type: Boolean, default: true },
  antiRaid: { type: Boolean, default: true }
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const lastProcessedMessage = new Set();

client.once(Events.ClientReady, (c) => console.log(`🔥 Bot online: ${c.user.tag}`));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // --- LỆNH AI (ZERO TIMED OUT) ---
  if (msg.content.startsWith("!ai")) {
    const waitingMsg = await msg.reply("⏳ Chờ mình tí, đang nặn não...").catch(() => null);
    if (!waitingMsg) return;

    const prompt = msg.content.slice(3).trim();
    if (!prompt) return waitingMsg.edit("❓ Nhắn gì đi chứ bro?");

    const lowPrompt = prompt.toLowerCase();
    if (lowPrompt.includes("ngu")) return waitingMsg.edit("Nah bro");
    if (lowPrompt === "hi" || lowPrompt === "hello") return waitingMsg.edit("Yo! Khỏe không bro?");

    (async () => {
        try {
            let guildData = await Guild.findOne({ guildId: msg.guild.id });
            if (guildData && !guildData.aiEnabled) return waitingMsg.edit("❌ AI đang bị tắt.");

            let response = null;
            try {
                const res = await axios.get(`https://api.simsimi.vn/v2/simsimi?text=${encodeURIComponent(prompt)}&lc=vn`, { timeout: 10000 });
                response = res.data.result;
            } catch (e) {
                try {
                    const res2 = await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(prompt)}`, { timeout: 7000 });
                    response = res2.data.response;
                } catch (e2) {}
            }

            if (response) {
                await waitingMsg.edit(`🤖 ${response}`);
            } else {
                await waitingMsg.edit("☕ Đám AI rủ nhau đi uống cafe hết rồi. Tí thử lại nha!");
            }
        } catch (err) {
            await waitingMsg.edit("❌ Lỗi xử lý rồi!");
        }
    })();
    return;
  }

  // --- LỆNH BAN ---
  if (msg.content.startsWith("!ban")) {
      if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply("❌ Cần quyền Ban.");
      const user = msg.mentions.members.first();
      if (user) user.ban().then(() => msg.reply("🔥 Đã ban thành công.")).catch(() => msg.reply("❌ Lỗi role bot thấp hơn."));
      else msg.reply("❗ Hãy tag người cần ban.");
  }

  // --- LỆNH KICK (ĐÃ THÊM LẠI Ở ĐÂY) ---
  if (msg.content.startsWith("!kick")) {
      if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply("❌ Cần quyền Kick.");
      const user = msg.mentions.members.first();
      if (user) user.kick().then(() => msg.reply("✅ Đã kick thành công.")).catch(() => msg.reply("❌ Không thể kick (Check role bot)."));
      else msg.reply("❗ Hãy tag người cần kick.");
  }
});

// ANTI-RAID (CHẠY RIÊNG BIỆT)
const joinMap = new Map();
client.on(Events.GuildMemberAdd, async (member) => {
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
});

client.login(process.env.TOKEN);

const app = express();
app.get("/", (req, res) => res.send("Bot Online - Full Features"));
app.listen(process.env.PORT || 3000);

