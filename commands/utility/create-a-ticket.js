const { SlashCommandBuilder, ChannelType, ActionRowBuilder, UserSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');

const CATEGORY_ID = '860078313631383552';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create-a-ticket')
        .setDescription('Creates a generic ticket channel')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('An initial user to add to the ticket')
                .setRequired(false)
        ),

    async execute(interaction) {
        const optionUser = interaction.options.getUser('user');

        if (optionUser) {
            // A user was mentioned
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const channel = await createTicketChannel(interaction, [optionUser.id]);

            if (channel) {
                await interaction.editReply(`Ticket channel created: ${channel}`);
            } else {
                await interaction.editReply('Failed to create ticket channel.');
            }
        } else {
            // No user mentioned -> Show user select menu
            const userSelect = new UserSelectMenuBuilder()
                .setCustomId('ticket_user_select')
                .setPlaceholder('Select users to add to the ticket')
                .setMinValues(1)
                .setMaxValues(10);

            const row = new ActionRowBuilder().addComponents(userSelect);

            const response = await interaction.reply({
                content: 'Please select the users to add to the ticket:',
                components: [row],
                flags: MessageFlags.Ephemeral
            });

            try {
                // Wait for the select menu interaction
                const confirmation = await response.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id && i.customId === 'ticket_user_select',
                    time: 60000, // 1 minute collector
                    componentType: ComponentType.UserSelect
                });

                await confirmation.update({
                    content: 'Creating ticket...',
                    components: []
                });

                const selectedUserIds = confirmation.values;
                const channel = await createTicketChannel(interaction, selectedUserIds);

                if (channel) {
                    await confirmation.editReply(`Ticket channel created: ${channel}`);
                } else {
                    await confirmation.editReply('Failed to create ticket channel.');
                }
            } catch (error) {
                // If it times out or fails
                await interaction.editReply({
                    content: 'Ticket creation timed out or failed.',
                    components: []
                }).catch(() => { });
            }
        }
    }
};

async function createTicketChannel(interaction, userIds) {
    try {
        // Fetch usernames for the channel name
        const usernames = [];
        for (const id of userIds) {
            try {
                const user = await interaction.client.users.fetch(id);
                usernames.push(user.username);
            } catch (err) {
                usernames.push(id); // Fallback to ID if fetch fails
            }
        }

        const channelName = `ticket-${usernames.join('-')}`.substring(0, 100); // Discord channel names are max 100 characters

        // Create the channel under the category. This automatically inherits the category's permissions initially.
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
        });

        // Add the explicitly chosen users to view the channel
        const overwrites = [...userIds];

        // Also add the command executor so they can view the ticket they just created
        if (!overwrites.includes(interaction.user.id)) {
            overwrites.push(interaction.user.id);
        }

        // Create an overwrite for each selected user and the executor
        for (const userId of overwrites) {
            await channel.permissionOverwrites.create(userId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
        }

        return channel;
    } catch (error) {
        console.error('Error creating ticket channel:', error);
        return null;
    }
}
