const { SlashCommandBuilder, MessageFlags } = require("discord.js");

// The booster role ID that's required to use this command
const BOOSTER_ROLE_ID = "855954434935619584";

// The two roles that define the boundaries of the custom role category.
// The command will work correctly regardless of which ID is higher or lower.
const BOUNDARY_ONE_ID = "1424000379712045237";
const BOUNDARY_TWO_ID = "1424000711183826995";

// The channel ID for logging role changes
const LOG_CHANNEL_ID = "1350108952041492561";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("custom-role")
        .setDescription(
            "Booster commands to create or edit a personal custom role."
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Create a new custom role")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("The name for your new custom role.")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("color")
                        .setDescription(
                            "A hex color for your role (e.g., #FF5733). Optional."
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("edit")
                .setDescription("Edit your existing custom role")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("The new name for your custom role.")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("color")
                        .setDescription(
                            "The new hex color for your role (e.g., #FF5733)."
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has(BOOSTER_ROLE_ID)) {
            return interaction.reply({
                content:
                    "This command is a special perk for server boosters. Please boost the server to use it!",
                flags: MessageFlags.Ephemeral,
            });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const subcommand = interaction.options.getSubcommand();
            const member = interaction.member;

            // Find role boundaries and user's existing custom role (common logic)
            const { existingUserRole, upperPosition } =
                await findUserCustomRole(interaction);

            if (subcommand === "create") {
                await handleCreate(
                    interaction,
                    member,
                    existingUserRole,
                    upperPosition
                );
            } else if (subcommand === "edit") {
                await handleEdit(interaction, member, existingUserRole);
            }
        } catch (error) {
            console.error("Error in custom-role command:", error);
            const errorMessage = `An error occurred: ${error.message}. If this persists, please contact an admin.`;
            await interaction.followUp({
                content: errorMessage,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

/**
 * Handles the logic for the `/custom-role create` subcommand.
 */
async function handleCreate(
    interaction,
    member,
    existingUserRole,
    upperPosition
) {
    if (existingUserRole) {
        return interaction.followUp({
            content: `You already have a custom role (<@&${existingUserRole.id}>). Use \`/custom-role edit\` to modify it.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const roleName = interaction.options.getString("name");
    const roleColor = validateColor(interaction.options.getString("color"));

    if (roleColor === false) {
        return interaction.followUp({
            content:
                "The color you provided is not a valid hex code. Please use a format like `#FF5733` or `FF5733`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const newRole = await interaction.guild.roles.create({
        name: roleName,
        color: roleColor,
        permissions: [],
        // Correctly position the new role just below the upper boundary role
        position: upperPosition - 1,
        reason: `Custom role created for booster ${interaction.user.tag}`,
    });

    await member.roles.add(newRole.id);

    await interaction.followUp({
        content: `✅ Your new custom role <@&${newRole.id}> has been created and assigned to you!`,
        flags: MessageFlags.Ephemeral,
    });

    await sendLogMessage(interaction, "created", newRole, member);
}

/**
 * Handles the logic for the `/custom-role edit` subcommand.
 */
async function handleEdit(interaction, member, existingUserRole) {
    if (!existingUserRole) {
        return interaction.followUp({
            content:
                "You do not have a custom role to edit. Use `/custom-role create` to make one first.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const roleName = interaction.options.getString("name");
    const roleColor = validateColor(interaction.options.getString("color"));

    if (roleColor === false) {
        return interaction.followUp({
            content:
                "The color you provided is not a valid hex code. Please use a format like `#FF5733` or `FF5733`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    if (!roleName && !roleColor) {
        return interaction.followUp({
            content:
                "You must provide a new name, a new color, or both to edit your role.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const updatedRole = await existingUserRole.edit({
        name: roleName || existingUserRole.name,
        color: roleColor || existingUserRole.color,
        reason: `Custom role updated for booster ${interaction.user.tag}`,
    });

    await interaction.followUp({
        content: `✅ Your custom role <@&${updatedRole.id}> has been successfully updated!`,
        flags: MessageFlags.Ephemeral,
    });

    await sendLogMessage(interaction, "edited", updatedRole, member);
}

/**
 * Finds the boundaries for custom roles and checks if the user already has one.
 */
async function findUserCustomRole(interaction) {
    const boundaryOneRole = await interaction.guild.roles.fetch(
        BOUNDARY_ONE_ID
    );
    const boundaryTwoRole = await interaction.guild.roles.fetch(
        BOUNDARY_TWO_ID
    );

    if (!boundaryOneRole || !boundaryTwoRole) {
        throw new Error("Custom role boundaries are not configured correctly.");
    }

    const lowerPosition = Math.min(
        boundaryOneRole.position,
        boundaryTwoRole.position
    );
    const upperPosition = Math.max(
        boundaryOneRole.position,
        boundaryTwoRole.position
    );

    const customRolesInCategory = interaction.guild.roles.cache.filter(
        (role) => role.position > lowerPosition && role.position < upperPosition
    );

    const existingUserRole =
        interaction.member.roles.cache.find((role) =>
            customRolesInCategory.has(role.id)
        ) || null;

    return { existingUserRole, upperPosition };
}

/**
 * Validates and formats a hex color string.
 */
function validateColor(color) {
    if (!color) return null;
    if (!color.startsWith("#")) {
        color = `#${color}`;
    }
    const hexColorRegex = /^#([0-9A-F]{3}){1,2}$/i;
    return hexColorRegex.test(color) ? color : false;
}

/**
 * Sends a formatted log message to the designated log channel.
 */
async function sendLogMessage(interaction, action, role, member) {
    try {
        const logChannel = await interaction.guild.channels.fetch(
            LOG_CHANNEL_ID
        );
        if (!logChannel || !logChannel.isTextBased()) {
            console.error(
                `Log channel with ID ${LOG_CHANNEL_ID} not found or is not a text channel.`
            );
            return;
        }

        const logMessage = `Booster ${member.toString()} has ${action} custom role ${role.toString()}`;

        await logChannel.send(logMessage);
    } catch (error) {
        console.error("Failed to send log message:", error);
    }
}
