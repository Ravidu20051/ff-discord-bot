require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const FF_API_KEY = process.env.FF_API_KEY || '';
const FF_API_BASE = process.env.FF_API_BASE || 'https://api.example.com';

// ----------------- Register Slash Command -----------------
const commands = [
  new SlashCommandBuilder()
    .setName('ff')
    .setDescription('Check Free Fire stats by ID')
    .addStringOption(opt =>
      opt.setName('id')
        .setDescription('Enter Free Fire Player ID')
        .setRequired(true)
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('⏳ Registering slash command...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash command registered.');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
})();

// ----------------- Cache & Rate Limit -----------------
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 min
let lastApiCall = 0;
const MIN_INTERVAL = 1000;

async function fetchFFStats(ffId) {
  const cached = cache.get(ffId);
  if (cached && cached.expires > Date.now()) return cached.data;

  // Simple rate limit
  const wait = Math.max(0, MIN_INTERVAL - (Date.now() - lastApiCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastApiCall = Date.now();

  try {
    const url = `${FF_API_BASE}/ff/stats/${encodeURIComponent(ffId)}?key=${encodeURIComponent(FF_API_KEY)}`;
    const res = await axios.get(url);
    const data = res.data;

    cache.set(ffId, { data, expires: Date.now() + CACHE_TTL });
    return data;
  } catch (err) {
    throw new Error('API Error');
  }
}

// ----------------- Discord Client -----------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ff') {
    const ffId = interaction.options.getString('id');
    await interaction.deferReply();

    try {
      const stats = await fetchFFStats(ffId);

      const embed = new EmbedBuilder()
        .setTitle(`🎮 Free Fire Stats — ${stats.username || ffId}`)
        .addFields(
          { name: '⭐ Level', value: `${stats.level ?? 'N/A'}`, inline: true },
          { name: '🏆 Rank', value: `${stats.rank ?? 'N/A'}`, inline: true },
          { name: '🔫 Kills', value: `${stats.kills ?? 'N/A'}`, inline: true },
          { name: '⚔️ Matches', value: `${stats.matches ?? 'N/A'}`, inline: true },
          { name: '🔥 K/D', value: `${stats.kd ?? 'N/A'}`, inline: true }
        )
        .setColor(0xFF0000)
        .setFooter({ text: 'Data from Free Fire API' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.editReply(`❌ Could not get stats for ID: ${ffId}`);
    }
  }
});

client.login(TOKEN);
