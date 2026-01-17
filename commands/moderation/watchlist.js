const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");

const LOG_CHANNEL_ID = "1350108952041492561";
const MOD_ROLE_ID = "857990235194261514";

const WATCHLIST_ROLE_ID = "1396464270077591583";
const BANNED_FROM_GENERAL_ROLE_ID = "1421914360254562544";

const EXCLUDED_CHANNELS = [
    "842747868960129025",
    "1036666039452311592",
    "915890444922155008",
];
const TARGET_CATEGORIES = ["1260957720731979857", "842746033213669388"];
const DURATION_OPTIONS = {
    "15m": 15 * 60 * 1000,
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
};
const muteTimeouts = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName("watchlist")
        .setDescription("Moderation tools for watchlist and channel access.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) =>
            sub
                .setName("mute")
                .setDescription(
                    "Mute the watchlist role in this channel or globally."
                )
                .addStringOption((opt) =>
                    opt
                        .setName("duration")
                        .setDescription("How long to mute the role for.")
                        .setRequired(true)
                        .addChoices(
                            { name: "15 minutes", value: "15m" },
                            { name: "30 minutes", value: "30m" },
                            { name: "1 hour", value: "1h" }
                        )
                )
                .addBooleanOption((opt) =>
                    opt
                        .setName("global")
                        .setDescription("Mute in all applicable channels.")
                )
                .addStringOption((opt) =>
                    opt.setName("reason").setDescription("Reason for the mute.")
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("add")
                .setDescription("Add the watchlist role to a user.")
                .addUserOption((opt) =>
                    opt
                        .setName("user")
                        .setDescription("User to add to the watchlist.")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("reason")
                        .setDescription("Reason for adding the user.")
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("remove")
                .setDescription("Remove the watchlist role from a user.")
                .addUserOption((opt) =>
                    opt
                        .setName("user")
                        .setDescription("User to remove from the watchlist.")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("reason")
                        .setDescription("Reason for removing the user.")
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("ban-from-general")
                .setDescription("Ban a user from general channels.")
                .addUserOption((opt) =>
                    opt
                        .setName("user")
                        .setDescription("User to ban from general.")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt.setName("reason").setDescription("Reason for the ban.")
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("unban-from-general")
                .setDescription("Unban a user from general channels.")
                .addUserOption((opt) =>
                    opt
                        .setName("user")
                        .setDescription("User to unban from general.")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("reason")
                        .setDescription("Reason for the unban.")
                )
        ),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.Administrator
            ) &&
            !interaction.member.roles.cache.has(MOD_ROLE_ID)
        ) {
            return interaction.editReply({
                content: "You do not have permission to use this command.",
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const reason = interaction.options.getString("reason");
        const targetUser = interaction.options.getUser("user");

        try {
            if (subcommand === "add" || subcommand === "remove") {
                const member = await interaction.guild.members.fetch(
                    targetUser.id
                );
                if (!member)
                    return interaction.editReply({
                        content: "User not found in this server.",
                    });
                const role = await interaction.guild.roles.fetch(
                    WATCHLIST_ROLE_ID
                );
                if (!role)
                    return interaction.editReply({
                        content: `Watchlist Role not found!`,
                    });

                if (subcommand === "add") {
                    if (member.roles.cache.has(role.id))
                        return interaction.editReply({
                            content: `${targetUser} already has the role.`,
                        });
                    await member.roles.add(role);
                    await interaction.editReply({
                        content: `Added ${role} to ${targetUser}.`,
                    });
                    await sendLogMessage(
                        interaction,
                        `**${interaction.user.username}** added ${role} to ${targetUser}`,
                        reason
                    );
                } else {
                    // remove
                    if (!member.roles.cache.has(role.id))
                        return interaction.editReply({
                            content: `${targetUser} does not have the role.`,
                        });
                    await member.roles.remove(role);
                    await interaction.editReply({
                        content: `Removed ${role} from ${targetUser}.`,
                    });
                    await sendLogMessage(
                        interaction,
                        `**${interaction.user.username}** removed ${role} from ${targetUser}`,
                        reason
                    );
                }
            } else if (subcommand === "ban-from-general") {
                const member = await interaction.guild.members.fetch(
                    targetUser.id
                );
                if (!member)
                    return interaction.editReply({
                        content: "User not found in this server.",
                    });
                const role = await interaction.guild.roles.fetch(
                    BANNED_FROM_GENERAL_ROLE_ID
                );
                if (!role)
                    return interaction.editReply({
                        content: `Ban from General role not found!`,
                    });

                if (member.roles.cache.has(role.id)) {
                    // Button logic removed - now it just sends a message
                    return interaction.editReply({
                        content: `${targetUser} already has the ban role. Use </watchlist unban-from-general:1396454760835711046> to remove it.`,
                    });
                } else {
                    await member.roles.add(role);
                    await interaction.editReply({
                        content: `Added ${role} to ${targetUser}.`,
                    });
                    await sendLogMessage(
                        interaction,
                        `**${interaction.user.username}** added ${role} to ${targetUser}`,
                        reason
                    );
                }
            } else if (subcommand === "unban-from-general") {
                const member = await interaction.guild.members.fetch(
                    targetUser.id
                );
                if (!member)
                    return interaction.editReply({
                        content: "User not found in this server.",
                    });
                const role = await interaction.guild.roles.fetch(
                    BANNED_FROM_GENERAL_ROLE_ID
                );
                if (!role)
                    return interaction.editReply({
                        content: `Ban from General role not found!`,
                    });

                if (!member.roles.cache.has(role.id)) {
                    return interaction.editReply({
                        content: `${targetUser} does not have the ban role.`,
                    });
                }

                await member.roles.remove(role);
                await interaction.editReply({
                    content: `Removed ${role} from ${targetUser}.`,
                });
                await sendLogMessage(
                    interaction,
                    `**${interaction.user.username}** unbanned ${targetUser} from general chats`,
                    reason
                );
            } else if (subcommand === "mute") {
                const global =
                    interaction.options.getBoolean("global") || false;
                const durationKey = interaction.options.getString("duration");
                const durationMs = DURATION_OPTIONS[durationKey];
                const role = await interaction.guild.roles.fetch(
                    WATCHLIST_ROLE_ID
                );
                if (!role)
                    return interaction.editReply({
                        content: `Watchlist role not found.`,
                    });

                if (global) {
                    await handleGlobalMute(
                        interaction,
                        role,
                        durationKey,
                        durationMs,
                        reason
                    );
                } else {
                    await handleChannelMute(
                        interaction,
                        role,
                        durationKey,
                        durationMs,
                        reason
                    );
                }
            }
        } catch (error) {
            console.error("Error in watchlist command:", error);
            await interaction.editReply({
                content: `An error occurred: ${error.message}`,
            });
        }
    },
};

async function handleChannelMute(
    interaction,
    role,
    durationKey,
    durationMs,
    reason
) {
    const channel = interaction.channel;
    const overwrite = channel.permissionOverwrites.cache.get(role.id);
    const isMuted =
        overwrite && overwrite.deny.has(PermissionFlagsBits.SendMessages);

    if (!isMuted) {
        await channel.permissionOverwrites.edit(role, { SendMessages: false });
        if (muteTimeouts.has(channel.id))
            clearTimeout(muteTimeouts.get(channel.id));
        muteTimeouts.set(
            channel.id,
            setTimeout(() => {
                channel.permissionOverwrites
                    .edit(role, { SendMessages: null })
                    .catch((e) => console.error("Failed to auto-unmute:", e));
                muteTimeouts.delete(channel.id);
            }, durationMs)
        );
        await interaction.editReply({
            content: `${role} has been muted in this channel for ${durationKey}.`,
        });
        await sendLogMessage(
            interaction,
            `**${interaction.user.username}** muted ${role} for ${durationKey} in ${channel}`,
            reason
        );
    } else {
        await channel.permissionOverwrites.edit(role, { SendMessages: null });
        if (muteTimeouts.has(channel.id)) {
            clearTimeout(muteTimeouts.get(channel.id));
            muteTimeouts.delete(channel.id);
        }
        await interaction.editReply({
            content: `${role} has been unmuted in this channel.`,
        });
        await sendLogMessage(
            interaction,
            `**${interaction.user.username}** unmuted ${role} in ${channel}`,
            reason
        );
    }
}

async function handleGlobalMute(
    interaction,
    role,
    durationKey,
    durationMs,
    reason
) {
    let mutedChannels = 0;
    for (const [, channel] of interaction.guild.channels.cache) {
        if (
            EXCLUDED_CHANNELS.includes(channel.id) ||
            !channel.isTextBased?.() ||
            !channel.viewable ||
            !channel.parentId ||
            !TARGET_CATEGORIES.includes(channel.parentId)
        ) {
            continue;
        }
        await channel.permissionOverwrites.edit(role, { SendMessages: false });
        mutedChannels++;
        if (muteTimeouts.has(channel.id))
            clearTimeout(muteTimeouts.get(channel.id));
        muteTimeouts.set(
            channel.id,
            setTimeout(() => {
                channel.permissionOverwrites
                    .edit(role, { SendMessages: null })
                    .catch((e) => console.error("Failed to auto-unmute:", e));
                muteTimeouts.delete(channel.id);
            }, durationMs)
        );
    }
    const msg = `Muted ${role} in ${mutedChannels} channels for ${durationKey}.`;
    await interaction.editReply({ content: msg });
    await sendLogMessage(
        interaction,
        `**${interaction.user.username}** muted ${role} for ${durationKey} globally`,
        reason
    );
}

/**
 * Sends a formatted log message to the designated log channel.
 */
async function sendLogMessage(interaction, action, reason) {
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
        let logMessage = `${action}`;
        if (reason) {
            logMessage += `\n**Reason:** ${reason}`;
        }
        await logChannel.send(logMessage);
    } catch (error) {
        console.error("Failed to send log message:", error);
    }
}
