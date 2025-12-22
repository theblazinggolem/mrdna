const {
    Events,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require("discord.js");
const menuData = require("../data/menu-data.json");

const GLOBAL_MENU_IDS = new Set([
    "welcome-menu-options",
    "rules-info",
    "boost-info",
    "show-retired-staff",
]);

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(
                    interaction.commandName
                );
                if (!command) {
                    console.error(
                        `No command matching ${interaction.commandName} was found.`
                    );
                    return;
                }
                await command.execute(interaction);
                return;
            }

            const isMenuInteraction = GLOBAL_MENU_IDS.has(interaction.customId);

            if (!isMenuInteraction) return;

            if (interaction.isButton()) {
                const customId = interaction.customId;

                // Special Case: Retired Staff Button
                if (customId === "show-retired-staff" && interaction.guild) {
                    await handleRetiredStaff(interaction);
                    return;
                }

                // General Menu Buttons (Rules, Boost)
                const handler = findInteractionHandler(customId);
                if (handler) {
                    await interaction.deferUpdate();
                    await interaction.followUp({
                        content: handler.content,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            // --- Handle Select Menus ---
            else if (interaction.isStringSelectMenu()) {
                const customId = interaction.customId;
                const selectedValue = interaction.values[0];

                // Special Case: Staff Info
                if (selectedValue === "staff-info" && interaction.guild) {
                    await handleStaffInfo(interaction);
                    return;
                }

                // General Menu Options (Roles, Channels)
                const handler = findInteractionHandler(customId, selectedValue);
                if (handler) {
                    // Reset the placeholder visually
                    const originalComponents = resetPlaceholder(
                        interaction,
                        customId
                    );
                    await interaction.update({
                        components: originalComponents,
                    });

                    await interaction.followUp({
                        content: handler.content,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        } catch (error) {
            console.error(`Error in interactionCreate:`, error);
            // Don't reply if it's likely handled elsewhere or timed out
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: "Error processing interaction.",
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (e) {}
            }
        }
    },
};

// --- HELPER FUNCTIONS ---

function findInteractionHandler(customId, value = null) {
    for (const item of menuData) {
        if (!item.components) continue;
        for (const component of item.components) {
            if (
                component.type === "button" &&
                component.custom_id === customId
            ) {
                return component.onInteraction;
            }
            if (
                component.type === "string-select-menu" &&
                component.custom_id === customId
            ) {
                if (value && component.options) {
                    for (const option of component.options) {
                        if (option.value === value) return option.onInteraction;
                    }
                }
            }
        }
    }
    return null;
}

async function handleRetiredStaff(interaction) {
    try {
        await interaction.deferUpdate();
        const members = await interaction.guild.members.fetch();
        const retiredRole = interaction.guild.roles.cache.get(
            "1349062812722397305"
        );

        let content = "# RETIRED STAFF\n\n**Retired Staff**\n";
        if (retiredRole) {
            const retired = members.filter((m) =>
                m.roles.cache.has(retiredRole.id)
            );
            if (retired.size > 0) {
                retired.forEach((m) => (content += `- ${m.toString()}\n`));
            } else {
                content += "- No members found.\n";
            }
        } else {
            content += "- Role not found.\n";
        }

        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error("Error in retired staff:", error);
    }
}

async function handleStaffInfo(interaction) {
    try {
        // Reset placeholder
        const originalComponents = resetPlaceholder(
            interaction,
            interaction.customId
        );
        await interaction.update({ components: originalComponents });

        const guild = interaction.guild;
        const members = await guild.members.fetch();

        const roles = {
            admin: guild.roles.cache.get("913864890916147270"),
            senior: guild.roles.cache.get("867964544717295646"),
            staff: guild.roles.cache.get("842763148985368617"),
            trial: guild.roles.cache.get("842742230409150495"),
        };

        let content = "# STAFF\nhierarchy of staff in the server\n\n";

        const listMembers = (role, title) => {
            content += `**${title}** (${
                role ? role.toString() : "Role not found"
            })\n`;
            if (role) {
                const matched = members.filter((m) =>
                    m.roles.cache.has(role.id)
                );
                if (matched.size > 0)
                    matched.forEach((m) => (content += `- ${m.toString()}\n`));
                else content += "- No members\n";
            }
            content += "\n";
        };

        listMembers(roles.admin, "Administrators");
        listMembers(roles.senior, "Senior Staff");
        listMembers(roles.staff, "Staff");
        listMembers(roles.trial, "Trial Staff");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("show-retired-staff")
                .setLabel("Show Retired Staff")
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.followUp({
            content,
            components: [row],
            flags: MessageFlags.Ephemeral,
        });
    } catch (error) {
        console.error("Error in staff info:", error);
    }
}

function resetPlaceholder(interaction, targetCustomId) {
    return interaction.message.components.map((row) => {
        const newRow = new ActionRowBuilder();
        row.components.forEach((component) => {
            if (component.type === 3) {
                const newMenu = StringSelectMenuBuilder.from(component);
                if (component.customId === targetCustomId) {
                    const originalItem = menuData.find((item) =>
                        item.components?.some(
                            (comp) => comp.custom_id === targetCustomId
                        )
                    );
                    const originalComp = originalItem?.components?.find(
                        (comp) => comp.custom_id === targetCustomId
                    );
                    newMenu.setPlaceholder(
                        originalComp?.placeholder || "Select an option"
                    );
                }
                newRow.addComponents(newMenu);
            } else if (component.type === 2) {
                newRow.addComponents(ButtonBuilder.from(component));
            }
        });
        return newRow;
    });
}
