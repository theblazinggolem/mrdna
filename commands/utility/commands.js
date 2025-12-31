const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");
const commandData = require("../../data/command-data.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("commands")
        .setDescription("Shows a list of available bot commands"),

    async execute(interaction) {
        try {
            if (!commandData || !commandData.content) {
                return interaction.reply({
                    content: "Command list configuration not found.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const components = [];

            if (commandData.components && commandData.components.length > 0) {
                for (const comp of commandData.components) {
                    if (comp["action-row"]) {
                        const actionRow = new ActionRowBuilder();

                        if (comp.type === "button") {
                            const button = new ButtonBuilder()
                                .setCustomId(comp.custom_id) // <--- GLOBAL ID
                                .setLabel(comp.label);

                            const styleMap = {
                                primary: ButtonStyle.Primary,
                                secondary: ButtonStyle.Secondary,
                                success: ButtonStyle.Success,
                                danger: ButtonStyle.Danger,
                                link: ButtonStyle.Link,
                            };
                            button.setStyle(
                                styleMap[comp.style?.toLowerCase()] ||
                                    ButtonStyle.Primary
                            );

                            if (comp.emoji_id) {
                                button.setEmoji({
                                    id: String(comp.emoji_id),
                                    name: comp.emoji_name,
                                    animated: comp.emoji_animated,
                                });
                            }

                            if (comp.disabled !== undefined) {
                                button.setDisabled(comp.disabled);
                            }

                            actionRow.addComponents(button);
                        }
                        components.push(actionRow);
                    }
                }
            }

            // Send Message (NO COLLECTOR)
            await interaction.reply({
                content: commandData.content,
                components: components,
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error("Error in commands command:", error);
            if (!interaction.replied) {
                await interaction.reply({
                    content:
                        "An error occurred while fetching the command list.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    },
};
