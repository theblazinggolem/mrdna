const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    AttachmentBuilder, // <-- Imported AttachmentBuilder
} = require("discord.js");

const resultsChannelId = "1439264250471252058";
const quizQuestions = require("../../data/quiz-data.js");

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = {
    // 1. COMMAND DEFINITION
    data: new SlashCommandBuilder()
        .setName("quiz")
        .setDescription("Starts a multiple-choice quiz!"),

    // 2. COMMAND EXECUTION
    async execute(interaction) {
        // All quiz logic is contained within this execute function.

        const user = interaction.user;
        const client = interaction.client; // Get the client from the interaction
        const startTime = Date.now(); // <-- Record start time
        let score = 0;
        const userAnswers = [];
        // Get a shuffled copy of the questions from the imported data
        const questions = shuffleArray([...quizQuestions]);
        let questionIndex = 0;

        await interaction.reply({
            content: "Starting the quiz! Get ready for the first question...",
            flags: [MessageFlags.Ephemeral],
        });

        // Function to ask a single question
        async function askQuestion() {
            // If we've run out of questions, end the quiz
            if (questionIndex >= questions.length) {
                await endQuiz();
                return;
            }

            const currentQuestion = questions[questionIndex];
            const {
                question: questionText,
                options,
                correct,
            } = currentQuestion;

            // --- FIX FOR DUPLICATE OPTIONS ---
            // 1. Get only unique options from the data file
            const uniqueOptions = [...new Set(options)];
            // 2. Shuffle the unique options
            const shuffledOptions = shuffleArray(uniqueOptions);
            // --- END FIX ---

            // Create the Select Menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId("quiz_answer")
                .setPlaceholder("Select an answer...")
                .addOptions(
                    shuffledOptions.map(
                        (
                            option // <-- Now uses the de-duplicated "shuffledOptions"
                        ) =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(option.slice(0, 100))
                                .setValue(option)
                    )
                );

            // Create the Skip Button
            const skipButton = new ButtonBuilder()
                .setCustomId("quiz_skip")
                .setLabel("Skip Question")
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            const buttonRow = new ActionRowBuilder().addComponents(skipButton);

            // --- NEW QUESTION FORMAT ---
            const expiryTimestamp = Math.floor((Date.now() + 15000) / 1000);
            const questionContent = `__ **Question ${questionIndex + 1}/${
                questions.length
            }**__\n-# next question <t:${expiryTimestamp}:R>\n\n${questionText}`;
            // --- END NEW FORMAT ---

            // Use editReply to update the interaction message
            const message = await interaction.editReply({
                content: questionContent, // <-- Updated content
                embeds: [], // <-- Removed embeds
                components: [row, buttonRow],
            });

            // Create a filter to ensure only the user who started the quiz can interact
            const filter = (i) => {
                return (
                    i.user.id === user.id &&
                    (i.customId === "quiz_answer" || i.customId === "quiz_skip")
                );
            };

            try {
                // Wait for an interaction (Select Menu or Button)
                const collectedInteraction =
                    await message.awaitMessageComponent({
                        filter: filter,
                        time: 15000, // 15 seconds
                    });

                let userAnswer;
                let feedback = "Moving to the next question...";

                if (collectedInteraction.isStringSelectMenu()) {
                    userAnswer = collectedInteraction.values[0];
                    feedback = `You selected: ${userAnswer}.`;
                } else if (collectedInteraction.isButton()) {
                    userAnswer = "Skipped";
                    feedback = "Question skipped.";
                }

                // --- MULTI-ANSWER CHECK ---
                // Check if the user's answer is in the "correct" array
                const isCorrect = correct.includes(userAnswer);
                // --- END MULTI-ANSWER CHECK ---

                if (isCorrect) {
                    score++;
                }

                userAnswers.push({
                    question: questionText,
                    userAnswer,
                    correct: correct.join(" or "),
                    isCorrect,
                });

                // Acknowledge the button/menu interaction
                await collectedInteraction.update({
                    content: `${feedback} Moving to the next question...`,
                    embeds: [],
                    components: [],
                });
            } catch (err) {
                // This block executes if the 15-second timer runs out
                // --- MULTI-ANSWER CHECK ---
                userAnswers.push({
                    question: questionText,
                    userAnswer: "Timed Out",
                    correct: correct.join(" or "),
                    isCorrect: false,
                });
                // --- END MULTI-ANSWER CHECK ---

                await interaction.editReply({
                    content: "Time is up! Moving to the next question...", // <-- Updated content
                    embeds: [],
                    components: [],
                });
            }

            // Move to the next question
            questionIndex++;
            // Add a small delay so the user can read the feedback
            await new Promise((resolve) => setTimeout(resolve, 1500));
            await askQuestion(); // Ask the next question
        }

        // Function to end the quiz and post results
        async function endQuiz() {
            await interaction.editReply({
                content: "Quiz finished! Tallying your results...",
                embeds: [],
                components: [],
            });

            const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2); // Get time in seconds

            const resultsChannel = await client.channels.fetch(
                resultsChannelId
            );
            if (!resultsChannel) {
                console.error("Results channel not found!");
                await interaction.followUp({
                    content:
                        "Quiz finished, but I couldn't find the results channel to post your score.",
                    flags: [MessageFlags.Ephemeral],
                });
                return;
            }

            // --- NEW RESULTS FORMAT ---

            // 1. Create the text file content
            let fileContent = `Quiz Results for ${user.tag}\n`;
            fileContent += `Final Score: ${score} / ${questions.length}\n`;
            fileContent += `Time Taken: ${timeTaken} seconds\n\n`;
            fileContent += "--- ANSWERS ---\n\n";

            userAnswers.forEach((answer, index) => {
                fileContent += `Q${index + 1}: ${answer.question}\n`;
                fileContent += `  Your answer: ${answer.userAnswer}\n`;
                // "correct" is now an array, so we join it for readability
                fileContent += `  Correct answer(s): ${answer.correct}\n`;
                fileContent += `  Result: ${
                    answer.isCorrect ? "✅ Correct" : "❌ Incorrect"
                }\n\n`;
            });

            // 2. Create the attachment
            const resultsFile = new AttachmentBuilder(
                Buffer.from(fileContent, "utf-8"),
                { name: "quiz_results.txt" }
            );

            // 3. Create the results message content
            const resultsMessageContent = `Results for ${user.toString()}: ${score}/${
                questions.length
            }\n-# time taken: ${timeTaken} seconds`;

            // --- END NEW FORMAT ---

            try {
                // Send the results to the public channel
                await resultsChannel.send({
                    content: resultsMessageContent, // <-- Plain text results
                    files: [resultsFile], // <-- Attach the .txt file
                });

                // --- CHANGE HERE ---
                // Send a final ephemeral message to the user WITH THEIR SCORE
                await interaction.followUp({
                    content: `Quiz complete! You scored **${score}/${questions.length}**`,
                    flags: [MessageFlags.Ephemeral],
                });
                // --- END CHANGE ---
            } catch (err) {
                console.error("Error posting results:", err);
                await interaction.followUp({
                    content:
                        "I finished the quiz, but there was an error posting your results.",
                    flags: [MessageFlags.Ephemeral],
                });
            }
        }

        // Start the first question
        await askQuestion();
    },
};
