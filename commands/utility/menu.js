const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
} = require("discord.js");
const menuData = require("../../data/menu-data.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("menu")
        .setDescription("Display the welcome menu with server information")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription(
                    "ID of an existing message to update (optional)"
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Find the welcome message from menuData
            const welcomeMsg = menuData.find(
                (item) => item.id === "welcome-msg"
            );
            const messageId = interaction.options.getString("messageid");

            if (!welcomeMsg) {
                return interaction.reply({
                    content:
                        "Welcome message configuration not found in menu-data.json.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Create a map to group components by action row
            const actionRowMap = new Map();

            // Process the components from the welcome message
            welcomeMsg.components.forEach((comp) => {
                if (comp["action-row"]) {
                    const rowNumber = comp["action-row"];

                    // Create the action row if it doesn't exist yet
                    if (!actionRowMap.has(rowNumber)) {
                        actionRowMap.set(rowNumber, new ActionRowBuilder());
                    }

                    const actionRow = actionRowMap.get(rowNumber);

                    // Handle different component types
                    if (comp.type === "string-select-menu") {
                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId(comp.custom_id)
                            .setPlaceholder(
                                comp.placeholder || "Select an option"
                            );

                        // Add options to the select menu
                        comp.options.forEach((opt) => {
                            selectMenu.addOptions({
                                label: opt.label,
                                value: opt.value,
                                description: opt.description,
                            });

                            // Add emoji if specified
                            if (opt.emoji_id) {
                                selectMenu.options[
                                    selectMenu.options.length - 1
                                ].setEmoji({
                                    id: String(opt.emoji_id),
                                    name: opt.emoji_name,
                                    animated: opt.emoji_animated,
                                });
                            }
                        });

                        actionRow.addComponents(selectMenu);
                    } else if (comp.type === "button") {
                        const button = new ButtonBuilder()
                            .setCustomId(comp.custom_id)
                            .setLabel(comp.label)
                            .setStyle(getButtonStyle(comp.style));

                        // Add emoji if specified
                        if (comp.emoji_id) {
                            button.setEmoji({
                                id: String(comp.emoji_id),
                                name: comp.emoji_name,
                                animated: comp.emoji_animated,
                            });
                        }

                        // Add disabled property if specified
                        if (comp.disabled !== undefined) {
                            button.setDisabled(comp.disabled);
                        }

                        actionRow.addComponents(button);
                    }
                }
            });

            // Convert map to array and sort by action row number
            const components = Array.from(actionRowMap.entries())
                .sort((a, b) => a[0] - b[0])
                .map((entry) => entry[1]);

            // Prepare message options
            const messageOptions = {
                content: welcomeMsg.content,
                components: components,
            };

            // If a message ID is provided, try to edit that message
            if (messageId) {
                try {
                    // Try to fetch the message
                    const targetMessage =
                        await interaction.channel.messages.fetch(messageId);

                    // Check if the message is from the bot
                    if (
                        targetMessage.author.id !== interaction.client.user.id
                    ) {
                        return interaction.reply({
                            content: "I can only edit messages that I sent.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    // Edit the message
                    await targetMessage.edit(messageOptions);

                    // Reply with confirmation
                    await interaction.reply({
                        content: `Welcome message with ID ${messageId} has been updated!`,
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (error) {
                    console.error("Error fetching or editing message:", error);
                    await interaction.reply({
                        content: `Error editing message: ${error.message}. Make sure the ID is valid and the message is in this channel.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else {
                // Send the welcome message as a separate message
                const sentMessage = await interaction.channel.send(
                    messageOptions
                );

                // Send ephemeral confirmation to the user with the message ID
                await interaction.reply({
                    content: `Welcome message sent! Message ID: ${sentMessage.id}`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (error) {
            console.error("Error in menu command:", error);
            await interaction.reply({
                content: "An error occurred while sending the welcome message.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

// Helper function to convert style string to ButtonStyle constant
function getButtonStyle(style) {
    switch (style?.toLowerCase()) {
        case "primary":
            return ButtonStyle.Primary;
        case "secondary":
            return ButtonStyle.Secondary;
        case "success":
            return ButtonStyle.Success;
        case "danger":
            return ButtonStyle.Danger;
        case "link":
            return ButtonStyle.Link;
        default:
            return ButtonStyle.Primary;
    }
}
