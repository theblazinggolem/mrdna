const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const BOOSTER_ROLE_ID = "855954434935619584";

const BOUNDARY_ONE_ID = "1424000379712045237";
const BOUNDARY_TWO_ID = "1424016949288898731";

const LOG_CHANNEL_ID = "1207983772398526504";

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
                        .setName("primary_color")
                        .setDescription("A hex code for your role")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("emoji")
                        .setDescription("A server emoji to use as your role icon.")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("secondary_color")
                        .setDescription(
                            "Request a Gradient (Mods must apply this manually)."
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
                        .setName("primary_color")
                        .setDescription("The new hex code for your role.")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("emoji")
                        .setDescription("A server emoji to use as your role icon.")
                        .setRequired(false)
                )
                .addStringOption((option) =>
                    option
                        .setName("secondary_color")
                        .setDescription(
                            "Request a Gradient (Mods must apply this manually)."
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

            // Find role boundaries and user's existing custom role
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
    const roleColor = validateColor(
        interaction.options.getString("primary_color")
    );
    const specialRequest = interaction.options.getString("secondary_color");
    const emojiString = interaction.options.getString("emoji");

    if (interaction.options.getString("primary_color") && roleColor === false) {
        return interaction.followUp({
            content:
                "The color you provided is not a valid hex code. Please use a format like `#FF5733` or `FF5733`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    let roleIconUrl = null;
    let unicodeEmoji = null;

    if (emojiString) {
        const customEmojiMatch = emojiString.match(/<a?:.+:(\d+)>/);
        if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const emoji = interaction.guild.emojis.cache.get(emojiId);
            if (emoji) {
                roleIconUrl = emoji.url;
            } else {
                return interaction.followUp({
                    content: "Could not find that custom emoji in this server.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        } else {
            unicodeEmoji = emojiString;
        }
    }

    const newRole = await interaction.guild.roles.create({
        name: roleName,
        color: roleColor || null,
        permissions: [],
        position: upperPosition - 1,
        reason: `Custom role created for booster ${interaction.user.tag}`,
    });

    await member.roles.add(newRole.id);

    let replyMsg = `Your new custom role <@&${newRole.id}> has been created and assigned to you!`;

    if (roleIconUrl) {
        try {
            await newRole.setIcon(roleIconUrl);
            replyMsg += "\n\n**Role Icon:** Icon set to the selected custom emoji.";
        } catch (error) {
            console.error("Failed to set role icon:", error);
            replyMsg += "\n\n**Warning:** Failed to set role icon. This usually happens if the server is not boosted to Level 2.";
        }
    } else if (unicodeEmoji) {
        try {
            await newRole.setUnicodeEmoji(unicodeEmoji);
            replyMsg += `\n\n**Role Icon:** Icon set to ${unicodeEmoji}.`;
        } catch (error) {
            console.error("Failed to set unicode emoji:", error);
            replyMsg += "\n\n**Warning:** Failed to set role icon. This usually happens if the server is not boosted to Level 2.";
        }
    }

    if (specialRequest) {
        await sendModRequest(
            interaction,
            member,
            newRole,
            specialRequest,
            "Create"
        );
        replyMsg += `\n\n**Request Sent:** Your request for "${specialRequest}" has been sent to the staff. They will update your role shortly.`;
    }

    await interaction.followUp({
        content: replyMsg,
        flags: MessageFlags.Ephemeral,
    });

    await sendLogMessage(interaction, "created", newRole, member, emojiString);
}

async function handleEdit(interaction, member, existingUserRole) {
    if (!existingUserRole) {
        return interaction.followUp({
            content:
                "You do not have a custom role to edit. Use </custom-role create:1439114388492779624> to make one first.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const roleName = interaction.options.getString("name");

    const rawPrimaryColor = interaction.options.getString("primary_color");
    const validPrimaryColor = validateColor(rawPrimaryColor);

    const secondaryColorRequest =
        interaction.options.getString("secondary_color");
    const emojiString = interaction.options.getString("emoji");

    if (rawPrimaryColor && validPrimaryColor === false) {
        return interaction.followUp({
            content:
                "The color you provided is not a valid hex code. Please use a format like `#FF5733` or `FF5733`.",
            flags: MessageFlags.Ephemeral,
        });
    }

    let roleIconUrl = null;
    let unicodeEmoji = null;

    if (emojiString) {
        const customEmojiMatch = emojiString.match(/<a?:.+:(\d+)>/);
        if (customEmojiMatch) {
            const emojiId = customEmojiMatch[1];
            const emoji = interaction.guild.emojis.cache.get(emojiId);
            if (emoji) {
                roleIconUrl = emoji.url;
            } else {
                return interaction.followUp({
                    content: "Could not find that custom emoji in this server.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        } else {
            unicodeEmoji = emojiString;
        }
    }

    if (!roleName && !rawPrimaryColor && !secondaryColorRequest && !emojiString) {
        return interaction.followUp({
            content:
                "You must provide a new name, a new color, a new emoji, or a special request to edit your role.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const updatedRole = await existingUserRole.edit({
        name: roleName || existingUserRole.name,
        color: validPrimaryColor || existingUserRole.color,
        reason: `Custom role updated for booster ${interaction.user.tag}`,
    });

    let replyMsg = `Your custom role <@&${updatedRole.id}> has been successfully updated!`;

    if (roleIconUrl) {
        try {
            await updatedRole.setIcon(roleIconUrl);
            replyMsg += "\n\n**Role Icon:** Icon updated to the selected custom emoji.";
        } catch (error) {
            console.error("Failed to set role icon:", error);
            replyMsg += "\n\n**Warning:** Failed to set role icon. This usually happens if the server is not boosted to Level 2.";
        }
    } else if (unicodeEmoji) {
        try {
            await updatedRole.setUnicodeEmoji(unicodeEmoji);
            replyMsg += `\n\n**Role Icon:** Icon updated to ${unicodeEmoji}.`;
        } catch (error) {
            console.error("Failed to set unicode emoji:", error);
            replyMsg += "\n\n**Warning:** Failed to set role icon. This usually happens if the server is not boosted to Level 2.";
        }
    }

    if (secondaryColorRequest) {
        await sendModRequest(
            interaction,
            member,
            updatedRole,
            secondaryColorRequest,
            "Edit"
        );
        replyMsg += `\n\n**Request Sent:** Your request for secondary color "${secondaryColorRequest}" has been sent to the staff.`;
    }

    await interaction.followUp({
        content: replyMsg,
        flags: MessageFlags.Ephemeral,
    });

    await sendLogMessage(interaction, "edited", updatedRole, member, emojiString);
}
async function sendModRequest(interaction, member, role, requestText, type) {
    try {
        const logChannel = await interaction.guild.channels.fetch(
            LOG_CHANNEL_ID
        );
        if (!logChannel || !logChannel.isTextBased()) return;

        const modAlert = [
            `**Custom Gradient Role Request** (${type})`,
            `**User:** ${member.toString()}`,
            `**Role:** ${role.toString()} (ID: \`${role.id}\`)`,
            `**Secondary Color:** ${requestText}`,
        ].join("\n");

        await logChannel.send(modAlert);
    } catch (error) {
        console.error("Failed to send mod request log:", error);
    }
}

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

function validateColor(color) {
    if (!color) return null;
    if (!color.startsWith("#")) {
        color = `#${color}`;
    }
    const hexColorRegex = /^#([0-9A-F]{3}){1,2}$/i;
    return hexColorRegex.test(color) ? color : false;
}

async function sendLogMessage(interaction, action, role, member, emojiString) {
    try {
        const logChannel = await interaction.guild.channels.fetch(
            LOG_CHANNEL_ID
        );
        if (!logChannel || !logChannel.isTextBased()) return;

        let logMessage = `Booster ${member.toString()} has ${action} custom role ${role.toString()}`;
        if (emojiString) {
            logMessage += ` with emoji ${emojiString} as icon`;
        }
        await logChannel.send(logMessage);
    } catch (error) {
        console.error("Failed to send log message:", error);
    }
}
