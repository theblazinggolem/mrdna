const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const STREAM_ROLE_ID = "1498877432780820610";
const LOG_CHANNEL_ID = "1207983772398526504";
const GLOBAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const channelCooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("stream")
        .setDescription("Pings the stream role")
        .addStringOption((option) =>
            option
                .setName("content")
                .setDescription("What are you streaming?")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("channel")
                .setDescription("Where are you streaming?")
                .addChoices(
                    { name: "General", value: "843830483141525564" },
                    { name: "Music", value: "843830571158339644" },
                    { name: "Stream", value: "843831162732544030" }
                )
        ),

    async execute(interaction) {
        try {
            const { guild, channel, member, user } = interaction;
            const contents = interaction.options.getString("content");
            const voiceChannelId = member.voice.channelId;
            const targetChannelId = interaction.options.getString("channel") || voiceChannelId;
            const channelSuffix = targetChannelId ? ` in <#${targetChannelId}>` : "";

            // 1. Mentions Check
            const pingPatterns = [/@everyone/, /@here/, /<@&?\d+>/];
            if (pingPatterns.some((p) => p.test(contents))) {
                return interaction.reply({
                    content: "Please send the command again without any mentions.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // 2. Link Blocking
            const linkRegex = /https?:\/\/\S+/;
            if (linkRegex.test(contents)) {
                const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logMsg = `**Stream Blocked (Link)**\n**User:** <@${user.id}> (${user.id})\n**Channel:** ${channel.toString()}\n**Content:** ${contents}`;
                    await logChannel.send({ content: logMsg });
                }
                return interaction.reply({
                    content: "Links are not allowed in the stream command.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // 3. Cooldown Check
            const now = Date.now();
            const unlockTime = channelCooldowns.get(channel.id) || 0;
            if (now < unlockTime) {
                const timeLeft = Math.floor(unlockTime / 1000);
                return interaction.reply({
                    content: `Command is on cooldown. Available <t:${timeLeft}:R>`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            channelCooldowns.set(channel.id, now + GLOBAL_COOLDOWN_MS);

            // 4. Action Row for Role Toggle
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("toggle_stream_role")
                    .setLabel("Toggle Stream Notifications")
                    .setStyle(ButtonStyle.Primary)
            );

            // 5. Send Stream Ping
            await interaction.reply({
                content: `<@&${STREAM_ROLE_ID}>, <@${user.id}> is streaming **${contents}**${channelSuffix}`,
                components: [row],
                allowedMentions: { roles: [STREAM_ROLE_ID], users: [user.id] },
            });
        } catch (error) {
            console.error("Error in stream command:", error);
            await interaction.reply({
                content: "There was an error sending the message.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
