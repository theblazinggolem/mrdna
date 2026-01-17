const { SlashCommandBuilder } = require("discord.js");
const db = require("../../db.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("quote")
        .setDescription("replies with a server quote"),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const result = await db.query(
                "SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1"
            );

            if (result.rows.length === 0) {
                return interaction.editReply(
                    "No quotes found in the database."
                );
            }

            const quoteObj = result.rows[0];
            let quote;

            if (!quoteObj.reply) {
                quote = `${quoteObj.text}\n-# jump to [original message](${quoteObj.link})`;
            } else {
                quote = `${quoteObj.text}\n-# jump to [original message](${quoteObj.link}) | replied to:\n-# > ${quoteObj.reply}`;
            }

            await interaction.editReply(quote);
        } catch (error) {
            console.error(error);
            await interaction.editReply(
                "An error occurred while fetching the quote."
            );
        }
    },
};
