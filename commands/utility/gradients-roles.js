const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

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
    data: new SlashCommandBuilder()
        .setName("gradient-roles")
        .setDescription("Pick your cosmetic roles"),

    async execute(interaction) {
        try {
            // 1. Defer Immediately (Fixes "Unknown Interaction" timeout)
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const { guild } = interaction;
            let components = [];

            await guild.roles.fetch();

            // 2. Build the menus
            for (const cat of ROLE_CATEGORIES) {
                const minRole = guild.roles.cache.get(cat.minId);
                const maxRole = guild.roles.cache.get(cat.maxId);

                if (!minRole || !maxRole) continue;

                const rolesInCat = guild.roles.cache.filter(
                    (r) =>
                        r.position > Math.min(minRole.position, maxRole.position) &&
                        r.position < Math.max(minRole.position, maxRole.position) &&
                        r.name !== "@everyone"
                );

                if (rolesInCat.size > 0) {
                    const sortedRoles = rolesInCat.sort(
                        (a, b) => b.position - a.position
                    );

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

            // 3. Add Unequip Button
            const unequipBtn = new ButtonBuilder()
                .setCustomId("unequip_all")
                .setLabel("Unequip All Cosmetics")
                .setStyle(ButtonStyle.Danger);

            components.push(new ActionRowBuilder().addComponents(unequipBtn));

            if (components.length === 0) {
                // Change reply to editReply
                return interaction.editReply({
                    content: "No cosmetic roles found in configuration.",
                });
            }

            // 4. Send Message (Change reply to editReply)
            await interaction.editReply({
                content: "Select a cosmetic role below:",
                components: components,
            });
        } catch (error) {
            console.error("Error in gradient-roles:", error);
            await interaction.editReply({
                content: "An error occurred while loading the roles. Please try again later.",
            });
        }
    },
};
