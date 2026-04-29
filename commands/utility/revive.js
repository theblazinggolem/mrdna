const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const REVIVE_ROLE_ID = "858331630997340170";
const LOG_CHANNEL_ID = "1350108952041492561";
const GLOBAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const channelCooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("revive")
        .setDescription("Pings the chat role with a topic to discuss")
        .addStringOption((option) =>
            option
                .setName("topic")
                .setDescription("The topic to discuss")
                .setMinLength(24)
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const { guild, channel, user } = interaction;
            const topic = interaction.options.getString("topic");

            const pingPatterns = [/@everyone/, /@here/, /<@&?\d+>/];
            if (pingPatterns.some((p) => p.test(topic))) {
                return interaction.reply({
                    content: "Please send the command again without any mentions.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const now = Date.now();
            const unlockTime = channelCooldowns.get(channel.id) || 0;
            if (now < unlockTime) {
                const timeLeft = Math.floor(unlockTime / 1000);
                return interaction.reply({
                    content: `Command is on cooldown. Next revive <t:${timeLeft}:R>`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            channelCooldowns.set(channel.id, now + GLOBAL_COOLDOWN_MS);

            const linkRegex = /https?:\/\/\S+/;
            if (linkRegex.test(topic)) {
                const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logMsg = `**Chat Revive Link Detected**\n**User:** <@${user.id}> (${user.id})\n**Channel:** ${channel.toString()}\n**Content:** ${topic}`;
                    await logChannel.send({ content: logMsg });
                }
            }

            // 5. Send Revive
            await interaction.reply({
                content: `<@&${REVIVE_ROLE_ID}> Let's discuss: ${topic}\n-# if you don't want to get pinged, go to <id:customize> & remove the role`,
                allowedMentions: { roles: [REVIVE_ROLE_ID] },
            });
        } catch (error) {
            console.error("Error in revive command:", error);
            await interaction.reply({
                content: "There was an error sending the message.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};