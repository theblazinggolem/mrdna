const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require("discord.js");

const CUSTOM_ROLES_CONFIG = {
    minRoleId: "1424000379712045237",
    maxRoleId: "1424000711183826995",
    requiredRoleIds: ["855954434935619584"], // Booster role
    title: "Custom Roles (Booster Perk)",
    unauthorizedReason: "User is not a server booster.",
};

const LVL25_ROLES_CONFIG = {
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
    title: "Lvl 25+ Gradient Roles",
    unauthorizedReason: "User does not meet Lvl 25+ requirements.",
};

const LVL50_ROLES_CONFIG = {
    minRoleId: "1424016868091363444",
    maxRoleId: "1424016949288898731",
    requiredRoleIds: [
        // "843856166994968597", // lvl 25 role
        "843856481288060978", // lvl 50 role
        "843856587469750333", // lvl 75 role
        "843856716382208020", // lvl 100 role
        "843856730232324148", // lvl 200 role
        "842053547301273642", // vip pass role
        "855954434935619584", // booster role
        "857990235194261514", // staff
        "913864890916147270", // admins
    ],
    title: "Lvl 25+ Gradient Roles",
    unauthorizedReason: "User does not meet Lvl 25+ requirements.",
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("revoke")
        .setDescription("Commands for revoking roles.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("custom-roles")
                .setDescription("Manages custom roles for server boosters.")
                .addStringOption((option) =>
                    option
                        .setName("action")
                        .setDescription(
                            "Choose to list unauthorized users or execute role removal."
                        )
                        .setRequired(true)
                        .addChoices(
                            { name: "List", value: "list" },
                            { name: "Execute", value: "execute" }
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("lvl-25-gradient-roles")
                .setDescription(
                    "Manages Lvl 25+ gradient roles based on required roles."
                )
                .addStringOption((option) =>
                    option
                        .setName("action")
                        .setDescription(
                            "Choose to list unauthorized users or execute role removal."
                        )
                        .setRequired(true)
                        .addChoices(
                            { name: "List", value: "list" },
                            { name: "Execute", value: "execute" }
                        )
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("lvl-50-gradient-roles")
                .setDescription(
                    "Manages Lvl 50+ gradient roles based on required roles."
                )
                .addStringOption((option) =>
                    option
                        .setName("action")
                        .setDescription(
                            "Choose to list unauthorized users or execute role removal."
                        )
                        .setRequired(true)
                        .addChoices(
                            { name: "List", value: "list" },
                            { name: "Execute", value: "execute" }
                        )
                )
        ),

    async execute(interaction) {
        if (
            !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)
        ) {
            return interaction.reply({
                content:
                    'You need the "Manage Roles" permission to use this command.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "custom-roles") {
            await handleRoleRevocation(interaction, CUSTOM_ROLES_CONFIG);
        } else if (subcommand === "lvl-25-gradient-roles") {
            await handleRoleRevocation(interaction, LVL25_ROLES_CONFIG);
        } else if (subcommand === "lvl-50-gradient-roles") {
            await handleRoleRevocation(interaction, LVL50_ROLES_CONFIG);
        }
    },
};

/**
 * Generic handler for finding and revoking roles based on a set of rules.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
 * @param {object} config The configuration object for the specific subcommand.
 */
async function handleRoleRevocation(interaction, config) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const action = interaction.options.getString("action");
        const shouldExecute = action === "execute";

        // Fetch all members to ensure caches are up to date
        await interaction.guild.members.fetch();

        const minRole = await interaction.guild.roles.fetch(config.minRoleId);
        const maxRole = await interaction.guild.roles.fetch(config.maxRoleId);

        if (!minRole || !maxRole) {
            return interaction.followUp({
                content: "One of the boundary roles could not be found.",
                flags: MessageFlags.Ephemeral,
            });
        }

        // Ensure minRole position is less than maxRole position
        const lowerBound = Math.min(minRole.position, maxRole.position);
        const upperBound = Math.max(minRole.position, maxRole.position);

        // Filter for roles between the specified boundaries
        const targetRoles = interaction.guild.roles.cache.filter(
            (role) => role.position > lowerBound && role.position < upperBound
        );

        if (targetRoles.size === 0) {
            return interaction.followUp({
                content:
                    "No roles were found between the specified boundaries.",
                flags: MessageFlags.Ephemeral,
            });
        }

        // Find members who have target roles but lack ALL required roles
        const usersToProcess = new Map();
        interaction.guild.members.cache.forEach((member) => {
            // Member is authorized if they have at least ONE of the required roles
            const isAuthorized = config.requiredRoleIds.some((roleId) =>
                member.roles.cache.has(roleId)
            );

            if (!isAuthorized) {
                const rolesToRemove = member.roles.cache.filter((role) =>
                    targetRoles.has(role.id)
                );
                if (rolesToRemove.size > 0) {
                    usersToProcess.set(member.id, {
                        member,
                        roles: Array.from(rolesToRemove.values()),
                    });
                }
            }
        });

        let response = "";

        // --- LIST MODE ---
        if (!shouldExecute) {
            response = `# Unauthorized ${config.title} (List)\n\n`;
            if (usersToProcess.size === 0) {
                response += `✅ No unauthorized users found. No action needed.`;
            } else {
                response += `Found **${usersToProcess.size}** user(s) who are not authorized:\n\n`;
                usersToProcess.forEach(({ member, roles }) => {
                    response += `### <@${member.id}>\n`;
                    roles.forEach((role) => {
                        response += `- <@&${role.id}>\n`;
                    });
                    response += "\n";
                });
                response += "Run with `action: Execute` to remove these roles.";
            }
        }
        // --- EXECUTE MODE ---
        else {
            response = `# Unauthorized ${config.title} (Execute)\n\n`;
            if (usersToProcess.size === 0) {
                response += `✅ No unauthorized users found. No changes made.`;
            } else {
                let rolesRemovedCount = 0;
                let failedRemovalsCount = 0;

                for (const [
                    userId,
                    { member, roles },
                ] of usersToProcess.entries()) {
                    response += `### <@${userId}>\n`;
                    for (const role of roles) {
                        try {
                            await member.roles.remove(
                                role,
                                config.unauthorizedReason
                            );
                            response += `- ✅ Removed <@&${role.id}>\n`;
                            rolesRemovedCount++;
                        } catch (error) {
                            console.error(
                                `Failed to remove role ${role.name} from ${member.user.tag}:`,
                                error
                            );
                            response += `- ⚠️ Failed to remove <@&${role.id}>: ${error.message}\n`;
                            failedRemovalsCount++;
                        }
                    }
                    response += "\n";
                }
                response += `\n## Summary\n- Users processed: ${usersToProcess.size}\n- Roles removed: ${rolesRemovedCount}\n- Failed removals: ${failedRemovalsCount}`;
            }
        }

        // Send the response, handling Discord's character limit
        if (response.length > 2000) {
            await interaction.followUp({
                content: response.substring(0, 1997) + "...",
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.followUp({
                content: response,
                flags: MessageFlags.Ephemeral,
            });
        }
    } catch (error) {
        console.error(
            `Error executing /revoke ${interaction.options.getSubcommand()}:`,
            error
        );
        await interaction.followUp({
            content: `An error occurred: ${error.message}`,
            flags: MessageFlags.Ephemeral,
        });
    }
}
