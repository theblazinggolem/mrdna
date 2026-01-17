const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AttachmentBuilder,
    MessageFlags,
} = require("discord.js");
const db = require("../../db");

const MOD_ROLES = ["857990235194261514", "913864890916147270"];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("check-activity")
        .setDescription(
            "Generate the Staff Activity JSON Report (same as bi-weekly)"
        )
        .addIntegerOption((option) =>
            option
                .setName("days")
                .setDescription("Days to look back (default: 14)")
                .setMinValue(1)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Use flags instead of ephemeral option
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const days = interaction.options.getInteger("days") || 14;

        // 1. Fetch Staff
        await interaction.guild.members.fetch();
        const staffMembers = interaction.guild.members.cache.filter(
            (member) =>
                MOD_ROLES.some((roleId) => member.roles.cache.has(roleId)) &&
                !member.user.bot
        );

        if (staffMembers.size === 0) {
            return interaction.editReply(
                "❌ No staff members found with those roles."
            );
        }
        const staffIds = staffMembers.map((m) => m.id);

        // 2. Fetch Data (Dual Query for Accuracy)
        // Query A: Recent specific actions (for counts)
        const recentLogsRes = await db.query(
            `SELECT * FROM mod_logs
             WHERE mod_id = ANY($1::text[])
             AND executed_at >= NOW() - INTERVAL '${days} days'`,
            [staffIds]
        );

        // Query B: Absolute last seen timestamp (for inactive users)
        const lastSeenRes = await db.query(
            `SELECT mod_id, MAX(executed_at) as last_seen
             FROM mod_logs
             WHERE mod_id = ANY($1::text[])
             GROUP BY mod_id`,
            [staffIds]
        );

        // 3. Build JSON Structure
        const reportData = {
            active: {},
            inactive: {},
        };

        staffMembers.forEach((member) => {
            const username = member.user.username;
            const userId = member.id;

            // Find absolute last seen
            const lastSeenRecord = lastSeenRes.rows.find(
                (r) => r.mod_id === userId
            );
            const lastSeenTime = lastSeenRecord
                ? new Date(lastSeenRecord.last_seen).toISOString()
                : "Never";

            // Filter recent logs for this user
            const userRecentLogs = recentLogsRes.rows.filter(
                (r) => r.mod_id === userId
            );

            if (userRecentLogs.length > 0) {
                // --- ACTIVE ---
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
                // --- INACTIVE ---
                reportData.inactive[username] = {
                    id: userId,
                    last_seen: lastSeenTime,
                    actions: null,
                };
            }
        });

        // 4. Send Result
        const jsonOutput = JSON.stringify(reportData, null, 4);
        const header = `📊 **Staff Activity Report** (Last ${days} Days)`;

        if (jsonOutput.length < 1900) {
            await interaction.editReply(
                `${header}\n\`\`\`json\n${jsonOutput}\n\`\`\``
            );
        } else {
            const buffer = Buffer.from(jsonOutput, "utf-8");
            const attachment = new AttachmentBuilder(buffer, {
                name: "staff_report.json",
            });
            await interaction.editReply({
                content: header,
                files: [attachment],
            });
        }
    },
};
