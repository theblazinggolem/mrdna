const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");

const ROLE_CATEGORIES = [
    {
        id: "lvl_25",
        label: "Level 25+ Gradients",
        minId: "1375397609908469800", // Bottom boundary
        maxId: "1375397935050919997", // Top boundary
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
    data: new SlashCommandBuilder()
        .setName("gradient-roles")
        .setDescription("Pick your cosmetic roles"),

    async execute(interaction) {
        const { guild, member } = interaction;

        let components = [];
        let allCosmeticRoleIds = [];

        await guild.roles.fetch();

        for (const cat of ROLE_CATEGORIES) {
            const minRole = guild.roles.cache.get(cat.minId);
            const maxRole = guild.roles.cache.get(cat.maxId);

            if (!minRole || !maxRole) continue;

            // Find roles physically between min and max
            const rolesInCat = guild.roles.cache.filter(
                (r) =>
                    r.position > Math.min(minRole.position, maxRole.position) &&
                    r.position < Math.max(minRole.position, maxRole.position) &&
                    r.name !== "@everyone"
            );

            // Add these to our master unequip list
            rolesInCat.forEach((r) => allCosmeticRoleIds.push(r.id));

            // Check authorization for THIS specific category
            const isAuthorized =
                cat.requiredRoles.length === 0 ||
                cat.requiredRoles.some((reqId) =>
                    member.roles.cache.has(reqId)
                );

            // Build the Select Menu if they are authorized and roles exist
            if (isAuthorized && rolesInCat.size > 0) {
                // Sort by position (descending usually looks better)
                const sortedRoles = rolesInCat.sort(
                    (a, b) => b.position - a.position
                );

                // Discord limits menus to 25 items
                const menuOptions = sortedRoles
                    .map((r) => ({
                        label: r.name,
                        value: r.id,
                    }))
                    .slice(0, 25);

                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`select_${cat.id}`)
                    .setPlaceholder(`Select: ${cat.label}`)
                    .addOptions(menuOptions);

                components.push(new ActionRowBuilder().addComponents(menu));
            }
        }

        // Add Unequip Button at the bottom
        const unequipBtn = new ButtonBuilder()
            .setCustomId("unequip_all")
            .setLabel("Unequip All Cosmetics")
            .setStyle(ButtonStyle.Danger);

        components.push(new ActionRowBuilder().addComponents(unequipBtn));

        // --- 2. SEND INITIAL MESSAGE (EPHEMERAL) ---
        const response = await interaction.reply({
            content: "Select a cosmetic role below:",
            components: components,
            ephemeral: true,
        });

        // --- 3. LOCAL COLLECTOR ---
        const collector = response.createMessageComponentCollector({
            time: 300000, // 5 Minutes
        });

        collector.on("collect", async (i) => {
            // Safety check
            if (i.user.id !== interaction.user.id) return;

            const targetMember = i.member;

            try {
                // === HANDLE UNEQUIP ===
                if (i.customId === "unequip_all") {
                    // Filter the user's CURRENT roles against our Master List
                    const rolesToRemove = targetMember.roles.cache.filter((r) =>
                        allCosmeticRoleIds.includes(r.id)
                    );

                    if (rolesToRemove.size > 0) {
                        await targetMember.roles.remove(rolesToRemove);
                        await i.reply({
                            content: `Removed ${rolesToRemove.size} cosmetic roles.`,
                            ephemeral: true,
                        });
                    } else {
                        await i.reply({
                            content:
                                "You don't have any cosmetic roles equipped.",
                            ephemeral: true,
                        });
                    }
                }

                // === HANDLE SELECTION ===
                else if (i.customId.startsWith("select_")) {
                    const selectedRoleId = i.values[0];
                    const selectedRole = guild.roles.cache.get(selectedRoleId);

                    // Logic: Remove ALL currently equipped cosmetic roles to ensure a clean swap
                    const currentCosmetics = targetMember.roles.cache.filter(
                        (r) => allCosmeticRoleIds.includes(r.id)
                    );

                    // Remove old ones
                    if (currentCosmetics.size > 0) {
                        await targetMember.roles.remove(currentCosmetics);
                    }

                    // Add new one
                    if (selectedRole) {
                        await targetMember.roles.add(selectedRole);
                        // Simple confirmation
                        await i.reply({
                            content: `Equipped **${selectedRole.name}**`,
                            ephemeral: true,
                        });
                    }
                }
            } catch (err) {
                console.error("Role Error:", err);
                if (!i.replied) {
                    await i.reply({
                        content:
                            "Error changing roles. My role might be too low in the list.",
                        ephemeral: true,
                    });
                }
            }
        });
    },
};
