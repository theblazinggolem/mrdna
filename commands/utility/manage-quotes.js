const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../../db.js");

const STAFF_ROLE_ID = "867964544717295646";
const LOG_CHANNEL_ID = "1350108952041492561";

function normalizeLink(link) {
    return link.replace(
        /https?:\/\/(canary\.|ptb\.)?discord\.com/,
        "https://discord.com"
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("manage-quotes")
        .setDescription("Manage the quote database")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add a new quote from a message link")
                .addStringOption((option) =>
                    option
                        .setName("link")
                        .setDescription("The message link")
                        .setRequired(true)
                )
                .addBooleanOption((option) =>
                    option
                        .setName("reply")
                        .setDescription("Include the reply context?")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove a quote by its link")
                .addStringOption((option) =>
                    option
                        .setName("link")
                        .setDescription("The message link to remove")
                        .setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("edit")
                .setDescription("Edit the reply status of an existing quote")
                .addStringOption((option) =>
                    option
                        .setName("link")
                        .setDescription("The message link of the quote")
                        .setRequired(true)
                )
                .addBooleanOption((option) =>
                    option
                        .setName("show_reply")
                        .setDescription(
                            "True to add/show reply, False to remove it"
                        )
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(
            PermissionFlagsBits.Administrator
        );
        const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);

        if (!isAdmin && !isStaff) {
            return interaction.reply({
                content:
                    "You do not have permission to use this command. (Staff/Admin only)",
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const rawLink = interaction.options.getString("link");
        const link = normalizeLink(rawLink);

        const logChannel = await interaction.client.channels
            .fetch(LOG_CHANNEL_ID)
            .catch(() => null);

        const linkParts = link.split("/");
        const messageId = linkParts.pop();
        const channelId = linkParts.pop();

        if (!messageId || !channelId) {
            return interaction.editReply({
                content: "Invalid Discord message link provided.",
            });
        }

        try {
            if (subcommand === "add") {
                const wantReply = interaction.options.getBoolean("reply");

                const channel = await interaction.client.channels.fetch(
                    channelId
                );
                if (!channel)
                    return interaction.editReply({
                        content: "Could not access that channel.",
                    });

                const quoteMsg = await channel.messages.fetch(messageId);
                if (!quoteMsg)
                    return interaction.editReply({
                        content: "Could not find that message.",
                    });

                let replyText = null;

                if (wantReply && quoteMsg.reference) {
                    try {
                        const referencedMsg = await channel.messages.fetch(
                            quoteMsg.reference.messageId
                        );
                        replyText = referencedMsg.content;
                    } catch (err) {
                        console.log("Could not fetch original reply message.");
                        replyText = null;
                    }
                }

                const check = await db.query(
                    "SELECT * FROM quotes WHERE link = $1",
                    [link]
                );
                if (check.rows.length > 0) {
                    return interaction.editReply({
                        content: "This quote is already in the database.",
                    });
                }

                await db.query(
                    "INSERT INTO quotes (text, link, reply) VALUES ($1, $2, $3)",
                    [quoteMsg.content, link, replyText]
                );

                if (logChannel) {
                    logChannel.send(
                        `**Quote Added** by <@${interaction.user.id}>\n**Text:** ${quoteMsg.content}\n**Link:** ${link}`
                    );
                }

                return interaction.editReply({
                    content: `Quote added successfully!\n> ${quoteMsg.content}`,
                });
            }

            if (subcommand === "remove") {
                const result = await db.query(
                    "DELETE FROM quotes WHERE link = $1",
                    [link]
                );

                if (result.rowCount === 0) {
                    return interaction.editReply({
                        content: "No quote found with that link.",
                    });
                }

                if (logChannel) {
                    logChannel.send(
                        `**Quote removed** by <@${interaction.user.id}>.\n**Link**: ${link},`
                    );
                }

                return interaction.editReply({
                    content: "Quote deleted successfully.",
                });
            }

            if (subcommand === "edit") {
                const showReply = interaction.options.getBoolean("show_reply");

                const check = await db.query(
                    "SELECT * FROM quotes WHERE link = $1",
                    [link]
                );
                if (check.rows.length === 0) {
                    return interaction.editReply({
                        content:
                            "Cannot edit: No quote found with that link in the DB.",
                    });
                }

                let newReplyContent = null;

                if (showReply) {
                    const channel = await interaction.client.channels.fetch(
                        channelId
                    );
                    const quoteMsg = await channel.messages.fetch(messageId);

                    if (quoteMsg.reference) {
                        try {
                            const referencedMsg = await channel.messages.fetch(
                                quoteMsg.reference.messageId
                            );
                            newReplyContent = referencedMsg.content;
                        } catch (err) {
                            return interaction.editReply({
                                content:
                                    "Tried to fetch the reply, but the original message seems to be deleted.",
                            });
                        }
                    } else {
                        return interaction.editReply({
                            content: "This message is not a reply to anything.",
                        });
                    }
                }

                await db.query("UPDATE quotes SET reply = $1 WHERE link = $2", [
                    newReplyContent,
                    link,
                ]);

                if (logChannel) {
                    logChannel.send(
                        `**Quote edited** by <@${
                            interaction.user.id
                        }>\n**Link:** ${link}\n**Reply Context:** ${
                            showReply ? "Enabled" : "Disabled"
                        }`
                    );
                }

                return interaction.editReply({
                    content: `Quote updated. Reply field set to: ${
                        showReply ? "Visible" : "Null"
                    }.`,
                });
            }
        } catch (error) {
            console.error(error);
            return interaction.editReply({
                content: `An error occurred: ${error.message}`,
            });
        }
    },
};
