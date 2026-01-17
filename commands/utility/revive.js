const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const db = require("../../db"); // Import your DB connection

const BOOSTER_ROLE_ID = "855954434935619584";
const REVIVE_ROLE_ID = "858331630997340170";
const LOG_CHANNEL_ID = "1350108952041492561";

// Test Server Config
// const BOOSTER_ROLE_ID = "1194147739517329478";
// const REVIVE_ROLE_ID = "932906148326154280";
// const LOG_CHANNEL_ID = "850979723882266635";
// const GLOBAL_COOLDOWN_MS = 3 * 60 * 1000;
// const BOOSTER_COOLDOWN_MS = 60 * 1000;
//

// 3 Hours Global, 90 Mins Booster
const GLOBAL_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const BOOSTER_COOLDOWN_MS = 90 * 60 * 1000;

// Test Config (Uncomment to test fast cooldowns)
// const GLOBAL_COOLDOWN_MS = 3 * 60 * 1000;
// const BOOSTER_COOLDOWN_MS = 60 * 1000;

const forbiddenPatterns = [
    "porn",
    "fuck",
    "bitch",
    "hitler",
    /\b[gG](?:[oO0]{2,})[nN]\w*\b/,
    /\bn[i1]g{2,}(?:a|er)?s?\b/i,
    /f[a@]g{1,2}[o0]ts?/,
    /r[e3]t[a@]rd/,
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("revive")
        .setDescription("Pings the chat role with a topic to discuss")
        .addStringOption((option) =>
            option
                .setName("topic")
                .setDescription("The topic to discuss")
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const { guild, channel, member, user } = interaction;
            const topic = interaction.options.getString("topic");

            // 1. Anti-Ping Check
            const pingPatterns = [/@everyone/, /@here/, /<@&?\d+>/];
            if (pingPatterns.some((p) => p.test(topic))) {
                return interaction.reply({
                    content:
                        "Please send the command again without any mentions.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // 2. Bad Word Check
            for (const pattern of forbiddenPatterns) {
                const regex =
                    pattern instanceof RegExp
                        ? pattern
                        : new RegExp(`\\b${pattern}\\b`, "i");

                if (regex.test(topic)) {
                    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel) {
                        const logMsg = `Revive Blocked <:hazard:1462056327378501738>\n**User:** <@${
                            user.id
                        }> (${
                            user.id
                        })\n**Channel:** ${channel.toString()}\n**Content:** \`${topic}\``;
                        await logChannel.send({ content: logMsg });
                    }
                    return interaction.reply({
                        content:
                            "<:hazard:1462056327378501738> Your topic contains a forbidden word or pattern.",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            // 3. Database Cooldown Check
            const now = Date.now();

            // Query the DB for this channel's cooldowns
            const res = await db.query(
                "SELECT global_unlock, booster_unlock FROM revive_cooldowns WHERE channel_id = $1",
                [channel.id]
            );

            // Default to 0 if no record exists
            let globalUnlock = 0;
            let boosterUnlock = 0;

            if (res.rows.length > 0) {
                // Postgres BIGINT returns as string, convert to Number
                globalUnlock = Number(res.rows[0].global_unlock);
                boosterUnlock = Number(res.rows[0].booster_unlock);
            }

            const isBooster = member.roles.cache.has(BOOSTER_ROLE_ID);
            const isGlobalCooldownActive = now < globalUnlock;

            if (isGlobalCooldownActive) {
                if (isBooster) {
                    // Booster Logic
                    if (now < boosterUnlock) {
                        const timeLeft = Math.floor(boosterUnlock / 1000);
                        return interaction.reply({
                            content: `Command bypass on cooldown. Next revive <t:${timeLeft}:R>`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    // Booster is ready, set NEW booster cooldown (keeps global same or extends it)
                    boosterUnlock = now + BOOSTER_COOLDOWN_MS;

                    // We also extend global unlock so non-boosters can't spam right after a booster
                    // (Optional: remove this line if you want boosters to NOT affect global timer)
                    globalUnlock = Math.max(
                        globalUnlock,
                        now + BOOSTER_COOLDOWN_MS
                    );
                } else {
                    // Normal User Logic
                    const globalTime = Math.floor(globalUnlock / 1000);
                    const boosterTime = Math.floor(boosterUnlock / 1000);

                    const boosterStatus =
                        now < boosterUnlock
                            ? `<t:${boosterTime}:R>`
                            : "**Available Now**";

                    return interaction.reply({
                        content: `Command is on cooldown. Next revive <t:${globalTime}:R>\n-# Boosters get lesser cooldown, next revive ${boosterStatus}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else {
                // Global Cooldown is OVER, anyone can use it
                globalUnlock = now + GLOBAL_COOLDOWN_MS;
                boosterUnlock = now + BOOSTER_COOLDOWN_MS;
            }

            // 4. Save New Cooldowns to DB (Upsert)
            // This ensures cooldowns persist through restarts
            await db.query(
                `INSERT INTO revive_cooldowns (channel_id, global_unlock, booster_unlock)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (channel_id)
                 DO UPDATE SET global_unlock = $2, booster_unlock = $3`,
                [channel.id, globalUnlock, boosterUnlock]
            );

            // 5. Link Detection Log
            const linkRegex = /https?:\/\/\S+/;
            if (linkRegex.test(topic)) {
                const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logMsg = `**Chat Revive Link Detected**\n**User:** <@${
                        user.id
                    }> (${
                        user.id
                    })\n**Channel:** ${channel.toString()}\n**Content:** ${topic}`;
                    await logChannel.send({ content: logMsg });
                }
            }

            // 6. Send Revive
            await interaction.reply({
                content: `<@&${REVIVE_ROLE_ID}> Let's discuss: ${topic}\n-# if you don't want to get pinged, go to <id:customize> & remove the role`,
                allowedMentions: { roles: [REVIVE_ROLE_ID] },
            });
        } catch (error) {
            console.error("Error in revive command:", error);
            // Don't crash if interaction is already replied to (rare edge case)
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: "There was an error sending the message.",
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    },
};
