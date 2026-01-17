const { Events, AuditLogEvent } = require("discord.js");
const db = require("../db");

const MOD_ROLES = ["857990235194261514", "913864890916147270"];

module.exports = {
    name: Events.GuildAuditLogEntryCreate,
    async execute(entry, guild) {
        // 1. IGNORE BOTS (Prevent double logging of your own bot commands)
        if (!entry.executor || entry.executor.bot) return;

        // 2. Fetch the executor to check for Staff Roles
        let executorMember;
        try {
            executorMember = await guild.members.fetch(entry.executor.id);
        } catch (e) {
            return;
        }

        const hasRole = MOD_ROLES.some((roleId) =>
            executorMember.roles.cache.has(roleId)
        );
        if (!hasRole) return;

        // 3. Determine the Action Type
        let actionType = null;

        switch (entry.action) {
            case AuditLogEvent.MemberKick:
                actionType = "manual_kick";
                break;
            case AuditLogEvent.MemberBanAdd:
                actionType = "manual_ban";
                break;
            case AuditLogEvent.MemberUpdate:
                // Check if timeout changed
                const change = entry.changes.find(
                    (c) => c.key === "communication_disabled_until"
                );
                if (change && change.new) {
                    actionType = "manual_timeout";
                }
                break;
        }

        if (!actionType) return;

        // 4. Log to Database
        try {
            await db.query(
                `INSERT INTO mod_logs (mod_id, mod_name, action_type)
                 VALUES ($1, $2, $3)`,
                [entry.executor.id, entry.executor.username, actionType]
            );
            console.log(
                `[Audit Log] Tracked ${actionType} by ${entry.executor.username}`
            );
        } catch (error) {
            console.error(
                `[Audit Log Error] Failed to log manual action:`,
                error
            );
        }
    },
};
