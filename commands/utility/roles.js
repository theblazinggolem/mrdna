const {
    SlashCommandBuilder,
    MessageFlags,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");

const LVL_25_CONFIG = {
    customId: "lvl_25_gradient_roles",
    title: "Lvl 25+ Gradient Role",
    minRoleId: "1375397609908469800",
    maxRoleId: "1375397935050919997",
    requiredRoleIds: [
        "843856166994968597", // lvl 25 role
        "843856481288060978", // lvl 50 role
        "843856587469750333", // lvl 75 role
        "843856716382208020", // lvl 100 role
        "843856730232324148", // lvl 200 role
        "842053547301273642", // vip pass role
        "855954434935619584", // booster role
        "857990235194261514", // staff
        "913864890916147270", // admins
    ],
};

const LVL_50_CONFIG = {
    customId: "lvl_50_gradient_roles",
    title: "Lvl 50+ Gradient Role",
    minRoleId: "1424016868091363444",
    maxRoleId: "1414114229136654416",
    requiredRoleIds: [
        "843856481288060978", // lvl 50 role
        "843856587469750333", // lvl 75 role
        "843856716382208020", // lvl 100 role
        "843856730232324148", // lvl 200 role
        "842053547301273642", // vip pass role
        "855954434935619584", // booster role
        "857990235194261514", // staff
        "913864890916147270", // admins
    ],
};

const CHARACTER_ROLES_CONFIG = {
    customId: "character_roles",
    title: "Character Role",
    minRoleId: "1414619710968037449", // e.g., "142800000000000000"
    maxRoleId: "1424016949288898731", // e.g., "142800000000000001"
    requiredRoleIds: [
        "843856481288060978", // lvl 50 role
        "843856587469750333", // lvl 75 role
        "843856716382208020", // lvl 100 role
        "843856730232324148", // lvl 200 role
        "842053547301273642", // vip pass role
        "855954434935619584", // booster role
        "857990235194261514", // staff
        "913864890916147270", // admins
    ], // Add any required roles here, or leave empty for all users
};

const ALL_CONFIGS = [LVL_25_CONFIG, LVL_50_CONFIG, CHARACTER_ROLES_CONFIG];
const REMOVE_ALL_BUTTON_ID = "remove_all_cosmetic_roles";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("roles")
        .setDescription(
            "Select your cosmetic roles (gradients, characters, etc.)."
        ),

    async execute(interaction) {
        // Defer reply publicly, as requested.
        await interaction.deferReply();

        try {
            const member = interaction.member;

            // We fetch all roles to ensure the cache is up-to-date
            await interaction.guild.roles.fetch();

            const actionRows = [];
            const menuPlaceholders = {}; // To store original placeholders

            // Create the 3 select menus
            for (const config of ALL_CONFIGS) {
                const { menu, placeholder } = await createRoleMenu(
                    interaction.guild,
                    member,
                    config
                );
                actionRows.push(new ActionRowBuilder().addComponents(menu));
                menuPlaceholders[config.customId] = placeholder; // Store the placeholder text
            }

            // Create the "Remove All" button
            const removeButton = new ButtonBuilder()
                .setCustomId(REMOVE_ALL_BUTTON_ID)
                .setLabel("Remove All Cosmetic Roles")
                .setStyle(ButtonStyle.Danger);

            actionRows.push(new ActionRowBuilder().addComponents(removeButton));

            // Edit the public reply
            const reply = await interaction.editReply({
                content:
                    "# Gradient Roles\nSelect a role from the options below",
                components: actionRows,
            });

            // Create a collector to listen for button clicks and menu selections
            const collector = reply.createMessageComponentCollector({
                componentType:
                    ComponentType.StringSelect | ComponentType.Button,
                time: 5 * 60 * 1000, // 5 minutes
            });

            collector.on("collect", async (i) => {
                const member = i.member;

                // --- Handle Button Click ---
                if (i.isButton()) {
                    if (i.customId === REMOVE_ALL_BUTTON_ID) {
                        // Defer the button click ephemerally
                        await i.deferUpdate({ flags: MessageFlags.Ephemeral });

                        const allRolesToRemove = [];
                        let rolesFoundCount = 0;

                        // Find all roles from all categories
                        for (const config of ALL_CONFIGS) {
                            const categoryRoles = await getRolesInConfig(
                                i.guild,
                                config
                            );
                            const userRole = member.roles.cache.find((r) =>
                                categoryRoles.has(r.id)
                            );
                            if (userRole) {
                                allRolesToRemove.push(userRole);
                                rolesFoundCount++;
                            }
                        }

                        if (rolesFoundCount === 0) {
                            return i.followUp({
                                content:
                                    "You do not have any roles from these categories to remove.",
                                flags: MessageFlags.Ephemeral,
                            });
                        }

                        await member.roles.remove(allRolesToRemove);
                        return i.followUp({
                            content: `Removed ${rolesFoundCount} cosmetic role(s).`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                }

                // --- Handle Menu Selection ---
                if (i.isStringSelectMenu()) {
                    const config = ALL_CONFIGS.find(
                        (c) => c.customId === i.customId
                    );
                    if (!config) return; // Should not happen

                    const newRoleId = i.values[0];
                    const newRole = await i.guild.roles.fetch(newRoleId);

                    const categoryRoles = await getRolesInConfig(
                        i.guild,
                        config
                    );
                    const currentRole = member.roles.cache.find((r) =>
                        categoryRoles.has(r.id)
                    );

                    let removedRoleMsg = "";

                    if (currentRole) {
                        if (currentRole.id === newRoleId) {
                            // User re-selected the same role. Do nothing but reset the placeholder.
                            await i.update({
                                components: i.message.components,
                            }); // Resets placeholder
                            return i.followUp({
                                content: `You already have the ${currentRole.toString()} role.`,
                                flags: MessageFlags.Ephemeral,
                            });
                        }
                        // Remove the old role from this category
                        await member.roles.remove(currentRole);
                        removedRoleMsg = `\nRemoved: ${currentRole.toString()}`;
                    }

                    // Add the new role
                    await member.roles.add(newRole);

                    // --- Reset Placeholders ---
                    // Create a deep copy of the original components to reset the placeholder
                    const originalComponents = i.message.components.map(
                        (row) => {
                            const newRow = new ActionRowBuilder();
                            row.components.forEach((component) => {
                                if (
                                    component.type ===
                                    ComponentType.StringSelect
                                ) {
                                    const originalPlaceholder =
                                        menuPlaceholders[component.customId] ||
                                        "Select an option";
                                    newRow.addComponents(
                                        StringSelectMenuBuilder.from(
                                            component
                                        ).setPlaceholder(originalPlaceholder)
                                    );
                                } else if (
                                    component.type === ComponentType.Button
                                ) {
                                    newRow.addComponents(
                                        ButtonBuilder.from(component)
                                    );
                                }
                            });
                            return newRow;
                        }
                    );

                    // Update the message to reset the placeholders
                    await i.update({ components: originalComponents });

                    // Send the formatted reply
                    await i.followUp({
                        content: `Added: ${newRole.toString()}${removedRoleMsg}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            });

            collector.on("end", () => {
                // Remove all components when the collector expires
                interaction
                    .editReply({
                        content: "This role selector has expired.",
                        components: [],
                    })
                    .catch(() => {});
            });
        } catch (error) {
            console.error("Error in role-picker command:", error);
            await interaction.editReply({
                content: `An error occurred: ${error.message}`,
            });
        }
    },
};

/**
 * Checks if a member meets the role requirements for a config.
 * @param {import('discord.js').GuildMember} member The member to check.
 * @param {object} config The role config object.
 * @returns {boolean} True if the member is authorized.
 */
function isMemberAuthorized(member, config) {
    if (config.requiredRoleIds.length === 0) {
        return true; // No requirements, everyone is authorized
    }
    return config.requiredRoleIds.some((roleId) =>
        member.roles.cache.has(roleId)
    );
}

/**
 * Fetches the roles within the boundaries of a config.
 * @param {import('discord.js').Guild} guild The guild object.
 * @param {object} config The role config object.
 * @returns {Promise<Map<string, import('discord.js').Role>>} A map of the roles in this category.
 */
async function getRolesInConfig(guild, config) {
    try {
        const minRole = await guild.roles.fetch(config.minRoleId);
        const maxRole = await guild.roles.fetch(config.maxRoleId);

        if (!minRole || !maxRole) {
            console.error(`Boundary roles not found for ${config.title}`);
            return new Map();
        }

        const lowerBound = Math.min(minRole.position, maxRole.position);
        const upperBound = Math.max(minRole.position, maxRole.position);

        return guild.roles.cache.filter(
            (role) => role.position > lowerBound && role.position < upperBound
        );
    } catch (error) {
        console.error(
            `Error fetching boundary roles for ${config.title}:`,
            error
        );
        return new Map();
    }
}

/**
 * Creates a StringSelectMenu for a specific role category.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @param {object} config
 * @returns {Promise<{menu: StringSelectMenuBuilder, placeholder: string}>}
 */
async function createRoleMenu(guild, member, config) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(config.customId)
        .setMinValues(1)
        .setMaxValues(1);

    const isAuthorized = isMemberAuthorized(member, config);
    let placeholder = "";

    if (!isAuthorized) {
        placeholder = `You do not meet the requirements for ${config.title}.`;
        menu.setPlaceholder(placeholder).setDisabled(true);
        return { menu, placeholder }; // Return the disabled menu
    }

    const roles = await getRolesInConfig(guild, config);

    if (roles.size === 0) {
        placeholder = `No roles are currently available for ${config.title}.`;
        menu.setPlaceholder(placeholder).setDisabled(true);
        return { menu, placeholder }; // Return disabled menu if no roles are found
    }

    const options = roles.map((role) => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(role.name)
            .setValue(role.id);
    });

    // Discord select menus have a limit of 25 options.
    if (options.length > 25) {
        options.length = 25; // Truncate the array
    }

    placeholder = `Select a ${config.title}`;
    menu.setPlaceholder(placeholder).addOptions(options);

    return { menu, placeholder };
}
