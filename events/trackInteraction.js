const { Events } = require("discord.js");
const db = require("../db");

const TARGET_ROLES = ["857990235194261514", "913864890916147270"];
const MOD_COMMAND_IDS = ["1153673809673605120"];

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;
        if (!MOD_COMMAND_IDS.includes(interaction.commandId)) return;

        const hasRole =
            interaction.member &&
            TARGET_ROLES.some((r) => interaction.member.roles.cache.has(r));
        if (!hasRole) return;

        // Determine Action Type (Subcommand or Command Name)
        let actionType = interaction.commandName;
        try {
            const sub = interaction.options.getSubcommand(false);
            if (sub) actionType = sub;
        } catch (e) {}

        try {
            await db.query(
                `INSERT INTO mod_logs (mod_id, mod_name, action_type)
                 VALUES ($1, $2, $3)`,
                [interaction.user.id, interaction.user.username, actionType]
            );
        } catch (error) {
            console.error(`[Mod Log Error] Slash command error:`, error);
        }
    },
};
