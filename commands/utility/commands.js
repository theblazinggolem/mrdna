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
            // Check if the command-data.json file has the expected content
            if (!commandData || !commandData.content) {
                return interaction.reply({
                    content:
                        "Command list configuration not found in command-data.json.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Create components if any in the command data
            const components = [];

            if (commandData.components && commandData.components.length > 0) {
                for (const comp of commandData.components) {
                    if (comp["action-row"]) {
                        const actionRow = new ActionRowBuilder();

                        // Handle different component types
                        if (comp.type === "button") {
                            const button = new ButtonBuilder()
                                .setCustomId(comp.custom_id)
                                .setLabel(comp.label);

                            // Set the style (default to PRIMARY if not specified)
                            const style = comp.style || "primary";
                            const buttonStyle =
                                {
                                    primary: ButtonStyle.Primary,
                                    secondary: ButtonStyle.Secondary,
                                    success: ButtonStyle.Success,
                                    danger: ButtonStyle.Danger,
                                    link: ButtonStyle.Link,
                                }[style.toLowerCase()] || ButtonStyle.Primary;

                            button.setStyle(buttonStyle);

                            // Add emoji if specified
                            if (comp.emoji_id) {
                                button.setEmoji({
                                    id: String(comp.emoji_id),
                                    name: comp.emoji_name,
                                    animated: comp.emoji_animated,
                                });
                            }

                            // Set disabled state if specified
                            if (comp.disabled !== undefined) {
                                button.setDisabled(comp.disabled);
                            }

                            actionRow.addComponents(button);
                        }

                        components.push(actionRow);
                    }
                }
            }

            // Send the message with the content and components
            await interaction.reply({
                content: commandData.content,
                components: components,
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            console.error("Error in commands command:", error);
            await interaction.reply({
                content: "An error occurred while fetching the command list.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
