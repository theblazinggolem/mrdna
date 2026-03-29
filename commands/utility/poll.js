const {
    SlashCommandBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll for users to vote on')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The poll question to be displayed')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('preset')
                .setDescription('If true, ignore custom options and automatically react with ✅, 🟧, ❌')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('Emoji for option 1')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('Emoji for option 2')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('Emoji for option 3')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('Emoji for option 4')
                .setRequired(false)
        ),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const preset = interaction.options.getBoolean('preset') ?? false;

        const rawCustomEmojis = [
            interaction.options.getString('option1'),
            interaction.options.getString('option2'),
            interaction.options.getString('option3'),
            interaction.options.getString('option4')
        ];

        const customEmojis = rawCustomEmojis.filter(emoji => emoji !== null);

        await interaction.reply({ content: `${question}` });
        const message = await interaction.fetchReply();

        try {
            if (preset) {
                await message.react('✅');
                await message.react('🟧');
                await message.react('❌');
            } else if (customEmojis.length > 0) {
                let failedEmojis = false;

                for (const emoji of customEmojis) {
                    try {
                        await message.react(emoji);
                    } catch (e) {
                        failedEmojis = true;
                    }
                }

                if (failedEmojis) {
                    const fixButton = new ButtonBuilder()
                        .setCustomId('fix_poll_emojis')
                        .setLabel('Fix Emojis')
                        .setStyle(ButtonStyle.Primary);

                    const row = new ActionRowBuilder().addComponents(fixButton);

                    const followUpMsg = await interaction.followUp({
                        content: '⚠️ Some of your input emojis were invalid and failed to react! Click below to fix them.',
                        components: [row],
                        flags: MessageFlags.Ephemeral,
                        withResponse: true
                    });

                    // Resolve the proper object to listen on (handling both native Message or InteractionResponse wrappers)
                    const resTarget = followUpMsg.resource ? followUpMsg.resource.message : followUpMsg;

                    try {
                        const btnInteraction = await resTarget.awaitMessageComponent({
                            filter: i => i.customId === 'fix_poll_emojis' && i.user.id === interaction.user.id,
                            time: 60000
                        });

                        const modal = new ModalBuilder()
                            .setCustomId('fix_poll_emojis_modal')
                            .setTitle('Fix Poll Emojis');

                        for (let k = 0; k < 4; k++) {
                            const input = new TextInputBuilder()
                                .setCustomId(`emoji_input_${k}`)
                                .setLabel(`Emoji ${k + 1}`)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(false)
                                .setValue(rawCustomEmojis[k] || '');
                            modal.addComponents(new ActionRowBuilder().addComponents(input));
                        }

                        await btnInteraction.showModal(modal);

                        const modalSubmit = await btnInteraction.awaitModalSubmit({
                            filter: i => i.customId === 'fix_poll_emojis_modal' && i.user.id === interaction.user.id,
                            time: 120000
                        });

                        const newEmojis = [
                            modalSubmit.fields.getTextInputValue('emoji_input_0'),
                            modalSubmit.fields.getTextInputValue('emoji_input_1'),
                            modalSubmit.fields.getTextInputValue('emoji_input_2'),
                            modalSubmit.fields.getTextInputValue('emoji_input_3')
                        ].filter(e => e !== null && e.trim() !== '');

                        await modalSubmit.deferUpdate();

                        // Try applying new emojis to the same message
                        let newFailed = false;
                        for (const em of newEmojis) {
                            try {
                                await message.react(em.trim());
                            } catch (e) {
                                newFailed = true;
                            }
                        }

                        if (newFailed) {
                            await modalSubmit.followUp({ content: 'Still had trouble with some emojis! The valid ones were applied.', flags: MessageFlags.Ephemeral });
                        } else {
                            await modalSubmit.followUp({ content: 'All emojis fixed and applied successfully!', flags: MessageFlags.Ephemeral });
                        }

                    } catch (e) {
                        // User ignored the button or modal timed out
                        console.error('Modal logic error or timeout:', e.message);
                    }
                }
            } else {
                await message.react('👍');
                await message.react('👎');
            }
        } catch (error) {
            console.error('Failed to react to poll message with preset/default emojis:', error);
        }
    }
};
