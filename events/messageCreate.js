const { Events } = require("discord.js");
const db = require("../db");

const TARGET_ROLES = ["857990235194261514", "913864890916147270"];

// The specific text commands to track
const MOD_PREFIXES = ["!warn", "!kick", "!ban", "!timeout", "!lock", "!unlock"];

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // 1. Ignore bots and DMs
        if (!message.guild || message.author.bot) return;

        // 2. Check if it starts with a Mod Prefix
        // We split by space to get the first word (e.g. "!warn @user" -> "!warn")
        const args = message.content.trim().split(/ +/);
        const commandName = args[0].toLowerCase();

        if (!MOD_PREFIXES.includes(commandName)) return;

        // 3. Role Check
        const hasRole =
            message.member &&
            TARGET_ROLES.some((roleId) =>
                message.member.roles.cache.has(roleId)
            );
        if (!hasRole) return;

        // 4. Log to Database
        // We strip the "!" to get the clean action name (e.g., "!warn" -> "warn")
        const cleanAction = commandName.slice(1);

        try {
            await db.query(
                `INSERT INTO mod_logs (mod_id, mod_name, action_type)
                 VALUES ($1, $2, $3)`,
                [message.author.id, message.author.username, cleanAction]
            );
            // console.log(`Logged text action: ${cleanAction} by ${message.author.username}`);
        } catch (error) {
            console.error(
                `[Mod Log Error] Failed to log text action for ${message.author.tag}:`,
                error
            );
        }
    },
};
