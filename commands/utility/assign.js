const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require("discord.js");

// Configuration for Roles
const ROLES = {
    ARTIST: {
        id: "846788337711972402",
        name: "Artist",
    },
    CONTENT_CREATOR: {
        id: "844531446269214740",
        name: "Content Creator",
    },
};

const STAFF_ROLE_ID = "842763148985368617";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("assign")
        .setDescription("Assigns roles to members")
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
                    { name: "Artist", value: "ARTIST" },
                    { name: "Content Creator", value: "CONTENT_CREATOR" }
                )
        )
        .addBooleanOption((option) =>
            option
                .setName("remove")
                .setDescription("Select True to remove this role instead")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles), // Basic permission check

    async execute(interaction) {
        // 1. Check for Staff Role
        if (
            !interaction.member.roles.cache.has(STAFF_ROLE_ID) &&
            !interaction.member.permissions.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            return interaction.reply({
                content:
                    "You do not have the required Staff role to use this command.",
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 2. Get Options
            const targetUser = interaction.options.getUser("user");
            const roleKey = interaction.options.getString("role");
            const isRemove = interaction.options.getBoolean("remove") || false;

            // 3. Fetch Member and Role
            const member = await interaction.guild.members
                .fetch(targetUser.id)
                .catch(() => null);
            if (!member) {
                return interaction.editReply({
                    content: "User not found in this server.",
                });
            }

            const roleConfig = ROLES[roleKey];
            const role = await interaction.guild.roles.fetch(roleConfig.id);

            if (!role) {
                return interaction.editReply({
                    content: `Error: The ${roleConfig.name} role (ID: ${roleConfig.id}) was not found in this server.`,
                });
            }

            // 4. Add or Remove Logic
            if (isRemove) {
                // Remove Role
                if (!member.roles.cache.has(role.id)) {
                    return interaction.editReply({
                        content: `${targetUser} does not have the **${role.name}** role.`,
                    });
                }
                await member.roles.remove(role);
                return interaction.editReply({
                    content: `✅ Successfully removed the **${role.name}** role from ${targetUser}.`,
                });
            } else {
                // Add Role
                if (member.roles.cache.has(role.id)) {
                    return interaction.editReply({
                        content: `${targetUser} already has the **${role.name}** role.`,
                    });
                }
                await member.roles.add(role);
                return interaction.editReply({
                    content: `✅ Successfully assigned the **${role.name}** role to ${targetUser}.`,
                });
            }
        } catch (error) {
            console.error("Error in assign command:", error);
            await interaction.editReply({
                content: `An error occurred: ${error.message}`,
            });
        }
    },
};
