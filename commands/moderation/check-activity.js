const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require("discord.js");
const generateStaffReport = require("../../utils/generateStaffReport");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("check-activity")
        .setDescription(
            "Generate the Staff Activity JSON Report (same as bi-weekly)"
        )
        .addIntegerOption((option) =>
            option
                .setName("days")
                .setDescription("Days to look back (default: 14)")
                .setMinValue(1)
        )
        .addBooleanOption((option) =>
            option
                .setName("public")
                .setDescription("Send as a public message? (Default: False)")
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const isPublic = interaction.options.getBoolean("public") || false;

        // Use flags if not public, otherwise default reply
        if (isPublic) {
            await interaction.deferReply();
        } else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const days = interaction.options.getInteger("days") || 14;

        try {
            const { messageContent, attachment, error } = await generateStaffReport(
                interaction.client,
                interaction.guild.id,
                days
            );

            if (error) {
                return interaction.editReply(`❌ ${error}`);
            }

            await interaction.editReply({
                content: messageContent,
                files: [attachment],
            });

        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ An error occurred while generating the report.");
        }
    },
};

