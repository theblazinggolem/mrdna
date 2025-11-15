const {
    SlashCommandBuilder,
    MessageFlags,
    PermissionFlagsBits,
} = require("discord.js");

const activeMonitors = new Map();

const channelCooldowns = new Map();

const forbiddenPatterns = [
    "porn",
    "fuck",
    "bitch",
    "hitler",
    /\b[gG](?:[oO0]{2,})[nN]\w*\b/, //goon
    /\bn[i1]g{2,}(?:a|er)?s?\b/i, //n word
    /f[a@]g{1,2}[o0]ts?/, // f word
    /r[e3]t[a@]rd/,
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("revive")
        .setDescription("Pings the chat role with a topic to discuss")
        .addStringOption((option) =>
            option
                .setName("topic")
                .setDescription("The topic to discuss")
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const channel = interaction.channel;
            const topic = interaction.options.getString("topic");
            const roleId = "858331630997340170";

            // Check for ping injection attempts
            const pingPatterns = [
                /@everyone/,
                /@here/,
                /<@&?\d+>/, // Matches both role mentions (<@&role_id>) and user mentions (<@user_id>)
            ];

            for (const pattern of pingPatterns) {
                if (pattern.test(topic)) {
                    await interaction.reply({
                        content:
                            "Please send the command again without any mentions (@everyone, @here, or role/user mentions).",
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
            }

            // --- NEW: Check for forbidden words or patterns ---
            for (const pattern of forbiddenPatterns) {
                // This handles both strings and RegExp objects from the array.
                // For strings, it creates a case-insensitive regex that matches the whole word.
                const regex =
                    pattern instanceof RegExp
                        ? pattern
                        : new RegExp(`\\b${pattern}\\b`, "i");

                if (regex.test(topic)) {
                    await interaction.reply({
                        content:
                            "Your topic contains a forbidden word or pattern. Please try again.",
                        flags: MessageFlags.Ephemeral,
                    });
                    return; // Stop the command execution
                }
            }

            // Restored cooldown check
            const cooldownTime = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
            const lastUsed = channelCooldowns.get(channel.id);
            if (lastUsed) {
                const timeLeft = cooldownTime - (Date.now() - lastUsed);
                if (timeLeft > 0) {
                    const cooldownEndTime = Math.floor(
                        (lastUsed + cooldownTime) / 1000
                    );

                    await interaction.reply({
                        content: `This command is on cooldown until <t:${cooldownEndTime}:t>.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
            }

            // Set cooldown timestamp
            channelCooldowns.set(channel.id, Date.now());

            // Use the working approach with direct role ping
            console.log("Sending message with direct role ping...");

            await interaction.reply({
                content: `<@&${roleId}> Let's discuss: ${topic}`,
                allowedMentions: {
                    roles: [roleId],
                },
            });

            console.log("Message sent with allowedMentions!");
        } catch (error) {
            console.error("Error in revive command:", error);
            await interaction.reply({
                content:
                    "There was an error sending the message. Please try again.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
