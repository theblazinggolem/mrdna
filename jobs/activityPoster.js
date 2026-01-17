const cron = require("node-cron");
const { AttachmentBuilder } = require("discord.js");
const db = require("../db");

const GUILD_ID = "841699180271239218";
const REPORT_CHANNEL_ID = "1461971930880938129";
const MOD_ROLES = ["857990235194261514", "913864890916147270"];
const LOOKBACK_DAYS = 15;

module.exports = (client) => {
    // Cron: At minute 0, hour 0, on day-of-month 1 and 15
    // Run every 10 seconds
    // cron.schedule("*/10 * * * * *", async () => {
    cron.schedule("0 0 1,15 * *", async () => {
        console.log(`[Bi-Weekly Report] Starting generation...`);

        try {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) return console.error("[Report] Guild not found!");

            const channel = guild.channels.cache.get(REPORT_CHANNEL_ID);
            if (!channel)
                return console.error("[Report] Report channel not found!");

            // Optimization: Fetch only ID list first if possible, but for role checks we need members
            await guild.members.fetch();
            const staffMembers = guild.members.cache.filter(
                (member) =>
                    MOD_ROLES.some((roleId) =>
                        member.roles.cache.has(roleId)
                    ) && !member.user.bot
            );

            if (staffMembers.size === 0) return;
            const staffIds = staffMembers.map((m) => m.id);

            // Fetch Recent Logs (Last 15 days)
            const recentLogsRes = await db.query(
                `SELECT * FROM mod_logs
                 WHERE mod_id = ANY($1::text[])
                 AND executed_at >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'`,
                [staffIds]
            );

            // Fetch All-Time Last Seen
            const lastSeenRes = await db.query(
                `SELECT mod_id, MAX(executed_at) as last_seen
                 FROM mod_logs
                 WHERE mod_id = ANY($1::text[])
                 GROUP BY mod_id`,
                [staffIds]
            );

            const reportData = {
                active: {},
                inactive: {},
            };

            staffMembers.forEach((member) => {
                const username = member.user.username;
                const userId = member.id;

                const lastSeenRecord = lastSeenRes.rows.find(
                    (r) => r.mod_id === userId
                );
                const lastSeenTime = lastSeenRecord
                    ? new Date(lastSeenRecord.last_seen).toISOString()
                    : "Never";

                const userRecentLogs = recentLogsRes.rows.filter(
                    (r) => r.mod_id === userId
                );

                if (userRecentLogs.length > 0) {
                    const counts = {
                        warns: 0,
                        timeouts: 0,
                        kicks: 0,
                        bans: 0,
                        other: 0,
                    };

                    userRecentLogs.forEach((log) => {
                        const type = log.action_type.toLowerCase();
                        if (counts[type] !== undefined) {
                            counts[type]++;
                        } else if (type.includes("warn")) counts.warns++;
                        else if (type.includes("timeout")) counts.timeouts++;
                        else if (type.includes("kick")) counts.kicks++;
                        else if (type.includes("ban")) counts.bans++;
                        else counts.other++;
                    });

                    reportData.active[username] = {
                        id: userId,
                        last_seen: lastSeenTime,
                        actions: counts,
                    };
                } else {
                    reportData.inactive[username] = {
                        id: userId,
                        last_seen: lastSeenTime,
                        actions: null,
                    };
                }
            });

            // Clean up cache to prevent memory leak
            guild.members.cache.sweep((member) => member.id !== client.user.id);

            const jsonOutput = JSON.stringify(reportData, null, 4);
            const messageContent = `📊 **Bi-Weekly Staff Activity Report** (1st/15th Check)`;

            if (jsonOutput.length < 1900) {
                await channel.send(
                    `${messageContent}\n\`\`\`json\n${jsonOutput}\n\`\`\``
                );
            } else {
                const buffer = Buffer.from(jsonOutput, "utf-8");
                const attachment = new AttachmentBuilder(buffer, {
                    name: "staff_report.json",
                });
                await channel.send({
                    content: messageContent,
                    files: [attachment],
                });
            }

            console.log("[Bi-Weekly Report] Sent successfully.");
        } catch (error) {
            console.error("[Bi-Weekly Report] Error:", error);
        }
    });
};
