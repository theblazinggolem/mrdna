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
const { GoogleGenerativeAI } = require("@google/generative-ai");

const STAFF_ROLE_ID = "867964544717295646";
const LOG_CHANNEL_ID = "1461971930880938129";
const QUOTES_TABLE = "quotes";
const PROPERTIES_TABLE = "wordle_properties"; // Formerly categories
const MULTI_SELECT_OPTION = "➕ Select Multiple...";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const EMOJIS = {
    CHECKMARK: "<:checkmark:1462055059197137069>",
    CROSS: "<:x_:1462055048526954611>",
    HAZARD: "<:hazard:1462056327378501738>",
    CATEGORY_ADD: "<:categoryadd:1459169340002668780>", // Reusing emoji
    CATEGORY: "<:category:1459169337641275497>",
    AI: "🤖",
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

// ---------------------------------------------------------
//  AI GENERATION
// ---------------------------------------------------------
const AI_PROMPTS = {
    PALEO: `Fields usually are arrays of strings:
           - type: e.g. ["theropod", "sauropod", "avian", "aquatic", etc]
           - family: e.g. ["Tyrannosaurid"]
           - region: e.g. ["North America"]
           - diet: e.g. ["carnivore"]
           - period: e.g. ["Cretaceous"]
           Return ONLY valid JSON. No markdown.`,

    JURASSIC: `Logic:
           - If Human: 
             {
               "category": ["human"],
               "appearances": ["Jurassic Park", "World", etc],
               "diet": null,
               "type": null
             }
           - If Dinosaur/Creature:
             {
               "category": ["creature"],
               "type": ["theropod", "sauropod", "hybrid", "pterosaur", etc],
               "diet": ["carnivore", "herbivore"],
               "appearances": ["Jurassic Park", "Camp Cretaceous", etc]
             }
           - If Location:
             {
               "category": ["location"],
               "type": ["attraction", "building", "paddock", etc],
               "appearances": ["Jurassic Park", "Camp Cretaceous", etc]
             }   
           - If Misc:
             {
               "category": ["misc"],
               "type": [" wtv fits best description"],
               "appearances": ["Jurassic Park", "Camp Cretaceous", etc]
             }   

           IMPORTANT: "appearances" must ONLY include Movies/tv shows (Jurassic Park 1-3, World, FK, Dominion, Rebirth, Camp Cretaceous, Chaos Theory, Battle at big rock) and Novels (Jurassic Park, The Lost World). DO NOT include games, toys, comics, or rides.
           
           CRITICAL: If you are not 100% certain about specific appearances (especially for obscure chars), return an empty array [] for "appearances". DO NOT  GUESS or HALLUCINATE.

           Return ONLY valid JSON. No markdown.`
};

async function generateProperties(word, database) {
    const isPaleo = database === "paleo";
    const prompt = isPaleo
        ? `Generate a JSON object for the Paleo entity "${word}". \n${AI_PROMPTS.PALEO}`
        : `Generate a JSON object for the Jurassic Park/World franchise entity "${word}".\n${AI_PROMPTS.JURASSIC}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log(`[AI RAW] ${word}:`, text); // Debug log

        // Robust JSON extraction
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error(`[AI Parser] No JSON found for ${word}`);
            return {};
        }

        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error(`[AI Error] ${word}:`, e);
        return {}; // Return empty on failure
    }
}

// Helper to update the global properties table
async function updateGlobalProperties(database, propertiesJson) {
    // propertiesJson: { type: ["val"], diet: ["val"] ... }
    for (const [key, values] of Object.entries(propertiesJson)) {
        if (!Array.isArray(values)) continue;
        for (const val of values) {
            try {
                await db.query(
                    `INSERT INTO ${PROPERTIES_TABLE} (property, database, type) 
                     VALUES ($1, $2, $3)
                     ON CONFLICT (property, database, type) DO NOTHING`,
                    [val, database, key]
                );
            } catch (e) {
                // Ignore duplicates
            }
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("manage")
        .setDescription("Manage Quotes and Wordle Databases")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        // --- QUOTES (Standard) ---
        .addSubcommand((sub) => sub.setName("quotes-add").setDescription("Add a quote").addStringOption(o => o.setName("link").setDescription("Message link").setRequired(true)).addBooleanOption(o => o.setName("reply").setDescription("Include reply?").setRequired(true)))
        .addSubcommand((sub) => sub.setName("quotes-edit").setDescription("Edit quote reply status").addStringOption(o => o.setName("link").setDescription("Message link").setRequired(true)).addBooleanOption(o => o.setName("show_reply").setDescription("Show reply context?").setRequired(true)))
        .addSubcommand((sub) => sub.setName("quotes-remove").setDescription("Remove a quote").addStringOption(o => o.setName("link").setDescription("Message link").setRequired(true)))
        .addSubcommand((sub) => sub.setName("quotes-export").setDescription("Export quotes JSON"))

        // --- WORDLE: BULK ADD ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-bulk-add")
                .setDescription("Paste a list of words. AI will fill details.")
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
        // --- WORDLE: ADD (Single) ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-add")
                .setDescription("Add a single word (AI Autofill)")
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
                .addBooleanOption((o) =>
                    o
                        .setName("edit_properties")
                        .setDescription("Open JSON editor modal?")
                        .setRequired(false)
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
            sub.setName("wordle-export").setDescription("Export database")
                .addStringOption(o => o.setName("database").setDescription("Target DB").setRequired(true).addChoices({ name: "Jurassic", value: "jurassic" }, { name: "Paleo", value: "paleo" }))
        )
        .addSubcommand((sub) =>
            sub.setName("wordle-import").setDescription("Import JSON file (Upsert)")
                .addStringOption(o => o.setName("database").setDescription("Target DB").setRequired(true).addChoices({ name: "Jurassic", value: "jurassic" }, { name: "Paleo", value: "paleo" }))
                .addAttachmentOption(o => o.setName("file").setDescription("The JSON file").setRequired(true))
        )

        // --- PROPERTY MANAGEMENT (Renamed from Category) ---
        .addSubcommand((sub) =>
            sub
                .setName("wordle-property-add")
                .setDescription("Add a known property value")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices({ name: "Jurassic", value: "jurassic" }, { name: "Paleo", value: "paleo" })
                )
                .addStringOption((o) =>
                    o.setName("property").setDescription("Value (e.g. 'Theropod')").setRequired(true)
                )
                .addStringOption((o) =>
                    o.setName("type").setDescription("Type (e.g. 'type', 'diet')").setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("wordle-property-remove")
                .setDescription("Remove a known property")
                .addStringOption((o) =>
                    o
                        .setName("database")
                        .setDescription("Target Database")
                        .setRequired(true)
                        .addChoices({ name: "Jurassic", value: "jurassic" }, { name: "Paleo", value: "paleo" })
                )
                .addStringOption((o) =>
                    o.setName("property").setDescription("Value").setRequired(true).setAutocomplete(true)
                )
        ),

    // ---------------------------------------------------------
    //  AUTOCOMPLETE
    // ---------------------------------------------------------
    async autocomplete(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const dbChoice = interaction.options.getString("database");

        if (!dbChoice) return interaction.respond([]);
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Autocomplete for properties (formerly categories)
        if (subcommand === "wordle-property-remove") {
            try {
                const res = await db.query(`
                    SELECT property FROM ${PROPERTIES_TABLE}
                    WHERE database = $1
                    ORDER BY property ASC
                `, [dbChoice]);

                const choices = res.rows
                    .map(r => r.property)
                    .filter(p => p.toLowerCase().includes(focusedValue))
                    .slice(0, 25);

                await interaction.respond(choices.map(c => ({ name: c, value: c })));
            } catch (err) {
                console.error(err);
                await interaction.respond([]);
            }
        }
    },

    // ---------------------------------------------------------
    //  EXECUTE
    // ---------------------------------------------------------
    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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
        // BULK ADD
        // ------------------------------------------------------------------
        if (subcommand === "wordle-bulk-add") {
            const modal = new ModalBuilder()
                .setCustomId(`bulk_add_${dbChoice}`)
                .setTitle(`Bulk Add (${dbChoice})`);
            const input = new TextInputBuilder()
                .setCustomId("words_input")
                .setLabel(`Paste words (AI will fill details)`)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));

            await interaction.showModal(modal);
            const submission = await interaction
                .awaitModalSubmit({ time: 300_000, filter: (i) => i.user.id === interaction.user.id })
                .catch(() => null);

            if (!submission) return;

            await handleBulkAdd(submission, dbChoice, interaction.user);
            return;
        }

        // ------------------------------------------------------------------
        // BULK REMOVE
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
            modal.addComponents(new ActionRowBuilder().addComponents(input));

            await interaction.showModal(modal);
            const submission = await interaction
                .awaitModalSubmit({ time: 300_000, filter: (i) => i.user.id === interaction.user.id })
                .catch(() => null);
            if (!submission) return;

            await handleBulkRemove(submission, dbChoice, interaction.user);
            return;
        }

        // ------------------------------------------------------------------
        // SINGLE ADD (With AI)
        // ------------------------------------------------------------------
        if (subcommand === "wordle-add") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const word = interaction.options.getString("word").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
            const tableName = getTable(dbChoice);

            // 1. Generate Properties via AI
            await interaction.editReply(`${EMOJIS.AI} Generating properties for **${word}**...`);
            const properties = await generateProperties(word, dbChoice);

            // 2. Insert
            try {
                const res = await db.query(
                    `INSERT INTO ${tableName} (word, properties, added_by) VALUES ($1, $2, $3) RETURNING *`,
                    [word, properties, interaction.user.id]
                );

                // 3. Update Global Properties List
                await updateGlobalProperties(dbChoice, properties);

                const logObj = { word, properties };
                await sendLog(interaction, `Wordle entry added (${dbChoice})`, `\`\`\`json\n${JSON.stringify(logObj, null, 4)}\n\`\`\``);

                return interaction.editReply({
                    content: `${EMOJIS.CHECKMARK} Added **${word}** to ${dbChoice}.\n${EMOJIS.AI} Properties:\n\`\`\`json\n${JSON.stringify(properties, null, 2)}\n\`\`\``
                });
            } catch (err) {
                if (err.code === "23505") return interaction.editReply(`${EMOJIS.HAZARD} **${word}** already exists.`);
                throw err;
            }
        }

        // ------------------------------------------------------------------
        // EDIT (Logic Updated for Modal)
        // ------------------------------------------------------------------
        if (subcommand === "wordle-edit") {
            const target = interaction.options.getString("target_word").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
            const rawNewWord = interaction.options.getString("new_word");
            const wantEditProps = interaction.options.getBoolean("edit_properties");
            const tableName = getTable(dbChoice);

            // Fetch current data
            const search = await db.query(`SELECT * FROM ${tableName} WHERE word = $1`, [target]);
            if (search.rows.length === 0) return interaction.reply({ content: `${EMOJIS.CROSS} Word **${target}** not found.`, flags: MessageFlags.Ephemeral });
            const oldRecord = search.rows[0];

            // If user wants to edit properties via Modal
            if (wantEditProps) {
                const modal = new ModalBuilder()
                    .setCustomId(`edit_props_${target}`)
                    .setTitle(`Edit Properties: ${target}`);

                const jsonInput = new TextInputBuilder()
                    .setCustomId("json_data")
                    .setLabel("JSON Properties")
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(JSON.stringify(oldRecord.properties, null, 2))
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));

                await interaction.showModal(modal);

                const submission = await interaction
                    .awaitModalSubmit({ time: 300_000, filter: (i) => i.user.id === interaction.user.id })
                    .catch(() => null);

                if (!submission) return;

                // Process Edit Submission
                const rawJson = submission.fields.getTextInputValue("json_data");
                let newProps;
                try {
                    newProps = JSON.parse(rawJson);
                } catch (e) {
                    return submission.reply({ content: `${EMOJIS.CROSS} Invalid JSON format. Update cancelled.`, flags: MessageFlags.Ephemeral });
                }

                const finalWord = rawNewWord ? rawNewWord.toLowerCase().replace(/[^a-z0-9\s-]/g, "") : oldRecord.word;

                await db.query(`UPDATE ${tableName} SET word = $1, properties = $2 WHERE word = $3`, [finalWord, newProps, oldRecord.word]);
                await updateGlobalProperties(dbChoice, newProps);

                return submission.reply({ content: `${EMOJIS.CHECKMARK} Updated **${finalWord}** properties.`, flags: MessageFlags.Ephemeral });
            }

            // Standard Edit (Just Word name)
            if (rawNewWord) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const finalWord = rawNewWord.toLowerCase().replace(/[^a-z0-9\s-]/g, "");
                await db.query(`UPDATE ${tableName} SET word = $1 WHERE word = $2`, [finalWord, oldRecord.word]);
                return interaction.editReply(`${EMOJIS.CHECKMARK} Renamed **${oldRecord.word}** to **${finalWord}**.`);
            }

            return interaction.reply({ content: "ℹ️ Please specify a new word OR set `edit_properties` to True.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        // REMOVE
        // ------------------------------------------------------------------
        if (subcommand === "wordle-remove") {
            const target = interaction.options.getString("target_word").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
            await db.query(`DELETE FROM ${getTable(dbChoice)} WHERE word = $1`, [target]);
            await sendLog(interaction, `Removed ${target}`, `Deleted by ${interaction.user.username}`);
            return interaction.editReply(`${EMOJIS.CHECKMARK} Removed **${target}**.`);
        }

        // ------------------------------------------------------------------
        // PROPERTY MANAGEMENT
        // ------------------------------------------------------------------
        if (subcommand === "wordle-property-add") {
            const prop = interaction.options.getString("property");
            const type = interaction.options.getString("type");
            try {
                await db.query(`INSERT INTO ${PROPERTIES_TABLE} (property, database, type) VALUES ($1, $2, $3)`, [prop, dbChoice, type]);
                return interaction.editReply(`${EMOJIS.CHECKMARK} Added property **${prop}** (${type}).`);
            } catch (err) {
                return interaction.editReply(`${EMOJIS.CROSS} Error (likely duplicate).`);
            }
        }

        if (subcommand === "wordle-property-remove") {
            const prop = interaction.options.getString("property");
            await db.query(`DELETE FROM ${PROPERTIES_TABLE} WHERE property = $1 AND database = $2`, [prop, dbChoice]);
            return interaction.editReply(`${EMOJIS.CHECKMARK} Removed property **${prop}**.`);
        }

        // ------------------------------------------------------------------
        // EXPORT / IMPORT
        // ------------------------------------------------------------------
        if (subcommand === "wordle-export") {
            const res = await db.query(`SELECT word, properties FROM ${getTable(dbChoice)} ORDER BY word ASC`);
            const file = new AttachmentBuilder(Buffer.from(JSON.stringify(res.rows, null, 2)), { name: `${dbChoice}_export.json` });
            return interaction.editReply({ content: `**${dbChoice}** Export:`, files: [file] });
        }

        if (subcommand === "wordle-import") {
            const fileObj = interaction.options.getAttachment("file");
            if (!fileObj.contentType.includes("json")) return interaction.editReply("Not a JSON file.");
            try {
                const data = await fetchJson(fileObj.url);
                if (!Array.isArray(data)) return interaction.editReply("JSON must be array.");

                let count = 0;
                for (const item of data) {
                    if (!item.word) continue;
                    const cleanWord = item.word.toLowerCase().replace(/[^a-z0-9\s-]/g, "");
                    const props = item.properties || {};
                    await db.query(`
                        INSERT INTO ${getTable(dbChoice)} (word, properties, added_by) 
                        VALUES ($1, $2, $3)
                        ON CONFLICT (word) DO UPDATE SET properties = $2
                    `, [cleanWord, props, interaction.user.id]);
                    await updateGlobalProperties(dbChoice, props);
                    count++;
                }
                return interaction.editReply(`${EMOJIS.CHECKMARK} Imported ${count} items.`);
            } catch (e) {
                return interaction.editReply("Import failed.");
            }
        }

        // --- QUOTES LOGIC (Restored) ---
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
    }
};

// ---------------------------------------------------------
//  HELPER: BULK ADD
// ---------------------------------------------------------
// Helper: Batch AI Generation
async function generatePropertiesBatch(wordsList, database) {
    if (wordsList.length === 0) return {};

    // Safety: ensure we don't send too many tokens. 
    // But words list logic is handled by the caller (chunking).

    const isPaleo = database === "paleo";
    const prompt = isPaleo
        ? `Generate a JSON object where keys are the input words and values are their property objects for these Paleo entities: ${JSON.stringify(wordsList)}.
           ${AI_PROMPTS.PALEO}
           Example:
           {
             "trex": { "type": ["theropod"], ... },
             "triceratops": { ... }
           }`
        : `Generate a JSON object where keys are the input words and values are their property objects for these Jurassic franchise entities: ${JSON.stringify(wordsList)}.
           ${AI_PROMPTS.JURASSIC}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log(`[AI BATCH] Processing ${wordsList.length} items...`);

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error(`[AI Parser] No JSON found for batch`);
            return {};
        }

        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error(`[AI Batch Error]:`, e);
        return {};
    }
}

// ---------------------------------------------------------
//  HELPER: BULK ADD
// ---------------------------------------------------------
async function handleBulkAdd(submission, dbChoice, user) {
    await submission.deferReply({ flags: MessageFlags.Ephemeral });
    const rawInput = submission.fields.getTextInputValue("words_input");
    const allWords = rawInput.split(/[,\n]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
    const tableName = getTable(dbChoice);

    let added = [];
    let errors = [];

    // Chunk size 50 is reasonable for robust models like 1.5/2.0
    const CHUNK_SIZE = 50;
    const chunks = [];
    for (let i = 0; i < allWords.length; i += CHUNK_SIZE) {
        chunks.push(allWords.slice(i, i + CHUNK_SIZE));
    }

    await submission.editReply(`${EMOJIS.AI} Processing ${allWords.length} words in ${chunks.length} batches...`);

    for (const [index, chunk] of chunks.entries()) {
        // 1. Generate Batch Properties (One AI call per batch)
        let batchResults = {};
        try {
            batchResults = await generatePropertiesBatch(chunk, dbChoice);
        } catch (aiErr) {
            console.error(`[Batch ${index + 1} AI Fail]`, aiErr);
            // We continue processing, but props will be empty for this batch
        }

        // 2. Process each word in the chunk INDIVIDUALLY
        for (const word of chunk) {
            try {
                // If AI failed to return a key for this word, default to empty
                const props = batchResults[word] || batchResults[word.replace(/\s/g, "")] || {};

                // 3. Insert into DB (with Retry)
                let retries = 3;
                while (retries > 0) {
                    try {
                        const res = await db.query(
                            `INSERT INTO ${tableName} (word, properties, added_by) VALUES ($1, $2, $3)
                             ON CONFLICT (word) DO UPDATE SET properties = $2 RETURNING *`,
                            [word, props, user.id]
                        );

                        if (res.rowCount > 0) {
                            added.push(res.rows[0]);
                            await updateGlobalProperties(dbChoice, props);
                        }
                        break; // Success
                    } catch (dbErr) {
                        retries--;
                        if (retries === 0) throw dbErr;
                        console.log(`[DB Retry] Connection failed for ${word}, retrying...`);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            } catch (wordErr) {
                console.error(`[Bulk Add Error] Word: ${word}`, wordErr);
                errors.push(`${word} (${wordErr.message})`);
            }
        }

        // Progress update per batch
        await submission.editReply(`${EMOJIS.AI} Processed batch ${index + 1}/${chunks.length}... (Added so far: ${added.length})`);

        // Small safety delay between batches
        await new Promise(r => setTimeout(r, 2000));
    }

    if (added.length > 0) {
        // Send Log
        const jsonStr = JSON.stringify(added.map(a => ({ word: a.word, properties: a.properties })), null, 2);
        if (jsonStr.length < 1900) {
            await sendLog(submission, `Bulk Add (${dbChoice})`, `\`\`\`json\n${jsonStr}\n\`\`\``);
        } else {
            const file = new AttachmentBuilder(Buffer.from(jsonStr), { name: `bulk.json` });
            const c = await submission.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
            if (c) c.send({ content: `Bulk Add Log`, files: [file] });
        }
    }

    return submission.editReply(`${EMOJIS.CHECKMARK} Done. Added/Updated: ${added.length}. Errors (Batches): ${errors.length}\n\n${EMOJIS.HAZARD} **Disclaimer:** Properties are AI-generated & may not be 100% accurate especially for recent movies/shows (Rebirth and Chaos Theory). Please review important entries manually from the json in <#1461971930880938129>.`);
}

async function handleBulkRemove(submission, dbChoice, user) {
    await submission.deferReply({ flags: MessageFlags.Ephemeral });
    const words = submission.fields.getTextInputValue("words_input").split(/[,\n]+/).map(w => w.trim().toLowerCase());
    const tableName = getTable(dbChoice);
    let count = 0;

    for (const word of words) {
        const res = await db.query(`DELETE FROM ${tableName} WHERE word = $1`, [word]);
        count += res.rowCount;
    }

    return submission.editReply(`${EMOJIS.CHECKMARK} Removed ${count} words.`);
}
