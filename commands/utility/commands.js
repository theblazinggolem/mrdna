const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
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

            const components = [];

            if (commandData.components && commandData.components.length > 0) {
                for (const comp of commandData.components) {
                    if (comp["action-row"]) {
                        const actionRow = new ActionRowBuilder();

                        if (comp.type === "button") {
                            const button = new ButtonBuilder()
                                .setCustomId(comp.custom_id)
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

            const response = await interaction.reply({
                content: commandData.content,
                components: components,
                flags: MessageFlags.Ephemeral,
            });

            if (components.length > 0) {
                const collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 300_000,
                });

                collector.on("collect", async (i) => {
                    const btnConfig = commandData.components.find(
                        (c) => c.custom_id === i.customId
                    );

                    if (btnConfig && btnConfig.onInteraction) {
                        await i.reply({
                            content: btnConfig.onInteraction.content,
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        await i.reply({
                            content: "This button is not configured.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                });

                collector.on("end", () => {
                    // You can disable buttons here if you want,
                    // or just let them fail silently after 5 mins.
                });
            }
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
