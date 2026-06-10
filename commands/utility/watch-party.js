const {
    SlashCommandBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const WATCH_PARTY_ROLE_ID = "1285652226009862204";
const LOG_CHANNEL_ID = "1207983772398526504";
const GLOBAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const channelCooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("watch-party")
        .setDescription("Pings the watch party role")
        .addStringOption((option) =>
            option
                .setName("content")
                .setDescription("What are you watching?")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("channel")
                .setDescription("Where are you watching?")
                .addChoices(
                    { name: "General", value: "843830483141525564" },
                    { name: "Music", value: "843830571158339644" },
                    { name: "Stream", value: "843831162732544030" },
                ),
        ),

    async execute(interaction) {
        try {
            const { guild, channel, member, user } = interaction;
            const contents = interaction.options.getString("content");
            const voiceChannelId = member.voice.channelId;
            const targetChannelId =
                interaction.options.getString("channel") || voiceChannelId;
            const channelSuffix = targetChannelId
                ? ` in <#${targetChannelId}>`
                : "";

            // 1. Mentions Check
            const pingPatterns = [/@everyone/, /@here/, /<@&?\d+>/];
            if (pingPatterns.some((p) => p.test(contents))) {
                return interaction.reply({
                    content:
                        "Please send the command again without any mentions.",
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

            // 4. Send Watch Party Ping
            await interaction.reply({
                content: `<@${user.id}> is hosting a <@&${WATCH_PARTY_ROLE_ID}> for **${contents}**${channelSuffix}\n-# if you don't want to get pinged, go to <id:customize> & remove the role`,
                allowedMentions: {
                    roles: [WATCH_PARTY_ROLE_ID],
                    users: [user.id],
                },
            });
        } catch (error) {
            console.error("Error in watch-party command:", error);
            await interaction.reply({
                content: "There was an error sending the message.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
