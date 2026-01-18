const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
    ComponentType,
} = require("discord.js");
const db = require("../../db.js");
const https = require("https");

const STAFF_ROLE_ID = "867964544717295646";
const LOG_CHANNEL_ID = "1461971930880938129";
const QUOTES_TABLE = "quotes";
const CATEGORY_TABLE = "wordle_categories";
const MULTI_SELECT_OPTION = "➕ Select Multiple...";

const EMOJIS = {
    CHECKMARK: "<:checkmark:1462055059197137069>",
    CROSS: "<:x_:1462055048526954611>",
    HAZARD: "<:hazard:1462056327378501738>",
    CATEGORY_ADD: "<:categoryadd:1459169340002668780>",
    CATEGORY: "<:category:1459169337641275497>",
};

function getTable(choice) {
    return choice === "paleo" ? "wordle_paleo" : "wordle_jurassic";
}

function normalizeLink(link) {
    return link.replace(
        /https?:\/\/(canary\.|ptb\.)?discord\.com/,
        "https://discord.com"
    );
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                let body = "";
                res.on("data", (chunk) => (body += chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .on("error", reject);
    });
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

// Helper to build the Select Menu
async function createCategoryMenu(tableName) {
    const res = await db.query(
        `SELECT DISTINCT unnest(category) as cat FROM ${tableName} ORDER BY cat ASC LIMIT 25`
    );

    if (res.rows.length === 0) return null;

    const menu = new StringSelectMenuBuilder()
        .setCustomId("category_select")
        .setPlaceholder("Select one or more categories...")
        .setMinValues(1)
        .setMaxValues(res.rows.length); // Allow selecting all available

    menu.addOptions(
        res.rows.map((r) => ({
            label: r.cat.charAt(0).toUpperCase() + r.cat.slice(1),
            value: r.cat,
        }))
    );

    return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("manage")
        .setDescription("Manage Quotes and Wordle Databases")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        // --- QUOTES (Standard) ---
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

        // --- WORDLE: BULK ADD ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-bulk-add")
                .setDescription(
                    "Paste a list of words for ONE (or multiple) categories"
                )
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addStringOption((o) =>
                    o
                        .setName("category")
                        .setDescription("Category")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        // --- WORDLE: ADD (Single) ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-add")
                .setDescription("Add a single word")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addStringOption((o) =>
                    o
                        .setName("word")
                        .setDescription("The word")
                        .setRequired(true)
                )
                .addStringOption((o) =>
                    o
                        .setName("category")
                        .setDescription("Categories")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        // --- WORDLE: EDIT ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-edit")
                .setDescription("Edit a word entry")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addStringOption((o) =>
                    o
                        .setName("target_word")
                        .setDescription("Word to find")
                        .setRequired(true)
                )
                .addStringOption((o) =>
                    o
                        .setName("new_word")
                        .setDescription("New spelling")
                        .setRequired(false)
                )
                .addStringOption((o) =>
                    o
                        .setName("category")
                        .setDescription("Edit Cats: '+Tag', '-Tag', or 'Tag'")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        )
        // --- WORDLE: REMOVE ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-remove")
                .setDescription("Remove a word")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addStringOption((o) =>
                    o
                        .setName("target_word")
                        .setDescription("Word to remove")
                        .setRequired(true)
                )
        )
        // --- WORDLE: EXPORT/IMPORT ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-export")
                .setDescription("Export clean JSON for editing")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("wordle-import")
                .setDescription("Import JSON file (Upsert/Overwrite)")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addAttachmentOption((o) =>
                    o
                        .setName("file")
                        .setDescription("The JSON file")
                        .setRequired(true)
                )
        )

        // --- CATEGORY MANAGEMENT ---
        .addSubcommand((sub) =>
            sub
                .setName("category-add")
                .setDescription("Add a new category")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addStringOption((o) =>
                    o
                        .setName("name")
                        .setDescription("Category Name")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("category-edit")
                .setDescription("Rename a category")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addStringOption((o) =>
                    o
                        .setName("name")
                        .setDescription("Old Name")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption((o) =>
                    o
                        .setName("new_name")
                        .setDescription("New Name")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("category-remove")
                .setDescription("Remove a category (erases it from words too)")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
                .addStringOption((o) =>
                    o
                        .setName("name")
                        .setDescription("Category Name")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        // --- WORDLE: BULK REMOVE ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-bulk-remove")
                .setDescription(
                    "Paste a list of words to remove"
                )
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices(
                            { name: "Jurassic", value: "jurassic" },
                            { name: "Paleo", value: "paleo" }
                        )
                )
        ),

    // ---------------------------------------------------------
    //  AUTOCOMPLETE (With "Select Multiple" Option)
    // ---------------------------------------------------------
    async autocomplete(interaction) {
        const dbChoice = interaction.options.getString("database");
        if (!dbChoice) return interaction.respond([]);

        const tableName = getTable(dbChoice);
        const focusedValue = interaction.options.getFocused().toLowerCase();

        try {
            const res = await db.query(`
                SELECT name as cat FROM ${CATEGORY_TABLE}
                WHERE type = $1
                ORDER BY name ASC
            `, [dbChoice]);

            let choices = res.rows
                .map((row) => row.cat)
                .filter((cat) => cat.toLowerCase().includes(focusedValue));

            // Keep top 24 matches
            choices = choices.slice(0, 24);

            // Add the Special Option at the bottom
            choices.push(MULTI_SELECT_OPTION);

            await interaction.respond(
                choices.map((choice) => ({ name: choice, value: choice }))
            );
        } catch (err) {
            console.error("Manage Autocomplete Error:", err);
            await interaction.respond([]);
        }
    },

    // ---------------------------------------------------------
    //  EXECUTE
    // ---------------------------------------------------------
    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(
            PermissionFlagsBits.Administrator
        );
        const isStaff = interaction.member.roles.cache.has(STAFF_ROLE_ID);

        if (!isAdmin && !isStaff) {
            return interaction.reply({
                content: `${EMOJIS.CROSS} Permission Denied.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const dbChoice = interaction.options.getString("database");

        // ------------------------------------------------------------------
        // CASE: BULK ADD (Supports Multi-Select Flow)
        // ------------------------------------------------------------------
        if (subcommand === "wordle-bulk-add") {
            const categoryInput = interaction.options.getString("category");
            let selectedCategories = [];

            // FLOW A: User chose "Select Multiple..."
            if (categoryInput === MULTI_SELECT_OPTION) {
                const row = await createCategoryMenu(getTable(dbChoice));
                if (!row)
                    return interaction.reply({
                        content:
                            `${EMOJIS.CROSS} No categories found to select from. Please type a new one manually first.`,
                        flags: MessageFlags.Ephemeral,
                    });

                const response = await interaction.reply({
                    content:
                        `${EMOJIS.CATEGORY_ADD} **Select the categories** for this batch of words:`,
                    components: [row],
                    flags: MessageFlags.Ephemeral,
                });

                try {
                    // Wait for user to pick from dropdown
                    const selection = await response.awaitMessageComponent({
                        componentType: ComponentType.StringSelect,
                        time: 60_000,
                        filter: (i) => i.user.id === interaction.user.id,
                    });

                    selectedCategories = selection.values; // Array of categories

                    // NOW show the Modal (responding to the selection interaction)
                    const modal = new ModalBuilder()
                        .setCustomId(`bulk_add_${dbChoice}`)
                        .setTitle(
                            `Bulk Add (${selectedCategories.length} cats)`
                        );

                    const input = new TextInputBuilder()
                        .setCustomId("words_input")
                        .setLabel(
                            `Paste words (Cats: ${selectedCategories.join(
                                ", "
                            )})`
                        )
                        .setPlaceholder("Tyrannosaurus\nTriceratops\n...")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(input)
                    );

                    await selection.showModal(modal);

                    // Wait for Modal Submit
                    const submission = await selection
                        .awaitModalSubmit({
                            time: 900_000,
                            filter: (i) => i.user.id === interaction.user.id,
                        })
                        .catch(() => null);

                    if (!submission) return; // Timed out

                    // Process Data
                    await handleBulkAdd(
                        submission,
                        dbChoice,
                        selectedCategories,
                        interaction.user
                    );
                } catch (e) {
                    // Timeout or error
                    return interaction.editReply({
                        content:
                            `${EMOJIS.CROSS} Timed out or cancelled.`,
                        components: [],
                    });
                }
            }

            // FLOW B: User typed/chose a single category (Standard Flow)
            else {
                selectedCategories = [categoryInput.toLowerCase()];

                // Show Modal immediately
                const modal = new ModalBuilder()
                    .setCustomId(`bulk_add_${dbChoice}`)
                    .setTitle(`Bulk Add (${dbChoice})`);

                const input = new TextInputBuilder()
                    .setCustomId("words_input")
                    .setLabel(`Paste words for: ${categoryInput}`)
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(input)
                );

                await interaction.showModal(modal);

                const submission = await interaction
                    .awaitModalSubmit({
                        time: 300_000,
                        filter: (i) => i.user.id === interaction.user.id,
                    })
                    .catch(() => null);

                if (!submission) return;

                await handleBulkAdd(
                    submission,
                    dbChoice,
                    selectedCategories,
                    interaction.user
                );
            }
            return; // Exit function as handleBulkAdd did the reply
        }

        // ------------------------------------------------------------------
        // CASE: BULK REMOVE
        // ------------------------------------------------------------------
        if (subcommand === "wordle-bulk-remove") {
            const modal = new ModalBuilder()
                .setCustomId(`bulk_remove_${dbChoice}`)
                .setTitle(`Bulk Remove (${dbChoice})`);

            const input = new TextInputBuilder()
                .setCustomId("words_input")
                .setLabel(`Paste words to remove`)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );

            await interaction.showModal(modal);

            const submission = await interaction
                .awaitModalSubmit({
                    time: 300_000,
                    filter: (i) => i.user.id === interaction.user.id,
                })
                .catch(() => null);

            if (!submission) return;

            await handleBulkRemove(
                submission,
                dbChoice,
                interaction.user
            );
            return;
        }

        // --- ALL OTHER COMMANDS USE DEFER ---
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // --- QUOTES LOGIC ---
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
                    `- "reply": ${oldRecord.reply ? `"${oldRecord.reply}"` : "null"
                    }`,
                    `+ "reply": ${newReplyContent ? `"${newReplyContent}"` : "null"
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

        // --- WORDLE LOGIC ---
        if (subcommand.startsWith("wordle-")) {
            const tableName = getTable(dbChoice);

            // CATEGORY MANAGEMENT
            if (subcommand === "category-add") {
                const name = interaction.options.getString("name").trim().toLowerCase();

                try {
                    await db.query(
                        `INSERT INTO ${CATEGORY_TABLE} (name, type) VALUES ($1, $2)`,
                        [name, dbChoice]
                    );
                    return interaction.editReply(
                        `${EMOJIS.CHECKMARK} Category **${name}** added to ${dbChoice}.`
                    );
                } catch (err) {
                    if (err.code === "23505")
                        return interaction.editReply(
                            `${EMOJIS.CROSS} Category **${name}** already exists in ${dbChoice}.`
                        );
                    console.error(err);
                    return interaction.editReply(`${EMOJIS.CROSS} Database error.`);
                }
            }

            if (subcommand === "category-remove") {
                const name = interaction.options.getString("name").toLowerCase();
                const tableName = getTable(dbChoice);

                // Remove from Category Table
                const res = await db.query(
                    `DELETE FROM ${CATEGORY_TABLE} WHERE name = $1 AND type = $2 RETURNING *`,
                    [name, dbChoice]
                );

                if (res.rowCount === 0)
                    return interaction.editReply(`${EMOJIS.CROSS} Category not found.`);

                // Update Wordle Tables (Remove string from array)
                await db.query(
                    `UPDATE ${tableName}
                      SET category = array_remove(category, $1)
                      WHERE $1 = ANY(category)`,
                    [name]
                );

                return interaction.editReply(
                    `${EMOJIS.CHECKMARK} Category **${name}** removed from system and all words.`
                );
            }

            if (subcommand === "category-edit") {
                const oldName = interaction.options.getString("name").toLowerCase();
                const newName = interaction.options.getString("new_name").trim().toLowerCase();
                const tableName = getTable(dbChoice);

                try {
                    // Update Category Table
                    const res = await db.query(
                        `UPDATE ${CATEGORY_TABLE} SET name = $1 WHERE name = $2 AND type = $3 RETURNING *`,
                        [newName, oldName, dbChoice]
                    );
                    if (res.rowCount === 0)
                        return interaction.editReply(`${EMOJIS.CROSS} Old category not found.`);

                    // Update Wordle Tables (Replace in array)
                    await db.query(
                        `UPDATE ${tableName}
                         SET category = array_replace(category, $1, $2)
                         WHERE $1 = ANY(category)`,
                        [oldName, newName]
                    );

                    return interaction.editReply(
                        `${EMOJIS.CHECKMARK} Renamed **${oldName}** to **${newName}** in ${dbChoice} and all references.`
                    );

                } catch (err) {
                    if (err.code === "23505")
                        return interaction.editReply(
                            `${EMOJIS.CROSS} Category **${newName}** already exists.`
                        );
                    throw err;
                }
            }

            // EXPORT
            if (subcommand === "wordle-export") {
                const res = await db.query(
                    `SELECT word, category FROM ${tableName} ORDER BY word ASC`
                );
                const file = new AttachmentBuilder(
                    Buffer.from(JSON.stringify(res.rows, null, 2)),
                    { name: `${dbChoice}_export.json` }
                );
                return interaction.editReply({
                    content: `${EMOJIS.CATEGORY} **${dbChoice.toUpperCase()}** Export:`,
                    files: [file],
                });
            }

            // IMPORT
            if (subcommand === "wordle-import") {
                const fileObj = interaction.options.getAttachment("file");
                if (!fileObj.contentType.includes("json"))
                    return interaction.editReply(
                        `${EMOJIS.CROSS} File must be a JSON file.`
                    );
                try {
                    const data = await fetchJson(fileObj.url);
                    if (!Array.isArray(data))
                        return interaction.editReply(
                            `${EMOJIS.CROSS} JSON must be an array of objects.`
                        );

                    let importLogData = [];
                    let successCount = 0;

                    for (const entry of data) {
                        if (!entry.word || !entry.category) continue;
                        const cleanWord = entry.word
                            .toLowerCase()
                            .replace(/[^a-z]/g, "");

                        let catArray = Array.isArray(entry.category)
                            ? entry.category.map(c => c.trim().toLowerCase())
                            : entry.category.split(",").map((c) => c.trim().toLowerCase());

                        // Fetch old to diff
                        let oldCats = [];
                        const oldRes = await db.query(`SELECT category FROM ${tableName} WHERE word = $1`, [cleanWord]);
                        const isNew = oldRes.rows.length === 0;
                        if (!isNew) oldCats = oldRes.rows[0].category;

                        await db.query(
                            `INSERT INTO ${tableName} (word, category, added_by)
                             VALUES ($1, $2, $3)
                             ON CONFLICT (word) DO UPDATE SET category = $2`,
                            [cleanWord, catArray, interaction.user.id]
                        );

                        successCount++;
                        importLogData.push({
                            word: cleanWord,
                            oldCats: oldCats,
                            newCats: catArray,
                            isNew: isNew
                        });
                    }

                    // GENERATE JSON LOG (Reverted from Diff)
                    // The user requested "revert diff code block to json code block".
                    // I will output the final state of imported items as a clean JSON list.

                    const finalItems = importLogData.map(item => ({
                        word: item.word,
                        category: item.newCats
                    }));

                    const jsonStr = JSON.stringify(finalItems, null, 4);
                    const header = `Wordle entries imported for (${dbChoice}) by ${interaction.user.username} (${interaction.user.id})`;

                    if (jsonStr.length < 1900) {
                        await sendLog(
                            interaction,
                            header,
                            `\`\`\`json\n${jsonStr}\n\`\`\``
                        );
                    } else {
                        const file = new AttachmentBuilder(
                            Buffer.from(jsonStr),
                            { name: `import-entries-${dbChoice}-${new Date().toISOString()}.json` }
                        );
                        const channel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                        if (channel) await channel.send({ content: `${header}\nattachment: import-entries-${dbChoice}-${new Date().toISOString()}.json`, files: [file] });
                    }

                    return interaction.editReply(
                        `${EMOJIS.CHECKMARK} Import Complete. Processed: ${successCount}`
                    );
                } catch (err) {
                    console.error(err);
                    return interaction.editReply(
                        `${EMOJIS.CROSS} Import Failed.`
                    );
                }
            }

            // ADD SINGLE (With Multi-Select Support)
            if (subcommand === "wordle-add") {
                const word = interaction.options
                    .getString("word")
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");
                const catInput = interaction.options.getString("category");
                const hint = interaction.options.getString("hint") || null; // Ignored for DB, but keeping variable if needed

                let catArray = [];

                if (catInput === MULTI_SELECT_OPTION) {
                    // Interactive Multi-Select
                    const row = await createCategoryMenu(tableName);
                    if (!row)
                        return interaction.editReply(
                            `${EMOJIS.CROSS} No categories found. Type a manual one first.`
                        );

                    const msg = await interaction.editReply({
                        content: "👇 **Select categories** for this word:",
                        components: [row],
                    });

                    try {
                        const selection = await msg.awaitMessageComponent({
                            componentType: ComponentType.StringSelect,
                            time: 60_000,
                            filter: (i) => i.user.id === interaction.user.id,
                        });

                        catArray = selection.values;
                        await selection.deferUpdate(); // Acknowledge the click
                    } catch (e) {
                        return interaction.editReply({
                            content: `${EMOJIS.CROSS} Timed out.`,
                            components: [],
                        });
                    }
                } else {
                    // Manual Split
                    catArray = catInput
                        .split(",")
                        .map((c) => c.trim().toLowerCase())
                        .filter((c) => c.length > 0);
                }

                try {
                    const res = await db.query(
                        `INSERT INTO ${tableName} (word, category, added_by) VALUES ($1, $2, $3) RETURNING *`,
                        [word, catArray, interaction.user.id]
                    );

                    const logObj = {
                        word: res.rows[0].word,
                        category: res.rows[0].category
                    };

                    await sendLog(
                        interaction,
                        `Wordle entry added for (${dbChoice})`,
                        `\`\`\`json\n${JSON.stringify(logObj, null, 4)}\n\`\`\``
                    );

                    return interaction.editReply({
                        content: `${EMOJIS.CHECKMARK} Added **${word}** to ${dbChoice}.\n📂 Categories: \`${catArray.join(
                            ", "
                        )}\``,
                        components: [],
                    });
                } catch (err) {
                    if (err.code === "23505")
                        return interaction.editReply(
                            `${EMOJIS.HAZARD} **${word}** already exists in ${dbChoice}.`
                        );
                    throw err;
                }
            }

            // REMOVE
            if (subcommand === "wordle-remove") {
                const target = interaction.options
                    .getString("target_word")
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");
                const res = await db.query(
                    `DELETE FROM ${tableName} WHERE word = $1 RETURNING *`,
                    [target]
                );
                if (res.rowCount === 0)
                    return interaction.editReply(
                        `${EMOJIS.CROSS} Word **${target}** not found.`
                    );

                const logObj = {
                    word: res.rows[0].word,
                    category: res.rows[0].category
                };

                await sendLog(
                    interaction,
                    `Wordle entry removed for (${dbChoice})`,
                    `\`\`\`json\n${JSON.stringify(logObj, null, 4)}\n\`\`\``
                );
                return interaction.editReply(
                    `${EMOJIS.CHECKMARK} Removed **${target}**.`
                );
            }

            // EDIT
            if (subcommand === "wordle-edit") {
                const target = interaction.options
                    .getString("target_word")
                    .toLowerCase()
                    .replace(/[^a-z]/g, "");
                const rawNewWord = interaction.options.getString("new_word");
                const catInput = interaction.options.getString("category");
                const newHint = interaction.options.getString("hint"); // Ignored for DB

                const search = await db.query(
                    `SELECT * FROM ${tableName} WHERE word = $1`,
                    [target]
                );
                if (search.rows.length === 0)
                    return interaction.editReply(
                        `${EMOJIS.CROSS} Word **${target}** not found.`
                    );
                const oldRecord = search.rows[0];
                const finalWord = rawNewWord
                    ? rawNewWord.toLowerCase().replace(/[^a-z]/g, "")
                    : oldRecord.word;

                let finalCategories = oldRecord.category;

                // Handle Categories
                if (catInput) {
                    if (catInput === MULTI_SELECT_OPTION) {
                        const row = await createCategoryMenu(tableName);
                        if (row) {
                            const msg = await interaction.editReply({
                                content:
                                    `${EMOJIS.CATEGORY_ADD} **Select new categories** (Overwrites old):`,
                                components: [row],
                            });
                            try {
                                const selection =
                                    await msg.awaitMessageComponent({
                                        componentType:
                                            ComponentType.StringSelect,
                                        time: 60_000,
                                        filter: (i) =>
                                            i.user.id === interaction.user.id,
                                    });
                                finalCategories = selection.values;
                                await selection.deferUpdate();
                            } catch (e) { }
                        }
                    } else {
                        const trimmed = catInput.trim();
                        if (trimmed.startsWith("+")) {
                            const toAdd = trimmed.substring(1).trim().toLowerCase();
                            if (!finalCategories.includes(toAdd))
                                finalCategories.push(toAdd);
                        } else if (trimmed.startsWith("-")) {
                            const toRemove = trimmed.substring(1).trim().toLowerCase();
                            finalCategories = finalCategories.filter(
                                (c) =>
                                    c.toLowerCase() !== toRemove.toLowerCase()
                            );
                        } else {
                            finalCategories = trimmed
                                .split(",")
                                .map((c) => c.trim().toLowerCase())
                                .filter((c) => c.length > 0);
                        }
                    }
                }

                try {
                    await db.query(
                        `UPDATE ${tableName} SET word = $1, category = $2 WHERE word = $3`,
                        [finalWord, finalCategories, oldRecord.word]
                    );

                    let diffBody = "";
                    if (finalWord !== oldRecord.word)
                        diffBody += `-   "word": "${oldRecord.word}",\n+   "word": "${finalWord}",\n`;
                    else diffBody += `    "word": "${oldRecord.word}",\n`;

                    const oldCatStr = JSON.stringify(oldRecord.category, null, 4);
                    const newCatStr = JSON.stringify(finalCategories, null, 4);

                    if (JSON.stringify(oldRecord.category) !== JSON.stringify(finalCategories)) {
                        diffBody += `-   "category": ${oldCatStr.replace(/\n/g, "\n-   ")},\n`;
                        diffBody += `+   "category": ${newCatStr.replace(/\n/g, "\n+   ")},\n`;
                    } else {
                        diffBody += `    "category": ${oldCatStr.replace(/\n/g, "\n    ")},\n`;
                    }

                    const diff = `{\n${diffBody}\n}`;
                    await sendLog(
                        interaction,
                        `Wordle entry edited for (${dbChoice})`,
                        `\`\`\`diff\n${diff}\n\`\`\``
                    );
                    return interaction.editReply({
                        content: `${EMOJIS.CHECKMARK} Updated **${oldRecord.word
                            }** in ${dbChoice}.\n${EMOJIS.CATEGORY} Categories: \`${finalCategories.join(
                                ", "
                            )}\``,
                        components: [],
                    });
                } catch (err) {
                    if (err.code === "23505")
                        return interaction.editReply(
                            `${EMOJIS.HAZARD} **${finalWord}** already exists.`
                        );
                    throw err;
                }
            }
        }
    },
};

// ---------------------------------------------------------
//  HELPER: PROCESS BULK SUBMISSION
// ---------------------------------------------------------
async function handleBulkAdd(submission, dbChoice, selectedCategories, user) {
    await submission.deferReply({ flags: MessageFlags.Ephemeral });
    const rawInput = submission.fields.getTextInputValue("words_input");

    const words = rawInput
        .split(/[,\n]+/)
        .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
        .filter((w) => w.length > 0);

    const tableName = getTable(dbChoice);

    let addedRecords = [];
    let errors = [];

    for (const word of words) {
        try {
            const res = await db.query(
                `
                INSERT INTO ${tableName} (word, category, added_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (word)
                DO UPDATE SET category = (
                    SELECT ARRAY(SELECT DISTINCT UNNEST(${tableName}.category || $2))
                )
                RETURNING *
            `,
                [word, selectedCategories, user.id]
            );
            addedRecords.push(res.rows[0]);
        } catch (err) {
            errors.push(`${word} (Error: ${err.message})`);
        }
    }

    if (addedRecords.length > 0) {
        const header = `Bulk Wordle entries added for (${dbChoice}) by ${user.username} (${user.id})`;

        let jsonLogItems = addedRecords.map(r => ({
            word: r.word,
            category: r.category
        }));

        const jsonStr = JSON.stringify(jsonLogItems, null, 4);
        const textLog = `${header}\n\`\`\`json\n${jsonStr}\n\`\`\``;

        const channel = await submission.client.channels
            .fetch(LOG_CHANNEL_ID)
            .catch(() => null);

        if (channel) {
            if (textLog.length < 1950) {
                await channel.send(textLog);
            } else {
                const file = new AttachmentBuilder(
                    Buffer.from(jsonStr),
                    { name: `bulk-entries-${dbChoice}-${new Date().toISOString()}.json` }
                );
                await channel.send({
                    content: `${header}\nattachment: bulk-entries-${dbChoice}-${new Date().toISOString()}.json`,
                    files: [file],
                });
            }
        }
    }

    return submission.editReply(
        `${EMOJIS.CHECKMARK} Processed **${addedRecords.length
        }** words.\nErrors: ${errors.join(", ") || "None"}`
    );
}

// ---------------------------------------------------------
//  HELPER: PROCESS BULK REMOVE
// ---------------------------------------------------------
async function handleBulkRemove(submission, dbChoice, user) {
    await submission.deferReply({ flags: MessageFlags.Ephemeral });
    const rawInput = submission.fields.getTextInputValue("words_input");

    const words = rawInput
        .split(/[,\n]+/)
        .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
        .filter((w) => w.length > 0);

    const tableName = getTable(dbChoice);
    let removedRecords = [];
    let errors = [];

    for (const word of words) {
        try {
            const res = await db.query(
                `DELETE FROM ${tableName} WHERE word = $1 RETURNING *`,
                [word]
            );
            if (res.rowCount > 0) {
                removedRecords.push(res.rows[0]);
            } else {
                errors.push(`${word} (Not found)`);
            }
        } catch (err) {
            errors.push(`${word} (Error: ${err.message})`);
        }
    }

    if (removedRecords.length > 0) {
        const header = `Bulk Wordle entries removed for (${dbChoice}) by ${user.username} (${user.id})`;

        let jsonLogItems = removedRecords.map(r => ({
            word: r.word,
            category: r.category
        }));

        const jsonStr = JSON.stringify(jsonLogItems, null, 4);
        const textLog = `${header}\n\`\`\`json\n${jsonStr}\n\`\`\``;

        const channel = await submission.client.channels
            .fetch(LOG_CHANNEL_ID)
            .catch(() => null);

        if (channel) {
            if (textLog.length < 1950) {
                await channel.send(textLog);
            } else {
                const file = new AttachmentBuilder(
                    Buffer.from(jsonStr),
                    { name: `bulk-remove-${dbChoice}-${new Date().toISOString()}.json` }
                );
                await channel.send({
                    content: `${header}\nattachment: bulk-remove-${dbChoice}-${new Date().toISOString()}.json`,
                    files: [file],
                });
            }
        }
    }

    return submission.editReply(
        `${EMOJIS.CHECKMARK} Removed **${removedRecords.length
        }** words.\nErrors: ${errors.length > 0 ? errors.slice(0, 10).join(", ") + (errors.length > 10 ? "..." : "") : "None"}`
    );
}
