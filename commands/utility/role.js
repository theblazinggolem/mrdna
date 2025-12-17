const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require("discord.js");

const STAFF_ROLE_ID = "842763148985368617";
const LOG_CHANNEL_ID = "1350108952041492561";

const ASSIGNABLE_ROLES = [
    { name: "Artist", id: "846788337711972402" },
    { name: "Content Creator", id: "844531446269214740" },
];

const REVOKE_CONFIGS = {
    custom: {
        minRoleId: "1424000379712045237",
        maxRoleId: "1424000711183826995",
        requiredRoleIds: ["855954434935619584"], // Booster role
        title: "Custom Roles (Booster Perk)",
        unauthorizedReason: "User is not a server booster.",
    },
    lvl25: {
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
    },
    lvl50: {
        minRoleId: "1424016868091363444",
        maxRoleId: "1424016949288898731",
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
        title: "Lvl 50+ Gradient Roles",
        unauthorizedReason: "User does not meet Lvl 50+ requirements.",
    },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Manage specific roles in the server.")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("assign")
                .setDescription(
                    "Assigns or removes special roles (Staff Only)."
                )
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The member to manage")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role to assign or remove")
                        .setRequired(true)
                        .addChoices(
                            ...ASSIGNABLE_ROLES.map((r) => ({
                                name: r.name,
                                value: r.name,
                            }))
                        )
                )
                .addBooleanOption((option) =>
                    option
                        .setName("remove")
                        .setDescription(
                            "Select True to remove this role instead of adding it"
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("revoke")
                .setDescription(
                    "Revokes gradient/custom roles from unauthorized users."
                )
                .addStringOption((option) =>
                    option
                        .setName("category")
                        .setDescription("The category of roles to check")
                        .setRequired(true)
                        .addChoices(
                            { name: "Custom Roles (Booster)", value: "custom" },
                            { name: "Lvl 25+ Gradient", value: "lvl25" },
                            { name: "Lvl 50+ Gradient", value: "lvl50" }
                        )
                )
                .addStringOption((option) =>
                    option
                        .setName("action")
                        .setDescription("Action to take (Default: List)")
                        .setRequired(false)
                        .addChoices(
                            { name: "List Users", value: "list" },
                            { name: "Execute Revoke", value: "execute" }
                        )
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "assign") {
            await handleAssign(interaction);
        } else if (subcommand === "revoke") {
            await handleRevoke(interaction);
        }
    },
};

async function handleAssign(interaction) {
    if (
        !interaction.member.roles.cache.has(STAFF_ROLE_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
        return interaction.reply({
            content:
                "You do not have the required Staff role to use this command.",
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const targetUser = interaction.options.getUser("user");
        const roleNameValue = interaction.options.getString("role");
        const isRemove = interaction.options.getBoolean("remove") || false;

        const roleConfig = ASSIGNABLE_ROLES.find(
            (r) => r.name === roleNameValue
        );

        if (!roleConfig) {
            return interaction.editReply({
                content: "Invalid role selected.",
            });
        }

        const member = await interaction.guild.members
            .fetch(targetUser.id)
            .catch(() => null);
        if (!member) {
            return interaction.editReply({
                content: "User not found in this server.",
            });
        }

        const role = await interaction.guild.roles.fetch(roleConfig.id);
        if (!role) {
            return interaction.editReply({
                content: `Error: The **${roleConfig.name}** role (ID: ${roleConfig.id}) was not found in this server.`,
            });
        }

        if (isRemove) {
            if (!member.roles.cache.has(role.id)) {
                return interaction.editReply({
                    content: `${targetUser} does not have the **${role.name}** role.`,
                });
            }
            await member.roles.remove(role);
            await interaction.editReply({
                content: `✅ Successfully removed the **${role.name}** role from ${targetUser}.`,
            });
            await sendLogMessage(interaction, "removed", role.name, targetUser);
        } else {
            if (member.roles.cache.has(role.id)) {
                return interaction.editReply({
                    content: `${targetUser} already has the **${role.name}** role.`,
                });
            }
            await member.roles.add(role);
            await interaction.editReply({
                content: `✅ Successfully assigned the **${role.name}** role to ${targetUser}.`,
            });
            await sendLogMessage(
                interaction,
                "assigned",
                role.name,
                targetUser
            );
        }
    } catch (error) {
        console.error("Error in assign logic:", error);
        await interaction.editReply({
            content: `An error occurred: ${error.message}`,
        });
    }
}

async function handleRevoke(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
            content:
                'You need the "Manage Roles" permission to use this command.',
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const categoryKey = interaction.options.getString("category");
        const action = interaction.options.getString("action") || "list"; // Default to list
        const shouldExecute = action === "execute";

        const config = REVOKE_CONFIGS[categoryKey];
        if (!config) {
            return interaction.editReply({
                content: "Invalid category configuration.",
            });
        }

        // Fetch all members to ensure caches are up to date
        await interaction.guild.members.fetch();

        const minRole = await interaction.guild.roles.fetch(config.minRoleId);
        const maxRole = await interaction.guild.roles.fetch(config.maxRoleId);

        if (!minRole || !maxRole) {
            return interaction.editReply({
                content: "One of the boundary roles could not be found.",
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
            return interaction.editReply({
                content:
                    "No roles were found between the specified boundaries.",
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
                response +=
                    "Run with `action: Execute Revoke` to remove these roles.";
            }
        } else {
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

        if (response.length > 2000) {
            await interaction.editReply({
                content: response.substring(0, 1997) + "...",
            });
        } else {
            await interaction.editReply({
                content: response,
            });
        }
    } catch (error) {
        console.error("Error in revoke logic:", error);
        await interaction.editReply({
            content: `An error occurred: ${error.message}`,
        });
    }
}

-async function sendLogMessage(interaction, action, roleName, targetUser) {
    try {
        const logChannel = await interaction.guild.channels.fetch(
            LOG_CHANNEL_ID
        );
        if (!logChannel || !logChannel.isTextBased()) {
            console.error(`Log channel ${LOG_CHANNEL_ID} not found.`);
            return;
        }

        const preposition = action === "assigned" ? "to" : "from";
        const logContent = `**${
            interaction.user.username
        }** ${action} **${roleName}** ${preposition} ${targetUser.toString()}`;

        await logChannel.send(logContent);
    } catch (error) {
        console.error("Failed to send log message:", error);
    }
};
