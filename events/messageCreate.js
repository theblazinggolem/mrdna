const { Events } = require("discord.js");
const db = require("../db");

const TARGET_ROLES = ["857990235194261514", "913864890916147270"];

// The specific text commands to track
const MOD_PREFIXES = ["!warn", "!kick", "!ban", "!timeout", "!lock", "!unlock", "!purge"];

// Cache to prevent DB spam: userId -> "YYYY-MM-DD"
const lastActivityCache = new Map();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // 1. Ignore bots and DMs
        if (!message.guild || message.author.bot) return;

        // 2. Role Check (Needed for both features)
        const hasRole =
            message.member &&
            TARGET_ROLES.some((roleId) =>
                message.member.roles.cache.has(roleId)
            );

        // If not staff, we don't care about tracking them
        if (!hasRole) return;

        // --- FEATURE A: General Activity Tracking (Once per day) ---
        const userId = message.author.id;
        const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

        if (lastActivityCache.get(userId) !== today) {
            try {
                // Upsert: Try to update today's activity, if row doesn't exist, insert
                // Since we created the table with user_id PK, we can use ON CONFLICT
                await db.query(
                    `INSERT INTO user_activity (user_id, last_seen)
                     VALUES ($1, NOW())
                     ON CONFLICT (user_id) 
                     DO UPDATE SET last_seen = NOW()`,
                    [userId]
                );

                // Update Cache
                lastActivityCache.set(userId, today);
                // console.log(`[Activity] Tracked message for ${message.author.username}`);
            } catch (err) {
                console.error(`[Activity Error] Could not log activity for ${userId}:`, err);
            }
        }

        // --- FEATURE B: Manual Mod Command Logging ---
        const args = message.content.trim().split(/ +/);
        const commandName = args[0].toLowerCase();

        if (MOD_PREFIXES.includes(commandName)) {
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
        }
    },
};
