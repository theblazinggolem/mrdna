const { AttachmentBuilder } = require("discord.js");
const db = require("../db");

const MOD_ROLES = ["857990235194261514", "913864890916147270"];

function getDaysAgo(dateInfo) {
    if (!dateInfo) return "Never";
    const date = new Date(dateInfo);
    const now = new Date();
    // Reset times to midnight for accurate "day" calculation? 
    // Or just simple 24h diff?
    // User asked for "today", "1 day ago". 
    // Usually "Today" means same calendar day.

    const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
}

module.exports = async function generateStaffReport(client, guildId, lookbackDays = 14) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { error: "Guild not found" };

    await guild.members.fetch();
    // Filter for CURRENT staff only
    const staffMembers = guild.members.cache.filter((member) =>
        MOD_ROLES.some((roleId) => member.roles.cache.has(roleId)) && !member.user.bot
    );

    if (staffMembers.size === 0) return { error: "No staff members found." };

    const staffIds = staffMembers.map(m => m.id);

    // 1. Mod Logs
    const recentLogsRes = await db.query(
        `SELECT * FROM mod_logs
         WHERE mod_id = ANY($1::text[])
         AND executed_at >= NOW() - INTERVAL '${lookbackDays} days'`,
        [staffIds]
    );

    // 2. Last Action (All time)
    const lastActionRes = await db.query(
        `SELECT mod_id, MAX(executed_at) as last_seen
         FROM mod_logs
         WHERE mod_id = ANY($1::text[])
         GROUP BY mod_id`,
        [staffIds]
    );

    // 3. User Activity (Last Message)
    let lastMessageRes = { rows: [] };
    try {
        lastMessageRes = await db.query(
            `SELECT user_id, last_seen FROM user_activity WHERE user_id = ANY($1::text[])`,
            [staffIds]
        );
    } catch (e) {
        console.error("User activity table might be missing or error querying:", e.message);
    }

    const reportData = { active: {}, inactive: {} };
    const activeMentions = [];
    const inactiveMentions = [];

    staffMembers.forEach(member => {
        const userId = member.id;
        const username = member.user.username;

        // Data gathering
        const lastActionRecord = lastActionRes.rows.find(r => r.mod_id === userId);
        const lastMsgRecord = lastMessageRes.rows.find(r => r.user_id === userId);

        const lastActionDate = lastActionRecord ? lastActionRecord.last_seen : null;
        const lastMsgDate = lastMsgRecord ? lastMsgRecord.last_seen : null;

        const recentLogs = recentLogsRes.rows.filter(r => r.mod_id === userId);

        const isActive = recentLogs.length > 0;

        const stats = {
            id: userId,
            last_action: getDaysAgo(lastActionDate),
            last_message: getDaysAgo(lastMsgDate),
            action_counts: isActive ? {
                warns: 0, timeouts: 0, kicks: 0, bans: 0, purges: 0, other: 0
            } : null
        };

        if (isActive) {
            recentLogs.forEach(log => {
                const type = log.action_type.toLowerCase();
                if (type.includes("warn")) stats.action_counts.warns++;
                else if (type.includes("timeout")) stats.action_counts.timeouts++;
                else if (type.includes("kick")) stats.action_counts.kicks++;
                else if (type.includes("ban")) stats.action_counts.bans++;
                else if (type.includes("purge") || type.includes("delete")) stats.action_counts.purges++;
                else stats.action_counts.other++;
            });
            reportData.active[username] = stats;
            activeMentions.push(member.toString());
        } else {
            reportData.inactive[username] = stats;
            inactiveMentions.push(member.toString());
        }
    });

    // Output building
    const jsonOutput = JSON.stringify(reportData, null, 4);
    const buffer = Buffer.from(jsonOutput, "utf-8");
    const attachment = new AttachmentBuilder(buffer, { name: "staff_report.json" });

    let messageContent = `📊 **Staff Activity Report** (Last ${lookbackDays} Days)\n\n`;
    messageContent += `**Active Staff (${activeMentions.length}):**\n`;
    messageContent += activeMentions.length ? activeMentions.join(", ") : "None";
    messageContent += `\n\n**Inactive Staff (${inactiveMentions.length}):**\n`;
    messageContent += inactiveMentions.length ? inactiveMentions.join(", ") : "None";

    return { messageContent, attachment, jsonOutput };
};
