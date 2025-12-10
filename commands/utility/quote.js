const { SlashCommandBuilder } = require("discord.js");
const { quotes } = require("../../data/quotes.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("quote")
        .setDescription("replies with a server quote"),
    async execute(interaction) {
        const randomIndex = Math.floor(Math.random() * quotes.length);
        const randomQuoteIndex = quotes[randomIndex];
        const quote = `${randomQuoteIndex.text}\n-# jump to [original message](${randomQuoteIndex.link})`;
        await interaction.reply(quote);
    },
};
