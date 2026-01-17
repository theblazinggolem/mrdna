const { SlashCommandBuilder } = require("discord.js");
const db = require("../../db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("wordle")
        .setDescription("Play Jurassic Wordle"),

    async execute(interaction) {
        let secretWord;
        try {
            const res = await db.query(
                "SELECT word FROM wordle_jurassic ORDER BY RANDOM() LIMIT 1"
            );
            if (res.rows.length === 0) {
                return interaction.reply({
                    content: "❌ Database is empty!",
                    ephemeral: true,
                });
            }
            secretWord = res.rows[0].word.trim().toUpperCase();
        } catch (err) {
            console.error(err);
            return interaction.reply({
                content: "❌ Database error.",
                ephemeral: true,
            });
        }

        const wordLength = secretWord.length;

        let maxChances = 6;
        if (wordLength >= 12) {
            maxChances = 8;
        } else if (wordLength >= 8) {
            maxChances = 7;
        }

        let guesses = [];
        let discardedLetters = new Set();
        let isGameOver = false;

        const gameDuration = 600_000;
        const gameEndTime = Math.floor((Date.now() + gameDuration) / 1000);
        const timeString = `<t:${gameEndTime}:R>`;

        const emptyRow = "⬜".repeat(wordLength);

        await interaction.reply({
            content: `${emptyRow}\n-# Length: ${wordLength} letters | Chances: ${maxChances} | Ends ${timeString}`,
        });

        const collector = interaction.channel.createMessageCollector({
            filter: (m) => m.author.id === interaction.user.id,
            time: gameDuration,
        });

        collector.on("collect", async (message) => {
            if (isGameOver) return;

            const guess = message.content.trim().toUpperCase();

            if (guess.length !== wordLength) {
                const warning = await message.reply(
                    `⚠️ Word must be **${wordLength}** letters long!`
                );
                setTimeout(() => warning.delete().catch(() => {}), 3000);
                return;
            }

            if (!/^[A-Z]+$/.test(guess)) return;

            guesses.push(guess);
            const currentTurn = guesses.length;
            const remaining = maxChances - currentTurn;

            guess.split("").forEach((char) => {
                if (!secretWord.includes(char)) discardedLetters.add(char);
            });
            const discardedString = Array.from(discardedLetters)
                .sort()
                .join(", ");

            const rowEmojis = generateRow(guess, secretWord);

            const footer = `-# ${remaining} guesses left | Discarded: ${
                discardedString || "None"
            } | Ends ${timeString}`;

            if (guess === secretWord) {
                isGameOver = true;
                await message.reply(
                    `${rowEmojis}\n🎉 **Correct!** The word was **${secretWord}**.`
                );
                collector.stop();
                return;
            }

            if (currentTurn >= maxChances) {
                isGameOver = true;
                await message.reply(
                    `${rowEmojis}\n**Game Over.** The word was **${secretWord}**.\n${footer}`
                );
                collector.stop();
                return;
            }

            await message.reply(`${rowEmojis}\n${footer}`);
        });

        collector.on("end", (collected, reason) => {
            if (reason === "time" && !isGameOver) {
                interaction.followUp(
                    `⏰ Time's up! The word was **${secretWord}**.`
                );
            }
        });
    },
};

function generateRow(guess, secret) {
    let secretArr = secret.split("");
    let guessArr = guess.split("");
    let colors = Array(secret.length).fill("⬜");

    for (let i = 0; i < secret.length; i++) {
        if (guessArr[i] === secretArr[i]) {
            colors[i] = "🟩";
            secretArr[i] = null;
            guessArr[i] = null;
        }
    }

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
