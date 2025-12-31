const {
    Events,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require("discord.js");
const menuData = require("../data/menu-data.json");
const commandData = require("../data/command-data.json"); // Import this

const TRANSCRIPT_LOG_CHANNEL_ID = "915884828153511946";

// Config for Gradient Roles (Must match command file)
const ROLE_CATEGORIES = [
    {
        id: "lvl_25",
        label: "Level 25+ Gradients",
        minId: "1375397609908469800",
        maxId: "1375397935050919997",
        requiredRoles: [
            "843856166994968597",
            "843856481288060978",
            "843856587469750333",
            "843856716382208020",
            "843856730232324148",
            "842053547301273642",
            "855954434935619584",
            "857990235194261514",
            "913864890916147270",
        ],
    },
    {
        id: "lvl_50",
        label: "Level 50+ Gradients",
        minId: "1375397935050919997",
        maxId: "1424016868091363444",
        requiredRoles: [
            "843856481288060978",
            "843856587469750333",
            "843856716382208020",
            "843856730232324148",
            "842053547301273642",
            "855954434935619584",
            "857990235194261514",
            "913864890916147270",
        ],
    },
    {
        id: "char_roles",
        label: "Character Roles",
        minId: "1424016868091363444",
        maxId: "1424016949288898731",
        requiredRoles: [
            "843856481288060978",
            "843856587469750333",
            "843856716382208020",
            "843856730232324148",
            "842053547301273642",
            "855954434935619584",
            "857990235194261514",
            "913864890916147270",
        ],
    },
];

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // 1. SLASH COMMANDS
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(
                    interaction.commandName
                );
                if (!command) return;
                await command.execute(interaction);
                return;
            }

            // 2. BUTTONS
            if (interaction.isButton()) {
                const customId = interaction.customId;

                // --- A. Transcript Logging ---
                if (customId === "send_to_logs") {
                    // The file is attached to the message the button is on
                    const attachment = interaction.message.attachments.first();
                    if (!attachment) {
                        return interaction.reply({
                            content:
                                "Error: No transcript file found on this message.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }

                    // Send to Log Channel
                    const logChannel = await interaction.guild.channels.fetch(
                        TRANSCRIPT_LOG_CHANNEL_ID
                    );
                    if (logChannel) {
                        await logChannel.send({
                            content: `📄 **Transcript Generated**\n**Channel:** ${interaction.channel.toString()}\n**Sent By:** ${interaction.user.toString()}`,
                            files: [attachment],
                        });

                        // Disable the button
                        const disabledRow = ActionRowBuilder.from(
                            interaction.message.components[0]
                        );
                        disabledRow.components[0]
                            .setDisabled(true)
                            .setLabel("Sent to Logs")
                            .setStyle(ButtonStyle.Success);
                        await interaction.update({ components: [disabledRow] });
                    } else {
                        await interaction.reply({
                            content: "Log channel not found.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    return;
                }

                // --- B. Unequip All Cosmetics ---
                if (customId === "unequip_all") {
                    await interaction.deferReply({
                        flags: MessageFlags.Ephemeral,
                    });

                    // Identify all cosmetic IDs dynamically
                    let allCosmeticRoleIds = [];
                    await interaction.guild.roles.fetch();
                    for (const cat of ROLE_CATEGORIES) {
                        const minRole = interaction.guild.roles.cache.get(
                            cat.minId
                        );
                        const maxRole = interaction.guild.roles.cache.get(
                            cat.maxId
                        );
                        if (minRole && maxRole) {
                            interaction.guild.roles.cache.forEach((r) => {
                                if (
                                    r.position >
                                        Math.min(
                                            minRole.position,
                                            maxRole.position
                                        ) &&
                                    r.position <
                                        Math.max(
                                            minRole.position,
                                            maxRole.position
                                        )
                                ) {
                                    allCosmeticRoleIds.push(r.id);
                                }
                            });
                        }
                    }

                    const rolesToRemove = interaction.member.roles.cache.filter(
                        (r) => allCosmeticRoleIds.includes(r.id)
                    );
                    if (rolesToRemove.size > 0) {
                        await interaction.member.roles.remove(rolesToRemove);
                        await interaction.editReply({
                            content: `Removed ${rolesToRemove.size} cosmetic roles.`,
                        });
                    } else {
                        await interaction.editReply({
                            content:
                                "You don't have any cosmetic roles equipped.",
                        });
                    }
                    return;
                }

                // --- C. Legacy & Generic Buttons ---
                if (customId === "show-retired-staff") {
                    await handleRetiredStaff(interaction);
                    return;
                }

                // Check Data Handlers (Menu Data & Command Data)
                const handler = findInteractionHandler(customId);
                if (handler) {
                    await interaction.reply({
                        content: handler.content,
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }
            }

            // 3. SELECT MENUS
            else if (interaction.isStringSelectMenu()) {
                const customId = interaction.customId;
                const selectedValue = interaction.values[0];

                // --- D. Gradient Role Selection ---
                if (customId.startsWith("select_")) {
                    await handleGradientSelection(
                        interaction,
                        customId,
                        selectedValue
                    );
                    return;
                }

                if (selectedValue === "staff-info") {
                    await handleStaffInfo(interaction);
                    return;
                }

                // Generic Handler
                const handler = findInteractionHandler(customId, selectedValue);
                if (handler) {
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
                    return;
                }
            }
        } catch (error) {
            console.error(`Error in interactionCreate:`, error);
        }
    },
};

// --- HELPER FUNCTIONS ---

async function handleGradientSelection(interaction, customId, selectedValue) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const categoryId = customId.replace("select_", "");
    const cat = ROLE_CATEGORIES.find((c) => c.id === categoryId);

    if (!cat) return interaction.editReply("Unknown role category.");

    // Check Permissions
    const isAuthorized =
        cat.requiredRoles.length === 0 ||
        cat.requiredRoles.some((id) => interaction.member.roles.cache.has(id));
    if (!isAuthorized) {
        return interaction.editReply(
            `You do not have permission to select roles from **${cat.label}**.`
        );
    }

    const selectedRole = interaction.guild.roles.cache.get(selectedValue);

    // Calculate remove list (Stateless calculation)
    let allCosmeticRoleIds = [];
    for (const c of ROLE_CATEGORIES) {
        const min = interaction.guild.roles.cache.get(c.minId);
        const max = interaction.guild.roles.cache.get(c.maxId);
        if (min && max) {
            interaction.guild.roles.cache.forEach((r) => {
                if (
                    r.position > Math.min(min.position, max.position) &&
                    r.position < Math.max(min.position, max.position)
                ) {
                    allCosmeticRoleIds.push(r.id);
                }
            });
        }
    }

    // Swap Roles
    const currentCosmetics = interaction.member.roles.cache.filter((r) =>
        allCosmeticRoleIds.includes(r.id)
    );
    if (currentCosmetics.size > 0)
        await interaction.member.roles.remove(currentCosmetics);

    if (selectedRole) {
        await interaction.member.roles.add(selectedRole);
        await interaction.editReply(`Equipped **${selectedRole.name}**`);
    }
}

function findInteractionHandler(customId, value = null) {
    // 1. Check Menu Data
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
    // 2. Check Command Data (For Music/Command buttons)
    if (commandData && commandData.components) {
        for (const component of commandData.components) {
            if (
                component.type === "button" &&
                component.custom_id === customId
            ) {
                return component.onInteraction;
            }
        }
    }
    return null;
}

// ... (Existing Staff Functions Below - Copied from your original file) ...

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
            if (retired.size > 0)
                retired.forEach((m) => (content += `- ${m.toString()}\n`));
            else content += "- No members found.\n";
        } else content += "- Role not found.\n";
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error("Error in retired staff:", error);
    }
}

async function handleStaffInfo(interaction) {
    try {
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
