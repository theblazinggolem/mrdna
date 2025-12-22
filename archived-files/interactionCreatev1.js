const {
    Events,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require("discord.js");
const menuData = require("../data/menu-data.json");
const commandData = require("../data/command-data.json");

// Helper function to find an interaction handler in menuData or commandData
function findInteractionHandler(customId, value = null) {
    console.log(`Searching for handler: customId=${customId}, value=${value}`);

    // First check in menuData
    for (const item of menuData) {
        if (!item.components) continue;

        for (const component of item.components) {
            // For buttons
            if (
                component.type === "button" &&
                component.custom_id === customId
            ) {
                console.log(`Found button handler for ${customId} in menuData`);
                return component.onInteraction;
            }

            // For select menus
            if (
                component.type === "string-select-menu" &&
                component.custom_id === customId
            ) {
                console.log(`Found select menu for ${customId} in menuData`);

                // If we need a specific option
                if (value && component.options) {
                    for (const option of component.options) {
                        if (option.value === value) {
                            console.log(
                                `Found option handler for ${customId}:${value} in menuData`
                            );
                            return option.onInteraction;
                        }
                    }
                }
            }
        }
    }

    // Then check in commandData
    if (commandData && commandData.components) {
        for (const component of commandData.components) {
            // For buttons
            if (
                component.type === "button" &&
                component.custom_id === customId
            ) {
                console.log(
                    `Found button handler for ${customId} in commandData`
                );
                return component.onInteraction;
            }
        }
    }

    console.log(`No handler found for ${customId}${value ? ":" + value : ""}`);
    return null;
}

// Helper function to create a select menu based on config data
function createSelectMenu(menuConfig) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(menuConfig.custom_id)
        .setPlaceholder(menuConfig.placeholder || "Select an option");

    menuConfig.options.forEach((opt) => {
        selectMenu.addOptions({
            label: opt.label,
            value: opt.value,
            description: opt.description || null,
        });

        if (opt.emoji_id || opt.emoji_name) {
            const emoji = {};
            if (opt.emoji_id) emoji.id = String(opt.emoji_id);
            if (opt.emoji_name) emoji.name = opt.emoji_name;
            if (opt.emoji_animated !== undefined)
                emoji.animated = opt.emoji_animated;

            selectMenu.options[selectMenu.options.length - 1].setEmoji(emoji);
        }
    });

    return new ActionRowBuilder().addComponents(selectMenu);
}

// Helper function to create a button based on config data
function createButton(buttonConfig) {
    const button = new ButtonBuilder()
        .setCustomId(buttonConfig.custom_id)
        .setLabel(buttonConfig.label);

    // Set style
    switch (buttonConfig.style?.toLowerCase()) {
        case "primary":
            button.setStyle(ButtonStyle.Primary);
            break;
        case "secondary":
            button.setStyle(ButtonStyle.Secondary);
            break;
        case "success":
            button.setStyle(ButtonStyle.Success);
            break;
        case "danger":
            button.setStyle(ButtonStyle.Danger);
            break;
        case "link":
            button.setStyle(ButtonStyle.Link);
            break;
        default:
            button.setStyle(ButtonStyle.Primary);
    }

    // Set emoji if present
    if (buttonConfig.emoji_id || buttonConfig.emoji_name) {
        const emoji = {};
        if (buttonConfig.emoji_id) emoji.id = String(buttonConfig.emoji_id);
        if (buttonConfig.emoji_name) emoji.name = buttonConfig.emoji_name;
        if (buttonConfig.emoji_animated !== undefined)
            emoji.animated = buttonConfig.emoji_animated;

        button.setEmoji(emoji);
    }

    // Set disabled state if specified
    if (buttonConfig.disabled !== undefined) {
        button.setDisabled(buttonConfig.disabled);
    }

    return button;
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(
                    interaction.commandName
                );
                if (!command) {
                    console.error(
                        `No command matching ${interaction.commandName} was found.`
                    );
                    await interaction.reply({
                        content: `Error: Command '${interaction.commandName}' not found.`,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                await command.execute(interaction);
            }
            // Handle button interactions
            else if (interaction.isButton()) {
                const customId = interaction.customId;
                console.log(`Processing button: ${customId}`);

                // Get a copy of the original components
                const originalComponents = interaction.message.components.map(
                    (row) => {
                        const newRow = new ActionRowBuilder();

                        row.components.forEach((component) => {
                            if (component.type === 3) {
                                // StringSelectMenu type
                                newRow.addComponents(
                                    StringSelectMenuBuilder.from(component)
                                );
                            } else if (component.type === 2) {
                                // Button type
                                newRow.addComponents(
                                    ButtonBuilder.from(component)
                                );
                            }
                        });

                        return newRow;
                    }
                );

                // Special handling for show-retired-staff button
                if (customId === "show-retired-staff" && interaction.guild) {
                    try {
                        // Use deferUpdate to avoid the "edited" label
                        await interaction.deferUpdate();

                        console.log(
                            "Fetching guild members for retired staff list..."
                        );
                        // Fetch all guild members
                        const members = await interaction.guild.members.fetch();
                        console.log(
                            `Fetched ${members.size} members from the guild.`
                        );

                        // Fetch the retired staff role
                        const retiredStaffRole =
                            interaction.guild.roles.cache.get(
                                "1349062812722397305"
                            );
                        if (!retiredStaffRole)
                            console.log(
                                "Retired Staff role not found in cache"
                            );

                        // Build the content
                        let content = "# RETIRED STAFF\n\n";

                        // Add retired staff
                        content += `**Retired Staff**\n`;

                        if (retiredStaffRole) {
                            const retiredStaffMembers = members.filter((m) =>
                                m.roles.cache.has(retiredStaffRole.id)
                            );
                            console.log(
                                `Found ${retiredStaffMembers.size} members with Retired Staff role`
                            );

                            if (retiredStaffMembers.size > 0) {
                                retiredStaffMembers.forEach((member) => {
                                    content += `- ${member.toString()}\n`;
                                });
                            } else {
                                content += "- No members with this role\n";
                            }
                        } else {
                            content += "- Role not found\n";
                        }

                        // Send the response
                        await interaction.followUp({
                            content: content,
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch (error) {
                        console.error(
                            "Error handling retired staff button:",
                            error
                        );
                        await interaction.followUp({
                            content:
                                "There was an error fetching retired staff information: " +
                                error.message,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    return;
                }

                // Find the handler for this button in menuData
                const handler = findInteractionHandler(customId);

                if (handler) {
                    // Handle based on the interaction type
                    if (handler.type === "message") {
                        try {
                            console.log(
                                `Sending message for button ${customId}`
                            );

                            // Use deferUpdate to avoid the "edited" label
                            await interaction.deferUpdate();
                            await interaction.followUp({
                                content: handler.content,
                                flags: MessageFlags.Ephemeral,
                            });
                        } catch (error) {
                            console.error(
                                `Error sending button response ${customId}:`,
                                error
                            );
                        }
                    } else {
                        console.log(
                            `Unhandled interaction handler type: ${handler.type}`
                        );
                        try {
                            // Use deferUpdate to avoid the "edited" label
                            await interaction.deferUpdate();
                            await interaction.followUp({
                                content:
                                    "This interaction type is not supported yet.",
                                flags: MessageFlags.Ephemeral,
                            });
                        } catch (error) {
                            console.error(
                                "Error sending unsupported type message:",
                                error
                            );
                        }
                    }
                } else {
                    console.log(`No handler found for button: ${customId}`);
                    try {
                        // Use deferUpdate to avoid the "edited" label
                        await interaction.deferUpdate();
                        await interaction.followUp({
                            content: "This button is not configured.",
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch (error) {
                        console.error(
                            "Error sending not configured message:",
                            error
                        );
                    }
                }
            }
            // Handle select menu interactions
            else if (interaction.isStringSelectMenu()) {
                const customId = interaction.customId;
                const selectedValue = interaction.values[0];
                console.log(
                    `Processing select menu: ${customId}, selected: ${selectedValue}`
                );

                // Get a copy of the original components to reset the placeholder
                const originalComponents = interaction.message.components.map(
                    (row) => {
                        const newRow = new ActionRowBuilder();

                        row.components.forEach((component) => {
                            if (component.type === 3) {
                                // StringSelectMenu type
                                // Create a new select menu with the original placeholder
                                const newMenu =
                                    StringSelectMenuBuilder.from(component);
                                if (component.customId === customId) {
                                    // Reset the placeholder to its original value
                                    const originalMenu = menuData
                                        .find((item) =>
                                            item.components?.some(
                                                (comp) =>
                                                    comp.custom_id === customId
                                            )
                                        )
                                        ?.components?.find(
                                            (comp) =>
                                                comp.custom_id === customId
                                        );

                                    if (
                                        originalMenu &&
                                        originalMenu.placeholder
                                    ) {
                                        newMenu.setPlaceholder(
                                            originalMenu.placeholder
                                        );
                                    } else {
                                        newMenu.setPlaceholder(
                                            "Select an option"
                                        );
                                    }
                                }
                                newRow.addComponents(newMenu);
                            } else if (component.type === 2) {
                                // Button type
                                newRow.addComponents(
                                    ButtonBuilder.from(component)
                                );
                            }
                        });

                        return newRow;
                    }
                );

                // Special handling for staff-info option
                if (selectedValue === "staff-info" && interaction.guild) {
                    try {
                        // Update with the original components to reset the placeholder
                        await interaction.update({
                            components: originalComponents,
                        });

                        console.log("Fetching guild members for staff list...");
                        // First, attempt to fetch all guild members to ensure we have them cached
                        const members = await interaction.guild.members.fetch();
                        console.log(
                            `Fetched ${members.size} members from the guild.`
                        );

                        // Fetch the roles
                        const adminRole =
                            interaction.guild.roles.cache.get(
                                "862616575890030592"
                            );
                        const seniorStaffRole =
                            interaction.guild.roles.cache.get(
                                "867964544717295646"
                            );
                        const staffRole =
                            interaction.guild.roles.cache.get(
                                "842763148985368617"
                            );
                        const trialStaffRole =
                            interaction.guild.roles.cache.get(
                                "842742230409150495"
                            );

                        if (!adminRole)
                            console.log("Admin role not found in cache");
                        if (!seniorStaffRole)
                            console.log("Senior Staff role not found in cache");
                        if (!staffRole)
                            console.log("Staff role not found in cache");
                        if (!trialStaffRole)
                            console.log("Trial Staff role not found in cache");

                        // Build the content
                        let content =
                            "# STAFF\nhierarchy of staff in the server\n\n";

                        // Add administrators
                        content += `**Administrators** (${
                            adminRole
                                ? adminRole.toString()
                                : "<@&862616575890030592>"
                        })\n`;
                        content += "- <@732177983741362256>\n";
                        content += "- <@1038453964812861440>\n";
                        content += "- <@693325837944225833>\n\n";

                        // Add senior staff
                        content += `**Senior Staff** (${
                            seniorStaffRole
                                ? seniorStaffRole.toString()
                                : "<@&867964544717295646>"
                        })\n`;

                        if (seniorStaffRole) {
                            const seniorStaffMembers = members.filter((m) =>
                                m.roles.cache.has(seniorStaffRole.id)
                            );
                            console.log(
                                `Found ${seniorStaffMembers.size} members with Senior Staff role`
                            );

                            if (seniorStaffMembers.size > 0) {
                                seniorStaffMembers.forEach((member) => {
                                    content += `- ${member.toString()}\n`;
                                });
                            } else {
                                content += "- No members with this role\n";
                            }
                        } else {
                            content += "- Role not found\n";
                        }
                        content += "\n";

                        // Add staff
                        content += `**Staff** (${
                            staffRole
                                ? staffRole.toString()
                                : "<@&842763148985368617>"
                        })\n`;

                        if (staffRole) {
                            const staffMembers = members.filter((m) =>
                                m.roles.cache.has(staffRole.id)
                            );
                            console.log(
                                `Found ${staffMembers.size} members with Staff role`
                            );

                            if (staffMembers.size > 0) {
                                staffMembers.forEach((member) => {
                                    content += `- ${member.toString()}\n`;
                                });
                            } else {
                                content += "- No members with this role\n";
                            }
                        } else {
                            content += "- Role not found\n";
                        }
                        content += "\n";

                        // Add trial staff
                        content += `**Trial Staff** (${
                            trialStaffRole
                                ? trialStaffRole.toString()
                                : "<@&842742230409150495>"
                        })\n`;

                        if (trialStaffRole) {
                            const trialStaffMembers = members.filter((m) =>
                                m.roles.cache.has(trialStaffRole.id)
                            );
                            console.log(
                                `Found ${trialStaffMembers.size} members with Trial Staff role`
                            );

                            if (trialStaffMembers.size > 0) {
                                trialStaffMembers.forEach((member) => {
                                    content += `- ${member.toString()}\n`;
                                });
                            } else {
                                content += "- No members with this role\n";
                            }
                        } else {
                            content += "- Role not found\n";
                        }

                        // Create a button for showing retired staff
                        const retiredStaffButton = new ButtonBuilder()
                            .setCustomId("show-retired-staff")
                            .setLabel("Show Retired Staff")
                            .setStyle(ButtonStyle.Secondary);

                        const row = new ActionRowBuilder().addComponents(
                            retiredStaffButton
                        );

                        // Send the response with the button
                        await interaction.followUp({
                            content: content,
                            components: [row],
                            flags: MessageFlags.Ephemeral,
                        });
                    } catch (error) {
                        console.error("Error handling staff-info:", error);
                        await interaction.followUp({
                            content:
                                "There was an error fetching staff information: " +
                                error.message,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    return;
                }

                // Find the handler for this select menu option in menuData
                const handler = findInteractionHandler(customId, selectedValue);

                if (handler) {
                    // Handle based on the interaction type
                    if (handler.type === "message") {
                        try {
                            console.log(
                                `Sending message for ${customId}:${selectedValue}`
                            );

                            // Update with the original components to reset the placeholder
                            await interaction
                                .update({ components: originalComponents })
                                .then(async () => {
                                    await interaction.followUp({
                                        content: handler.content,
                                        flags: MessageFlags.Ephemeral,
                                    });
                                });
                        } catch (error) {
                            console.error(
                                `Error sending select menu response ${customId}:${selectedValue}:`,
                                error
                            );
                        }
                    } else {
                        console.log(
                            `Unhandled interaction handler type: ${handler.type}`
                        );
                        try {
                            // Update with the original components to reset the placeholder
                            await interaction
                                .update({ components: originalComponents })
                                .then(async () => {
                                    await interaction.followUp({
                                        content:
                                            "This interaction type is not supported yet.",
                                        flags: MessageFlags.Ephemeral,
                                    });
                                });
                        } catch (error) {
                            console.error(
                                "Error sending unsupported type message:",
                                error
                            );
                        }
                    }
                } else {
                    console.log(
                        `No handler found for select menu: ${customId}, value: ${selectedValue}`
                    );
                    try {
                        // Update with the original components to reset the placeholder
                        await interaction
                            .update({ components: originalComponents })
                            .then(async () => {
                                await interaction.followUp({
                                    content:
                                        "This select menu option is not configured.",
                                    flags: MessageFlags.Ephemeral,
                                });
                            });
                    } catch (error) {
                        console.error(
                            "Error sending not configured message:",
                            error
                        );
                    }
                }
            } else {
                // Other interaction types not handled
            }
        } catch (error) {
            console.error(
                `Error processing interaction (${interaction.type} - ${
                    interaction.customId || interaction.commandName
                }):`,
                error
            );

            // Only try to reply if the error is not about already acknowledged interactions
            if (!error.message?.includes("already been acknowledged")) {
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({
                            content:
                                "An error occurred while processing your request.",
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        await interaction.reply({
                            content:
                                "An error occurred while processing your request.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                } catch (followUpError) {
                    console.error(
                        "Error sending follow-up error message:",
                        followUpError
                    );
                }
            }
        }
    },
};
