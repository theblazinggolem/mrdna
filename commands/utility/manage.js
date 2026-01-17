const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    AttachmentBuilder,
    MessageFlags,
} = require("discord.js");
const db = require("../../db.js");

const STAFF_ROLE_ID = "867964544717295646";
const LOG_CHANNEL_ID = "1461971930880938129";
const QUOTES_TABLE = "quotes";
const WORDLE_TABLE = "wordle_jurassic";

function normalizeLink(link) {
    return link.replace(
        /https?:\/\/(canary\.|ptb\.)?discord\.com/,
        "https://discord.com"
    );
}

async function sendLog(interaction, header, contentCodeBlock) {
    try {
        const channel = await interaction.client.channels
            .fetch(LOG_CHANNEL_ID)
            .catch(() => null);
        if (channel) {
            await channel.send(
                `${header} by ${interaction.user.username} (${interaction.user.id})\n${contentCodeBlock}`
            );
        }
    } catch (err) {
        console.error("Failed to send log:", err);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("manage")
        .setDescription("Manage Quotes and Wordle Database")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        // --- QUOTES COMMANDS ---
        .addSubcommand((sub) =>
            sub
                .setName("quotes-add")
                .setDescription("Add a quote")
                .addStringOption((opt) =>
                    opt
                        .setName("link")
                        .setDescription("Message link")
                        .setRequired(true)
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName("reply")
                        .setDescription("Include reply?")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("quotes-edit")
                .setDescription("Edit quote reply status")
                .addStringOption((opt) =>
                    opt
                        .setName("link")
                        .setDescription("Message link")
                        .setRequired(true)
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName("show_reply")
                        .setDescription("Show reply context?")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("quotes-remove")
                .setDescription("Remove a quote")
                .addStringOption((opt) =>
                    opt
                        .setName("link")
                        .setDescription("Message link")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName("quotes-export").setDescription("Export quotes JSON")
        )

        // --- WORDLE COMMANDS ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-add")
                .setDescription("Add a single word")
                .addStringOption((opt) =>
                    opt
                        .setName("word")
                        .setDescription("The word")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("category")
                        .setDescription("Category")
                        .setRequired(true)
                        .addChoices(
                            { name: "Creature", value: "creature" },
                            { name: "Human", value: "human" },
                            { name: "Other", value: "other" }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("wordle-bulk-add")
                .setDescription("Add multiple words via popup")
                .addStringOption((opt) =>
                    opt
                        .setName("category")
                        .setDescription("Category for all words")
                        .setRequired(true)
                        .addChoices(
                            { name: "Creature", value: "creature" },
                            { name: "Human", value: "human" },
                            { name: "Other", value: "other" }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("wordle-edit")
                .setDescription("Edit a word")
                .addStringOption((opt) =>
                    opt
                        .setName("target_word")
                        .setDescription("The current word to find")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("new_word")
                        .setDescription("New spelling (Optional)")
                        .setRequired(false)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("category")
                        .setDescription("New category (Optional)")
                        .setRequired(false)
                        .addChoices(
                            { name: "Creature", value: "creature" },
                            { name: "Human", value: "human" },
                            { name: "Other", value: "other" }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("wordle-remove")
                .setDescription("Remove a word")
                .addStringOption((opt) =>
                    opt
                        .setName("target_word")
                        .setDescription("The word to remove")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName("wordle-export").setDescription("Export words JSON")
        ),

    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(
            PermissionFlagsBits.Administrator
        );
        const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);

        if (!isAdmin && !isStaff) {
            return interaction.reply({
                content: "❌ Permission Denied.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // ====================================================
        //                 WORDLE: BULK ADD
        // ====================================================
        if (subcommand === "wordle-bulk-add") {
            const category = interaction.options.getString("category");
            const modal = new ModalBuilder()
                .setCustomId(`wordle_bulk_${category}`)
                .setTitle(`Bulk Add (${category})`);

            const input = new TextInputBuilder()
                .setCustomId("words_input")
                .setLabel("Enter words (comma/newline separated)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);

            try {
                // This 'await' is safe; it has a built-in timeout of 5 mins
                const submission = await interaction.awaitModalSubmit({
                    time: 300_000,
                    filter: (i) => i.user.id === interaction.user.id,
                });

                await submission.deferReply({ flags: MessageFlags.Ephemeral });

                const rawInput =
                    submission.fields.getTextInputValue("words_input");

                // SQUASHING: Split by comma OR newline, then remove symbols
                const words = rawInput
                    .split(/[,\n]+/)
                    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
                    .filter((w) => w.length > 0);

                let addedRecords = [];
                let errors = [];

                for (const word of words) {
                    try {
                        const res = await db.query(
                            `INSERT INTO ${WORDLE_TABLE} (word, category, added_by) VALUES ($1, $2, $3) RETURNING *`,
                            [word, category, interaction.user.id]
                        );
                        addedRecords.push(res.rows[0]);
                    } catch (err) {
                        if (err.code === "23505")
                            errors.push(`${word} (Duplicate)`);
                        else errors.push(`${word} (Error)`);
                    }
                }

                if (addedRecords.length > 0) {
                    const header = `**Wordle Bulk Added** by ${interaction.user.username} (${interaction.user.id})`;
                    // Format: "word", (new line) "word"
                    const simpleList = addedRecords
                        .map((r) => `"${r.word}"`)
                        .join(",\n");
                    const textLog = `${header}\n\`\`\`json\n[\n${simpleList}\n]\n\`\`\``;

                    const channel = await interaction.client.channels
                        .fetch(LOG_CHANNEL_ID)
                        .catch(() => null);

                    if (channel) {
                        if (textLog.length < 1950) {
                            await channel.send(textLog);
                        } else {
                            const file = new AttachmentBuilder(
                                Buffer.from(
                                    JSON.stringify(addedRecords, null, 2)
                                ),
                                { name: "bulk_log.json" }
                            );
                            await channel.send({
                                content: `${header}\n(Log too large for text, see attached file)`,
                                files: [file],
                            });
                        }
                    }
                }

                return submission.editReply(
                    `✅ Bulk process complete.\n**Added:** ${
                        addedRecords.length
                    }\n**Errors:** ${errors.join(", ") || "None"}`
                );
            } catch (err) {
                console.error(err);
            }
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // ====================================================
        //                 QUOTES LOGIC
        // ====================================================
        if (subcommand.startsWith("quotes-")) {
            if (subcommand === "quotes-export") {
                const res = await db.query(
                    `SELECT * FROM ${QUOTES_TABLE} ORDER BY id ASC`
                );
                const file = new AttachmentBuilder(
                    Buffer.from(JSON.stringify(res.rows, null, 2)),
                    { name: "quotes_export.json" }
                );
                return interaction.editReply({
                    content: "📂 Quotes Backup:",
                    files: [file],
                });
            }

            const link = normalizeLink(interaction.options.getString("link"));
            const linkParts = link.split("/");
            const messageId = linkParts.pop();
            const channelId = linkParts.pop();

            if (!messageId || !channelId)
                return interaction.editReply(
                    "❌ Invalid Discord Message Link."
                );

            if (subcommand === "quotes-add") {
                const wantReply = interaction.options.getBoolean("reply");
                const check = await db.query(
                    `SELECT * FROM ${QUOTES_TABLE} WHERE link = $1`,
                    [link]
                );
                if (check.rows.length > 0)
                    return interaction.editReply("⚠️ Quote already exists.");

                const channel = await interaction.client.channels
                    .fetch(channelId)
                    .catch(() => null);
                if (!channel)
                    return interaction.editReply("❌ Cannot access channel.");
                const msg = await channel.messages
                    .fetch(messageId)
                    .catch(() => null);
                if (!msg)
                    return interaction.editReply("❌ Cannot find message.");

                let replyText = null;
                if (wantReply && msg.reference) {
                    const refMsg = await channel.messages
                        .fetch(msg.reference.messageId)
                        .catch(() => null);
                    if (refMsg) replyText = refMsg.content;
                }

                const res = await db.query(
                    `INSERT INTO ${QUOTES_TABLE} (text, link, reply) VALUES ($1, $2, $3) RETURNING *`,
                    [msg.content, link, replyText]
                );

                const jsonLog = JSON.stringify(res.rows[0], null, 2);
                await sendLog(
                    interaction,
                    "Quote added",
                    `\`\`\`json\n${jsonLog}\n\`\`\``
                );

                return interaction.editReply(
                    `✅ Quote added!\n> ${msg.content}`
                );
            }

            if (subcommand === "quotes-remove") {
                const res = await db.query(
                    `DELETE FROM ${QUOTES_TABLE} WHERE link = $1 RETURNING *`,
                    [link]
                );
                if (res.rowCount === 0)
                    return interaction.editReply("⚠️ Quote not found.");

                const jsonLog = JSON.stringify(res.rows[0], null, 2);
                await sendLog(
                    interaction,
                    "Quote deleted",
                    `\`\`\`json\n${jsonLog}\n\`\`\``
                );

                return interaction.editReply("✅ Quote removed.");
            }

            if (subcommand === "quotes-edit") {
                const showReply = interaction.options.getBoolean("show_reply");

                const oldRes = await db.query(
                    `SELECT * FROM ${QUOTES_TABLE} WHERE link = $1`,
                    [link]
                );
                if (oldRes.rows.length === 0)
                    return interaction.editReply("❌ Quote not found.");
                const oldRecord = oldRes.rows[0];

                let newReplyContent = null;
                if (showReply) {
                    const channel = await interaction.client.channels.fetch(
                        channelId
                    );
                    const msg = await channel.messages.fetch(messageId);
                    if (!msg.reference)
                        return interaction.editReply(
                            "❌ This message has no reply."
                        );
                    const ref = await channel.messages.fetch(
                        msg.reference.messageId
                    );
                    newReplyContent = ref.content;
                }

                await db.query(
                    `UPDATE ${QUOTES_TABLE} SET reply = $1 WHERE link = $2`,
                    [newReplyContent, link]
                );

                const diff = [
                    "{",
                    `  "id": ${oldRecord.id},`,
                    `  "text": "${oldRecord.text.replace(/"/g, '\\"')}",`,
                    `  "link": "${oldRecord.link}",`,
                    `- "reply": ${
                        oldRecord.reply ? `"${oldRecord.reply}"` : "null"
                    }`,
                    `+ "reply": ${
                        newReplyContent ? `"${newReplyContent}"` : "null"
                    }`,
                    "}",
                ].join("\n");

                await sendLog(
                    interaction,
                    "Quote edited",
                    `\`\`\`diff\n${diff}\n\`\`\``
                );
                return interaction.editReply(`✅ Quote updated.`);
            }
        }

        // ====================================================
        //                 WORDLE: SINGLE ADD / EDIT / REMOVE
        // ====================================================
        if (subcommand.startsWith("wordle-")) {
            if (subcommand === "wordle-export") {
                const res = await db.query(
                    `SELECT * FROM ${WORDLE_TABLE} ORDER BY created_on DESC`
                );
                const file = new AttachmentBuilder(
                    Buffer.from(JSON.stringify(res.rows, null, 2)),
                    { name: "wordle_export.json" }
                );
                return interaction.editReply({
                    content: "📂 Wordle Database Backup:",
                    files: [file],
                });
            }

            if (subcommand === "wordle-add") {
                const word = interaction.options
                    .getString("word")
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");
                const category = interaction.options.getString("category");

                try {
                    const res = await db.query(
                        `INSERT INTO ${WORDLE_TABLE} (word, category, added_by) VALUES ($1, $2, $3) RETURNING *`,
                        [word, category, interaction.user.id]
                    );

                    const jsonLog = JSON.stringify(res.rows[0], null, 2);
                    await sendLog(
                        interaction,
                        "Wordle Added",
                        `\`\`\`json\n${jsonLog}\n\`\`\``
                    );

                    return interaction.editReply(`✅ Added **${word}**`);
                } catch (err) {
                    if (err.code === "23505")
                        return interaction.editReply("⚠️ Word already exists.");
                    throw err;
                }
            }

            if (subcommand === "wordle-remove") {
                const target = interaction.options
                    .getString("target_word")
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");

                const res = await db.query(
                    `DELETE FROM ${WORDLE_TABLE} WHERE word = $1 RETURNING *`,
                    [target]
                );

                if (res.rowCount === 0)
                    return interaction.editReply("❌ Word not found.");

                const jsonLog = JSON.stringify(res.rows[0], null, 2);
                await sendLog(
                    interaction,
                    "Wordle Deleted",
                    `\`\`\`json\n${jsonLog}\n\`\`\``
                );

                return interaction.editReply(
                    `✅ Removed **${res.rows[0].word}**.`
                );
            }

            if (subcommand === "wordle-edit") {
                const target = interaction.options
                    .getString("target_word")
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");

                const rawNewWord = interaction.options.getString("new_word");
                const newCategory = interaction.options.getString("category");

                if (!rawNewWord && !newCategory) {
                    return interaction.editReply(
                        "⚠️ You must provide either a `new_word` or a `category` to edit."
                    );
                }

                const search = await db.query(
                    `SELECT * FROM ${WORDLE_TABLE} WHERE word = $1`,
                    [target]
                );
                if (search.rows.length === 0)
                    return interaction.editReply(
                        `❌ Word **${target}** not found.`
                    );

                const oldRecord = search.rows[0];
                const finalWord = rawNewWord
                    ? rawNewWord.toLowerCase().replace(/[^a-z]/g, "")
                    : oldRecord.word;
                const finalCategory = newCategory || oldRecord.category;

                try {
                    await db.query(
                        `UPDATE ${WORDLE_TABLE} SET word = $1, category = $2 WHERE word = $3`,
                        [finalWord, finalCategory, oldRecord.word]
                    );

                    let diffBody = "";
                    if (finalWord !== oldRecord.word)
                        diffBody += `- "word": "${oldRecord.word}",\n+ "word": "${finalWord}",\n`;
                    else diffBody += `  "word": "${oldRecord.word}",\n`;

                    if (finalCategory !== oldRecord.category)
                        diffBody += `- "category": "${oldRecord.category}",\n+ "category": "${finalCategory}",\n`;
                    else diffBody += `  "category": "${oldRecord.category}",\n`;

                    diffBody += `  "added_by": "${
                        oldRecord.added_by
                    }",\n  "created_on": "${oldRecord.created_on.toISOString()}"`;

                    const diff = `{\n${diffBody}\n}`;
                    await sendLog(
                        interaction,
                        "Wordle Edited",
                        `\`\`\`diff\n${diff}\n\`\`\``
                    );
                    return interaction.editReply(
                        `✅ Updated **${oldRecord.word}** (Name: ${finalWord}, Cat: ${finalCategory})`
                    );
                } catch (err) {
                    if (err.code === "23505")
                        return interaction.editReply(
                            `⚠️ The word **${finalWord}** already exists.`
                        );
                    throw err;
                }
            }
        }
    },
};
