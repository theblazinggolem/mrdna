const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const LOG_CHANNEL_ID = "1424304322812051596";
const OVERRIDE_CODE = "7337#";

// Regex for message links and IDs
const MESSAGE_LINK_REGEX = /channels\/\d+\/(\d+)\/(\d+)/;
const MESSAGE_ID_REGEX = /^\d{17,20}$/;

const forbiddenPatterns = [
    "porn",
    "hitler",
    /\b[gG](?:[oO0]{2,})[nN]\w*\b/i, // goon
    /\bn[i1]g{2,}(?:a|er)?s?\b/i, // n word
    /f[a@]g{1,2}[o0]ts?/i, // f word
    /r[e3]t[a@]rd/i,
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("echo")
        .setDescription("repeats your message")
        .addStringOption((option) =>
            option
                .setName("message")
                .setDescription("The message to send")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("reply_to")
                .setDescription("Message ID or link to reply to")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("override_code")
                .setDescription(
                    "Admin code to bypass certain filters or to enable replying."
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        // --- Defer the reply immediately to prevent "Unknown Interaction" error ---
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const messageContent = interaction.options.getString("message");
        const overrideCodeInput =
            interaction.options.getString("override_code");
        const replyToInput = interaction.options.getString("reply_to");
        const hasOverride = overrideCodeInput === OVERRIDE_CODE;

        if (!messageContent.trim()) {
            return interaction.editReply({
                content: "Cannot send an empty message!",
            });
        }

        // --- Filtering Logic ---
        const alwaysForbiddenPatterns = [
            { pattern: /@everyone/, name: "@everyone mention" },
            { pattern: /@here/, name: "@here mention" },
            { pattern: /<@&\d+>/, name: "role mention" },
        ];

        for (const { pattern, name } of alwaysForbiddenPatterns) {
            if (pattern.test(messageContent)) {
                return interaction.editReply({
                    content: `Your message contains a forbidden ${name}, which is not allowed under any circumstances.`,
                });
            }
        }

        if (!hasOverride) {
            if (/<@\d+>/.test(messageContent)) {
                return interaction.editReply({
                    content: `Your message contains a user mention, which is not allowed.`,
                });
            }
            if (hasForbiddenContent(messageContent, forbiddenPatterns)) {
                return interaction.editReply({
                    content: `Your message contains a forbidden word or pattern.`,
                });
            }
        }

        // --- Reply Logic ---
        let targetMessage = null;
        if (replyToInput) {
            if (!hasOverride) {
                return interaction.editReply({
                    content: "You don't have permissions to use this option",
                });
            }
            targetMessage = await findMessage(
                interaction.channel,
                replyToInput
            );
            if (!targetMessage) {
                return interaction.editReply({
                    content:
                        "Could not find the message to reply to. Please check the ID or link.",
                });
            }
        }

        // --- Send the Message and Log ---
        try {
            let sentMessage;
            if (targetMessage) {
                // Replying to a specific message
                sentMessage = await targetMessage.reply({
                    content: messageContent,
                    allowedMentions: { repliedUser: false }, // Don't ping the author of the message being replied to
                });
            } else {
                // Sending a new message in the channel
                sentMessage = await interaction.channel.send({
                    content: messageContent,
                });
            }

            await interaction.editReply({
                content: "Message sent!",
            });

            await sendLogMessage(
                interaction,
                messageContent,
                sentMessage,
                targetMessage
            );
        } catch (error) {
            console.error("Error in echo command:", error);
            await interaction
                .editReply({
                    content: "There was an error while sending the message!",
                })
                .catch(console.error); // Fallback catch
        }
    },
};

// --- Helper Functions ---

function hasForbiddenContent(message, patterns) {
    for (const item of patterns) {
        const regex =
            item instanceof RegExp
                ? item
                : new RegExp(
                      `\\b${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
                      "i"
                  );
        if (regex.test(message)) return true;
    }
    return false;
}

async function findMessage(channel, input) {
    try {
        const linkMatch = input.match(MESSAGE_LINK_REGEX);
        const idMatch = input.match(MESSAGE_ID_REGEX);

        let messageId;
        if (linkMatch) {
            messageId = linkMatch[2];
        } else if (idMatch) {
            messageId = idMatch[0];
        } else {
            return null; // Invalid format
        }

        return await channel.messages.fetch(messageId);
    } catch {
        return null; // Message not found or other error
    }
}

async function sendLogMessage(
    interaction,
    content,
    sentMessage,
    repliedMessage
) {
    try {
        const logChannel = await interaction.guild.channels.fetch(
            LOG_CHANNEL_ID
        );
        if (!logChannel || !logChannel.isTextBased()) return;

        const replyInfo = repliedMessage
            ? `\n-# In reply to: ${repliedMessage.url}`
            : "";

        const logMessage = [
            `**${
                interaction.user.username
            }** sent a message in ${interaction.channel.toString()}:`,
            `> ${content}`,
            `-# Jump to sent message: ${sentMessage.url}${replyInfo}`,
        ].join("\n");

        await logChannel.send(logMessage);
    } catch (error) {
        console.error("Failed to send log message:", error);
    }
}
