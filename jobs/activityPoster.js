const cron = require("node-cron");
const generateStaffReport = require("../utils/generateStaffReport");

const GUILD_ID = "841699180271239218";
const REPORT_CHANNEL_ID = "1461971930880938129";
const LOOKBACK_DAYS = 15;

module.exports = (client) => {
    // Cron: At minute 0, hour 0, on day-of-month 1 and 15
    cron.schedule("0 0 1,15 * *", async () => {
        console.log(`[Bi-Weekly Report] Starting generation...`);

        try {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (!guild) return console.error("[Report] Guild not found!");

            const channel = guild.channels.cache.get(REPORT_CHANNEL_ID);
            if (!channel)
                return console.error("[Report] Report channel not found!");

            const { messageContent, attachment, error } = await generateStaffReport(
                client,
                GUILD_ID,
                LOOKBACK_DAYS
            );

            if (error) {
                return console.error(`[Bi-Weekly Report] Error: ${error}`);
            }

            await channel.send({
                content: messageContent,
                files: [attachment],
            });

            console.log("[Bi-Weekly Report] Sent successfully.");
        } catch (error) {
            console.error("[Bi-Weekly Report] Error:", error);
        }
    });
};

