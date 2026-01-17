const { SlashCommandBuilder } = require("discord.js");
const db = require("../../db");

const activeGames = new Set();

async function safeReply(originalMessage, content) {
    try {
        return await originalMessage.reply(content);
    } catch (err) {
        if (err.code === 10008 || err.code === 50035) {
            return await originalMessage.channel.send(content).catch(() => {});
        }
        console.error("SafeReply Error:", err);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("wordle")
        .setDescription("Play Jurassic Wordle"),

    async execute(interaction) {
        const userId = interaction.user.id;

        if (activeGames.has(userId)) {
            return interaction.reply({
                content:
                    "<:hazard:1462056327378501738> You already have a game in progress! Finish it or type **'end game'** to quit.",
                ephemeral: true,
            });
        }

        activeGames.add(userId);

        let secretWord;
        try {
            const res = await db.query(
                "SELECT word FROM wordle_jurassic ORDER BY RANDOM() LIMIT 1"
            );
            if (res.rows.length === 0) {
                activeGames.delete(userId);
                return interaction.reply({
                    content: "<:x_:1462055048526954611> Database is empty!",
                    ephemeral: true,
                });
            }
            secretWord = res.rows[0].word.trim().toUpperCase();
        } catch (err) {
            console.error(err);
            activeGames.delete(userId); // Unlock if error
            return interaction.reply({
                content: "<:x_:1462055048526954611> Database error.",
                ephemeral: true,
            });
        }

        const wordLength = secretWord.length;
        let maxChances = 6;
        if (wordLength >= 12) maxChances = 8;
        else if (wordLength >= 8) maxChances = 7;

        let guesses = [];
        let discardedLetters = new Set();
        let isGameOver = false;

        const gameDuration = 600_000;
        const gameEndTime = Math.floor((Date.now() + gameDuration) / 1000);
        const timeString = `<t:${gameEndTime}:R>`;
        const emptyRow = "⬜".repeat(wordLength);

        await interaction.reply({
            content: `${emptyRow}\n-# Length: ${wordLength} letters | Chances: ${maxChances} | Ends ${timeString}\n-# Type **'end game'** to give up.`,
        });

        const collector = interaction.channel.createMessageCollector({
            filter: (m) => m.author.id === userId,
            time: gameDuration,
        });

        collector.on("collect", async (message) => {
            if (isGameOver) return;

            const content = message.content.trim().toUpperCase();

            // 2. Check for Manual Quit
            if (content === "END GAME") {
                isGameOver = true;
                await safeReply(
                    message,
                    `<:unknown:1462055031187705918> Game stopped. The word was **${secretWord}**.`
                );
                collector.stop();
                return;
            }

            // 3. Length Check
            if (content.length !== wordLength) {
                const warning = await safeReply(
                    message,
                    `<:hazard:1462056327378501738> Word must be **${wordLength}** letters long!`
                );
                if (warning)
                    setTimeout(() => warning.delete().catch(() => {}), 3000);
                return;
            }

            // 4. Valid Letter Check
            if (!/^[A-Z]+$/.test(content)) return;

            guesses.push(content);
            const currentTurn = guesses.length;
            const remaining = maxChances - currentTurn;

            content.split("").forEach((char) => {
                if (!secretWord.includes(char)) discardedLetters.add(char);
            });
            const discardedString = Array.from(discardedLetters)
                .sort()
                .join(", ");
            const rowEmojis = generateRow(content, secretWord);
            const footer = `-# ${remaining} guesses left | Discarded: ${
                discardedString || "None"
            } | Ends ${timeString}`;

            // 5. Win Condition
            if (content === secretWord) {
                isGameOver = true;
                await safeReply(
                    message,
                    `${rowEmojis}\n<:checkmark:1462055059197137069> Correct! The word was **${secretWord}**.`
                );
                collector.stop();
                return;
            }

            // 6. Loss Condition
            if (currentTurn >= maxChances) {
                isGameOver = true;
                await safeReply(
                    message,
                    `${rowEmojis}\n<:clock:1459169364182958244> Game Over. The word was **${secretWord}**.\n${footer}`
                );
                collector.stop();
                return;
            }

            // 7. Continue Game
            await safeReply(message, `${rowEmojis}\n${footer}`);
        });

        collector.on("end", (collected, reason) => {
            // Unlock the user so they can play again
            activeGames.delete(userId);

            if (reason === "time" && !isGameOver) {
                interaction.followUp(
                    `<:slowmode:1459169352195506321> Time's up! The word was **${secretWord}**.`
                );
            }
        });
    },
};

function generateRow(guess, secret) {
    let secretArr = secret.split("");
    let guessArr = guess.split("");
    let colors = Array(secret.length).fill("⬜");

    // Green Pass
    for (let i = 0; i < secret.length; i++) {
        if (guessArr[i] === secretArr[i]) {
            colors[i] = "🟩";
            secretArr[i] = null;
            guessArr[i] = null;
        }
    }

    // Yellow Pass
    for (let i = 0; i < secret.length; i++) {
        if (guessArr[i] !== null) {
            const foundIndex = secretArr.indexOf(guessArr[i]);
            if (foundIndex !== -1) {
                colors[i] = "🟨";
                secretArr[foundIndex] = null;
            }
        }
    }
    return colors.join("");
}
