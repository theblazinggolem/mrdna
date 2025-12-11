const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
} = require("discord.js");

const TRANSCRIPT_LOG_CHANNEL_ID = "915884828153511946";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("transcript")
        .setDescription("Fetches messages and saves them to a text file")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("The user this transcript is for")
                .setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName("count")
                .setDescription("Number of messages to fetch (default: 250)")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1000)
        )
        .addBooleanOption((option) =>
            option
                .setName("ephemeral")
                .setDescription("Whether the msg is ephemeral")
                .setRequired(false)
        )
        .setDMPermission(false), // Cannot be used in DMs

    async execute(interaction) {
        const isEphemeral =
            interaction.options.getBoolean("ephemeral") || false;
        await interaction.deferReply({
            flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        });

        try {
            // Get the optional parameters
            const targetUser = interaction.options.getUser("user");
            const countOption = interaction.options.getInteger("count");

            // Logic: Default to 250 if blank. Max is 1000.
            let requestedCount = countOption === null ? 250 : countOption;
            if (requestedCount > 1000) requestedCount = 1000;

            const channel = interaction.channel;
            let transcript = "";
            const allMessages = [];
            let lastId;

            // Let the user know the process has started
            await interaction.editReply({
                content: `Fetching the last ${requestedCount} messages...`,
            });

            // Fetch messages in batches
            while (allMessages.length < requestedCount) {
                const options = { limit: 100 }; // Fetch in full batches for efficiency
                if (lastId) {
                    options.before = lastId;
                }

                const messages = await channel.messages.fetch(options);

                // Add non-bot messages to our collection, respecting the requested count
                messages.forEach((msg) => {
                    if (
                        !msg.author.bot &&
                        allMessages.length < requestedCount
                    ) {
                        allMessages.push(msg);
                    }
                });

                lastId = messages.lastKey();

                // If we fetch a batch with fewer than 100 messages, we've reached the end of the channel.
                if (messages.size < 100) {
                    break;
                }
            }

            if (allMessages.length === 0) {
                await interaction.editReply({
                    content:
                        "There are no user messages in this channel to create a transcript from.",
                });
                return;
            }

            // Reverse the array at the end to get chronological order (oldest first)
            allMessages.reverse();

            // Format each message into the desired string format
            for (const message of allMessages) {
                const timestamp = new Date(
                    message.createdTimestamp
                ).toLocaleString("en-US", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                });
                const username = message.author.tag;
                const content = message.content || "[No message content]";

                let transcriptEntry = "";

                if (message.reference && message.reference.messageId) {
                    try {
                        const repliedMessage = await channel.messages.fetch(
                            message.reference.messageId
                        );
                        const repliedContent = (
                            repliedMessage.content || "[No message content]"
                        )
                            .substring(0, 70)
                            .replace(/\n/g, " ");
                        transcriptEntry += `> [Replying to ${repliedMessage.author.tag}: ${repliedContent}...]\n`;
                    } catch (err) {
                        transcriptEntry += `> [Replying to a deleted message]\n`;
                    }
                }

                transcriptEntry += `${timestamp} ${username}: ${content}\n`;

                if (message.attachments.size > 0) {
                    message.attachments.forEach((attachment) => {
                        transcriptEntry += `[Attachment]: ${attachment.url}\n`;
                    });
                }
                transcript += transcriptEntry;
            }

            if (!transcript) {
                await interaction.editReply({
                    content:
                        "Could not generate a transcript. This may be because all recent messages were from bots.",
                });
                return;
            }

            const buffer = Buffer.from(transcript, "utf-8");
            const attachment = new AttachmentBuilder(buffer, {
                name: `transcript-${channel.name}-${Date.now()}.txt`,
            });

            // --- Build the final reply message ---
            let finalContent;
            if (targetUser) {
                finalContent = `Transcript for ticket created by ${targetUser.toString()}.\nHere is the log for the last **${
                    allMessages.length
                }** user messages.`;
            } else {
                finalContent = `Here is the transcript for the last **${allMessages.length}** user messages in this channel.`;
            }

            // --- Create the "Send to Logs" Button ---
            const logButton = new ButtonBuilder()
                .setCustomId("send_to_logs")
                .setLabel("Send to Logs")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📂");

            const row = new ActionRowBuilder().addComponents(logButton);

            // Send the file and the final message to the user
            const response = await interaction.editReply({
                content: finalContent,
                files: [attachment],
                components: [row],
            });

            // --- Create Collector for the Button ---
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000, // Button active for 5 minutes
            });

            collector.on("collect", async (i) => {
                if (i.customId === "send_to_logs") {
                    // Ensure only the person who requested the transcript can click it
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({
                            content:
                                "Only the user who ran the command can send this to logs.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    try {
                        const logChannel =
                            await interaction.guild.channels.fetch(
                                TRANSCRIPT_LOG_CHANNEL_ID
                            );

                        if (logChannel && logChannel.isTextBased()) {
                            await logChannel.send({
                                content: `📄 **Transcript Generated**\n**Channel:** ${channel.toString()}\n**Generated By:** ${interaction.user.toString()}`,
                                files: [attachment],
                            });

                            // Update the button to indicate success
                            const disabledButton = ButtonBuilder.from(logButton)
                                .setLabel("Sent to Logs")
                                .setStyle(ButtonStyle.Success)
                                .setDisabled(true);

                            const newRow = new ActionRowBuilder().addComponents(
                                disabledButton
                            );

                            await i.update({ components: [newRow] });
                        } else {
                            await i.reply({
                                content: `Log channel (${TRANSCRIPT_LOG_CHANNEL_ID}) not found or is not a text channel.`,
                                flags: MessageFlags.Ephemeral,
                            });
                        }
                    } catch (err) {
                        console.error("Error sending transcript to logs:", err);
                        await i.reply({
                            content:
                                "An error occurred while sending the transcript to the log channel.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                }
            });

            collector.on("end", () => {
                // Optional: Disable button when time runs out if it wasn't clicked
                // We typically just leave it or remove it.
                // interaction.editReply({ components: [] }).catch(() => {});
            });
        } catch (error) {
            console.error("Error creating transcript:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: "An error occurred while creating the transcript.",
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.editReply({
                    content:
                        "There was an error while creating the transcript. Please check my permissions and try again.",
                });
            }
        }
    },
};
