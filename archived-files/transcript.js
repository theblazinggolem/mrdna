const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("transcript")
        .setDescription("Fetches messages and saves them to a text file.")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription(
                    "The user this transcript is for (e.g., the ticket creator)."
                )
                .setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName("count")
                .setDescription(
                    "Number of messages to fetch. Leave blank to fetch all messages."
                )
                .setRequired(false)
                .setMinValue(1)
        )
        .setDMPermission(false)
        .addBooleanOption((option) => option.setName("ephemeral"))
        .setDescription("Whether the transcript should be ephemral or not")
        .setRequired(false).set, // Cannot be used in DMs

    async execute(interaction) {
        // Defer the reply to let the user know the bot is working on it.
        await interaction.deferReply();

        try {
            // Get the optional parameters
            const targetUser = interaction.options.getUser("user");
            const countOption = interaction.options.getInteger("count");
            // If count is not provided (null), set requestedCount to Infinity to fetch all messages.
            const requestedCount =
                countOption === null ? Infinity : countOption;

            const channel = interaction.channel;
            let transcript = "";
            const allMessages = [];
            let lastId;

            // Let the user know the process has started, as it can be long.
            await interaction.editReply({
                content:
                    "Fetching messages... This may take a while for large channels.",
            });

            // Fetch messages in batches, filtering bots as we go, until we have enough user messages.
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

            // For very large transcripts, give the user another status update.
            if (allMessages.length > 500) {
                await interaction.editReply({
                    content: `Fetched ${allMessages.length} messages. Now creating the transcript file...`,
                });
            }

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
            // Create dynamic text based on whether a count was provided
            const countText =
                countOption === null
                    ? "all"
                    : `the last **${allMessages.length}**`;

            if (targetUser) {
                finalContent = `Transcript for ticket created by ${targetUser.toString()}.\nHere is the log for ${countText} user messages.`;
            } else {
                finalContent = `Here is the transcript for ${countText} user messages in this channel.`;
            }

            // Send the file and the final message to the user
            await interaction.editReply({
                content: finalContent,
                files: [attachment],
            });
        } catch (error) {
            console.error("Error creating transcript:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: "An error occurred while creating the transcript.",
                    ephemeral: true,
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
