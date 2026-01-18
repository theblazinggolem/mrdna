const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const db = require("../../db");

// --- ANTI-SPAM / RAGE QUIT SYSTEM ---
const playerStats = new Map();
const RAGE_LIMIT = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

// Track active games
// Track active games
const activeGames = new Set();

const EMOJIS = {
    HAZARD: "<:hazard:1462056327378501738>",
    SLOWMODE: "<:slowmode:1459169352195506321>",
    CROSS: "<:x_:1462055048526954611>",
    UNKNOWN: "<:unknown:1462055031187705918>",
    CHECKMARK: "<:checkmark:1462055059197137069>",
    CLOCK: "<:clock:1459169364182958244>",
};

async function safeReply(originalMessage, content) {
    try {
        return await originalMessage.reply(content);
    } catch (err) {
        if (err.code === 10008 || err.code === 50035) {
            return await originalMessage.channel.send(content).catch(() => { });
        }
        console.error("SafeReply Error:", err);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("wordle")
        .setDescription("Play Wordle")
        .addSubcommand((sub) =>
            sub
                .setName("jurassic")
                .setDescription("Play Jurassic Wordle")
                .addStringOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Filter by category")
                        .setAutocomplete(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("paleo")
                .setDescription("Play Paleo Wordle")
                .addStringOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Filter by category")
                        .setAutocomplete(true)
                )
        ),

    // ---------------------------------------------------------
    //  AUTOCOMPLETE HANDLER
    // ---------------------------------------------------------
    async autocomplete(interaction) {
        const mode = interaction.options.getSubcommand();
        const tableName = mode === "paleo" ? "wordle_paleo" : "wordle_jurassic";
        const focusedValue = interaction.options.getFocused().toLowerCase();

        try {
            const res = await db.query(
                `SELECT DISTINCT unnest(category) as cat FROM ${tableName} ORDER BY cat ASC`
            );
            const choices = res.rows
                .map((row) => row.cat)
                .filter((cat) => cat.toLowerCase().includes(focusedValue))
                .slice(0, 25);

            await interaction.respond(
                choices.map((choice) => ({ name: choice, value: choice }))
            );
        } catch (err) {
            console.error("Autocomplete Error:", err);
            await interaction.respond([]);
        }
    },

    // ---------------------------------------------------------
    //  EXECUTE HANDLER (The Game)
    // ---------------------------------------------------------
    async execute(interaction) {
        const userId = interaction.user.id;

        // 1. DETERMINE MODE & CATEGORY
        const mode = interaction.options.getSubcommand();
        const categoryFilter = interaction.options.getString("category");
        const tableName = mode === "paleo" ? "wordle_paleo" : "wordle_jurassic";

        // 2. FAST CHECKS
        if (activeGames.has(userId)) {
            return interaction.reply({
                content:
                    `${EMOJIS.HAZARD} You already have a game in progress!`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const stats = playerStats.get(userId) || {
            quitStreak: 0,
            cooldownUntil: 0,
        };
        if (Date.now() < stats.cooldownUntil) {
            return interaction.reply({
                content: `${EMOJIS.SLOWMODE} **Cooldown Active!** You quit too many games. Try again <t:${Math.floor(
                    stats.cooldownUntil / 1000
                )}:R>.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        // 3. DEFER & SETUP
        await interaction.deferReply();

        activeGames.add(userId);

        await interaction.client.application.emojis
            .fetch()
            .catch(console.error);
        const appEmojis = interaction.client.application.emojis.cache;

        let validWords = new Set();
        let secretData;

        try {
            const allWordsRes = await db.query(
                `SELECT word, category FROM ${tableName}`
            );

            if (allWordsRes.rows.length === 0) {
                activeGames.delete(userId);
                return interaction.editReply(
                    `${EMOJIS.CROSS} The **${mode}** database is empty!`
                );
            }

            let secretPool = [];

            allWordsRes.rows.forEach((row) => {
                validWords.add(row.word.toUpperCase());
                if (!categoryFilter) {
                    secretPool.push(row);
                } else {
                    const cats = row.category.map((c) => c.toLowerCase());
                    if (cats.includes(categoryFilter.toLowerCase())) {
                        secretPool.push(row);
                    }
                }
            });

            if (secretPool.length === 0) {
                activeGames.delete(userId);
                return interaction.editReply(
                    `${EMOJIS.CROSS} No words found in the **${categoryFilter}** category for ${mode}!`
                );
            }

            const randomEntry =
                secretPool[Math.floor(Math.random() * secretPool.length)];
            secretData = {
                word: randomEntry.word.toUpperCase(),
                categories: randomEntry.category,
            };
        } catch (err) {
            console.error(err);
            activeGames.delete(userId);
            return interaction.editReply(
                `${EMOJIS.CROSS} Database error.`
            );
        }

        const secretWord = secretData.word;
        const wordLength = secretWord.length;
        let maxChances = 6;
        if (wordLength >= 12) maxChances = 8;
        else if (wordLength >= 8) maxChances = 7;

        let guesses = [];
        let hintsUsed = 0;
        let usedHints = new Set();
        let turnHintUsed = false; // Tracks if a hint was used THIS turn

        let isGameOver = false;

        const gameDuration = 600_000;
        const gameEndTime = Math.floor((Date.now() + gameDuration) / 1000);
        const timeString = `<t:${gameEndTime}:R>`;

        const emptyRow = "⬜".repeat(wordLength);

        // Initial embed has no footer hint text because hints only unlock in last 3 guesses
        await interaction.editReply({
            content: `**Mode: ${mode.toUpperCase()}**\n${emptyRow}\n-# Length: ${wordLength} | Chances: ${maxChances} | Ends ${timeString}, type 'extend' to increase time, type 'end game' to end`,
        });

        const collector = interaction.channel.createMessageCollector({
            filter: (m) => m.author.id === userId,
            time: gameDuration,
        });

        collector.on("collect", async (message) => {
            if (isGameOver) return;
            const content = message.content.trim().toUpperCase();

            // --- EXTEND COMMAND ---
            if (content === "EXTEND") {
                collector.resetTimer(); // Resets to original 10 mins (600,000ms) from NOW
                const newEndTime = Math.floor((Date.now() + 600_000) / 1000);
                await safeReply(
                    message,
                    `${EMOJIS.SLOWMODE} **Timer Extended!** Game ends <t:${newEndTime}:R>.`
                );
                return;
            }

            // --- HINT COMMAND ---
            if (content === "HINT") {
                const remaining = maxChances - guesses.length;

                // 1. Check if hints are unlocked (Last 3 guesses)
                if (remaining > 3) {
                    const warning = await safeReply(
                        message,
                        `${EMOJIS.HAZARD} Hints are only available in the **last 3 guesses**!`
                    );
                    setTimeout(() => warning.delete().catch(() => { }), 4000);
                    return;
                }

                // 2. Check if already used a hint this turn
                if (turnHintUsed) {
                    const warning = await safeReply(
                        message,
                        `${EMOJIS.HAZARD} You can only use **one hint per turn**!`
                    );
                    setTimeout(() => warning.delete().catch(() => { }), 3000);
                    return;
                }

                // 3. Generate Hint from Categories
                let availableHints = secretData.categories;
                if (!availableHints || availableHints.length === 0) {
                    await safeReply(message, `${EMOJIS.UNKNOWN} No category information available.`);
                    return;
                }

                // Filter out already used hints (if possible)
                let freshHints = availableHints.filter(h => !usedHints.has(h));

                // Fallback: If ran out of unique hints, just use available ones
                let pool = freshHints.length > 0 ? freshHints : availableHints;

                // Pick random
                const hintText = pool[Math.floor(Math.random() * pool.length)];

                usedHints.add(hintText);
                turnHintUsed = true; // Mark as utilized for this turn

                await safeReply(message, `**HINT:** ${hintText}`);
                return;
            }

            // --- END GAME COMMAND ---
            if (content === "END GAME") {
                isGameOver = true;
                stats.quitStreak += 1;
                if (stats.quitStreak >= RAGE_LIMIT) {
                    stats.cooldownUntil = Date.now() + COOLDOWN_MS;
                    stats.quitStreak = 0;
                    playerStats.set(userId, stats);
                    await safeReply(
                        message,
                        `${EMOJIS.UNKNOWN} Game stopped. The word was *${secretWord.toLowerCase()}*.\n${EMOJIS.SLOWMODE} **Rage Quit Detected.** You are now on cooldown for 5 minutes.`
                    );
                } else {
                    playerStats.set(userId, stats);
                    await safeReply(
                        message,
                        `${EMOJIS.UNKNOWN} Game stopped. The word was *${secretWord.toLowerCase()}*.\n-# Warning: Quitting repeatedly will trigger a cooldown.`
                    );
                }
                collector.stop();
                return;
            }

            // --- GUESS VALIDATION ---
            if (content.length !== wordLength) {
                const warning = await safeReply(
                    message,
                    `${EMOJIS.HAZARD} Word must be **${wordLength}** letters long!`
                );
                if (warning)
                    setTimeout(() => warning.delete().catch(() => { }), 3000);
                return;
            }
            if (!/^[A-Z]+$/.test(content)) return;

            if (!validWords.has(content)) {
                const warning = await safeReply(
                    message,
                    `${EMOJIS.CROSS} **${content.toLowerCase()}** is not in the ${mode} database!`
                );
                if (warning)
                    setTimeout(() => warning.delete().catch(() => { }), 3000);
                return;
            }

            // --- GAMEPLAY ---
            guesses.push(content);
            turnHintUsed = false; // Reset hint usage for the new turn

            const currentTurn = guesses.length;
            const remaining = maxChances - currentTurn;
            const rowEmojis = generateCustomRow(content, secretWord, appEmojis);

            // Only show "Type 'hint'" in footer if in danger zone (last 3 guesses)
            const hintPrompt = remaining <= 3 ? " | Type 'hint'" : "";
            const footer = `-# ${remaining} guesses left | Ends ${timeString}${hintPrompt}`;

            if (content === secretWord) {
                isGameOver = true;
                stats.quitStreak = 0;
                playerStats.set(userId, stats);
                await safeReply(
                    message,
                    `${rowEmojis}\n${EMOJIS.CHECKMARK} Correct! The word was *${secretWord.toLowerCase()}*.`
                );
                collector.stop();
                return;
            }

            if (currentTurn >= maxChances) {
                isGameOver = true;
                stats.quitStreak = 0;
                playerStats.set(userId, stats);
                await safeReply(
                    message,
                    `${rowEmojis}\n${EMOJIS.CLOCK} Game Over. The word was *${secretWord.toLowerCase()}*.\n${footer}`
                );
                collector.stop();
                return;
            }

            await safeReply(message, `${rowEmojis}\n${footer}`);
        });

        collector.on("end", (collected, reason) => {
            activeGames.delete(userId);
            if (reason === "time" && !isGameOver) {
                interaction.followUp(
                    `${EMOJIS.SLOWMODE} Time's up! The word was *${secretWord.toLowerCase()}*.`
                );
            }
        });
    },
};

function generateCustomRow(guess, secret, appEmojis) {
    let secretArr = secret.split("");
    let guessArr = guess.split("");
    let statusArr = Array(secret.length).fill("dark");

    for (let i = 0; i < secret.length; i++) {
        if (guessArr[i] === secretArr[i]) {
            statusArr[i] = "green";
            secretArr[i] = null;
            guessArr[i] = null;
        }
    }
    for (let i = 0; i < secret.length; i++) {
        if (guessArr[i] !== null) {
            const foundIndex = secretArr.indexOf(guessArr[i]);
            if (foundIndex !== -1) {
                statusArr[i] = "yellow";
                secretArr[foundIndex] = null;
            }
        }
    }
    return guess
        .split("")
        .map((char, i) => {
            const status = statusArr[i];
            const emojiName = `${status}_${char.toLowerCase()}`;
            const customEmoji = appEmojis.find((e) => e.name === emojiName);

            if (customEmoji) {
                return customEmoji.toString();
            } else {
                const block =
                    status === "green"
                        ? "🟩"
                        : status === "yellow"
                            ? "🟨"
                            : "⬛";
                return `**${char}**${block}`;
            }
        })
        .join("");
}
