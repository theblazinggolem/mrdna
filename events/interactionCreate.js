const {
    Events,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder, // Added for role-picker
    ComponentType, // Added for role-picker
} = require("discord.js");
const menuData = require("../data/menu-data.json");
const commandData = require("../data/command-data.json");

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
    maxRoleId: "1416232141636763760",
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

const ALL_ROLE_CONFIGS = [LVL_25_CONFIG, LVL_50_CONFIG, CHARACTER_ROLES_CONFIG];
const ALL_ROLE_PICKER_IDS = new Set([
    LVL_25_CONFIG.customId,
    LVL_50_CONFIG.customId,
    CHARACTER_ROLES_CONFIG.customId,
]);
const REMOVE_ALL_BUTTON_ID = "remove_all_cosmetic_roles";
// --- END: Role Picker Configurations ---

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

// Helper function createSelectMenu (from menu-data.json)
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

// Helper function createButton (from menu-data.json)
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

// --- START: Role Picker Helper Functions ---
/**
 * Checks if a member meets the role requirements for a config.
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
 * This function now ALWAYS builds the menu with options and a default placeholder.
 * It does NOT check permissions.
 */
async function createRoleMenu(guild, config) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(config.customId)
        .setMinValues(1)
        .setMaxValues(1);

    const placeholder = `Select a ${config.title}`; // Default placeholder
    menu.setPlaceholder(placeholder);

    const roles = await getRolesInConfig(guild, config);
    let hasOptions = false;

    if (roles.size === 0) {
        // No roles found, return a disabled menu
        menu.setPlaceholder(
            `No roles available for ${config.title}.`
        ).setDisabled(true);
        return { menu, placeholder, hasOptions: false };
    }

    // Build options
    const options = Array.from(roles.values())
        .sort((a, b) => a.name.localeCompare(b.name)) // Sort roles alphabetically
        .map((role) => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(role.name)
                .setValue(role.id);
        });

    if (options.length > 25) {
        options.length = 25; // Truncate
    }

    if (options.length > 0) {
        menu.addOptions(options);
        hasOptions = true;
    } else {
        menu.setPlaceholder(
            `No roles available for ${config.title}.`
        ).setDisabled(true);
        return { menu, placeholder, hasOptions: false };
    }

    // Menu is ALWAYS enabled by default, per your design.
    menu.setDisabled(false);

    return { menu, placeholder, hasOptions };
}
// --- END: Role Picker Helper Functions ---

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

                // --- NEW: Handle /roles command logic ---
                if (interaction.commandName === "roles") {
                    await interaction.guild.roles.fetch();
                    const actionRows = [];

                    // --- FIX: Create menus with all options, enabled by default ---
                    for (const config of ALL_ROLE_CONFIGS) {
                        // We don't pass the member, so perms aren't checked here
                        const { menu, hasOptions } = await createRoleMenu(
                            interaction.guild,
                            config
                        );
                        if (hasOptions) {
                            // Only add menu if roles were found
                            actionRows.push(
                                new ActionRowBuilder().addComponents(menu)
                            );
                        } else {
                            console.log(
                                `[RolePicker] No roles found for ${config.title}, not adding menu.`
                            );
                        }
                    }

                    if (actionRows.length === 0) {
                        return interaction.reply({
                            content:
                                "There are no role-picker roles configured for this server.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    // Add the button
                    const removeButton = new ButtonBuilder()
                        .setCustomId(REMOVE_ALL_BUTTON_ID)
                        .setLabel("Remove All Cosmetic Roles")
                        .setStyle(ButtonStyle.Danger);
                    actionRows.push(
                        new ActionRowBuilder().addComponents(removeButton)
                    );

                    // --- FIX: Send public message & ephemeral confirmation ---
                    await interaction.channel.send({
                        content:
                            "# Gradient Roles\nSelect a role from the options below",
                        components: actionRows,
                    });

                    return interaction.reply({
                        content: "Role menu sent!",
                        flags: MessageFlags.Ephemeral,
                    });
                }
                // --- END: /roles logic ---

                await command.execute(interaction);
            }
            // Handle button interactions
            else if (interaction.isButton()) {
                const customId = interaction.customId;
                console.log(`Processing button: ${customId}`);

                // --- NEW: Handle "Remove All" button logic ---
                if (customId === REMOVE_ALL_BUTTON_ID) {
                    await interaction.deferReply({
                        flags: MessageFlags.Ephemeral,
                    }); // Ephemeral reply
                    const member = interaction.member;
                    const allRolesToRemove = [];
                    let rolesFoundCount = 0;

                    for (const config of ALL_ROLE_CONFIGS) {
                        const categoryRoles = await getRolesInConfig(
                            interaction.guild,
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
                        return interaction.editReply({
                            content:
                                "You do not have any roles from these categories to remove.",
                        });
                    }

                    await member.roles.remove(allRolesToRemove);
                    return interaction.editReply({
                        content: `Removed ${rolesFoundCount} cosmetic role(s).`,
                    });
                }
                // --- END: "Remove All" logic ---

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

                // --- NEW: Handle Role Picker Menus ---
                if (ALL_ROLE_PICKER_IDS.has(customId)) {
                    // --- FIX: Defer update, then send ephemeral follow-up ---
                    await interaction.deferUpdate(); // This resets the placeholder

                    const config = ALL_ROLE_CONFIGS.find(
                        (c) => c.customId === customId
                    );
                    if (!config) return; // Should not happen

                    const member = interaction.member;

                    // --- FIX: Safeguard permission check ---
                    // This is the check for the *interacting user*
                    if (!isMemberAuthorized(member, config)) {
                        return interaction.followUp({
                            // Use followUp
                            content: `You do not have the required roles to select from the "${config.title}" category.`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    const newRole = await interaction.guild.roles.fetch(
                        selectedValue
                    );
                    const categoryRoles = await getRolesInConfig(
                        interaction.guild,
                        config
                    );
                    const currentRole = member.roles.cache.find((r) =>
                        categoryRoles.has(r.id)
                    );

                    let removedRoleMsg = "";

                    if (currentRole) {
                        if (currentRole.id === newRole.id) {
                            return interaction.followUp({
                                // Use followUp
                                content: `You already have the ${currentRole.toString()} role.`,
                                flags: MessageFlags.Ephemeral,
                            });
                        }
                        await member.roles.remove(currentRole);
                        removedRoleMsg = `\nRemoved: ${currentRole.toString()}`;
                    }

                    await member.roles.add(newRole);

                    // Send the ephemeral follow-up
                    return interaction.followUp({
                        // Use followUp
                        content: `Added: ${newRole.toString()}${removedRoleMsg}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
                // --- END: Role Picker Logic ---

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
                            `Unhandled interaction type: ${handler.type}`
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
