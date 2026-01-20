const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const channelCooldowns = new Map();

const BOOSTER_ROLE_ID = "855954434935619584";
const REVIVE_ROLE_ID = "858331630997340170";
const LOG_CHANNEL_ID = "1350108952041492561";
const GLOBAL_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const BOOSTER_COOLDOWN_MS = 90 * 60 * 1000;

// Test Server Config
// const BOOSTER_ROLE_ID = "1194147739517329478";
// const REVIVE_ROLE_ID = "932906148326154280";
// const LOG_CHANNEL_ID = "850979723882266635";
// const GLOBAL_COOLDOWN_MS = 3 * 60 * 1000;
// const BOOSTER_COOLDOWN_MS = 60 * 1000;
//

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
                .setMinLength(24)
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            const { guild, channel, member, user } = interaction;
            const topic = interaction.options.getString("topic");

            const pingPatterns = [/@everyone/, /@here/, /<@&?\d+>/];
            if (pingPatterns.some((p) => p.test(topic))) {
                return interaction.reply({
                    content:
                        "Please send the command again without any mentions.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            for (const pattern of forbiddenPatterns) {
                const regex =
                    pattern instanceof RegExp
                        ? pattern
                        : new RegExp(`\\b${pattern}\\b`, "i");
                if (regex.test(topic)) {
                    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel) {
                        const logMsg = `**Revive Blocked**\n**User:** <@${user.id
                            }> (${user.id
                            })\n**Channel:** ${channel.toString()}\n**Content:** \`${topic}\``;
                        await logChannel.send({ content: logMsg });
                    }

                    return interaction.reply({
                        content:
                            "Your topic contains a forbidden word or pattern.",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            const now = Date.now();
            let cooldownData = channelCooldowns.get(channel.id) || {
                globalUnlock: 0,
                boosterUnlock: 0,
            };

            const isBooster = member.roles.cache.has(BOOSTER_ROLE_ID);
            const isGlobalCooldownActive = now < cooldownData.globalUnlock;

            if (isGlobalCooldownActive) {
                if (isBooster) {
                    if (now < cooldownData.boosterUnlock) {
                        const timeLeft = Math.floor(
                            cooldownData.boosterUnlock / 1000
                        );
                        return interaction.reply({
                            content: `Command bypass on cooldown. Next revive <t:${timeLeft}:R>`,
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                    cooldownData.boosterUnlock = now + BOOSTER_COOLDOWN_MS;
                } else {
                    const globalTime = Math.floor(
                        cooldownData.globalUnlock / 1000
                    );
                    const boosterTime = Math.floor(
                        cooldownData.boosterUnlock / 1000
                    );

                    const boosterStatus =
                        now < cooldownData.boosterUnlock
                            ? `<t:${boosterTime}:R>`
                            : "**Available Now**";

                    return interaction.reply({
                        content: `Command is on cooldown. Next revive <t:${globalTime}:R>\n-# Boosters get lesser cooldown, next revive ${boosterStatus}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } else {
                cooldownData.globalUnlock = now + GLOBAL_COOLDOWN_MS;
                cooldownData.boosterUnlock = now + BOOSTER_COOLDOWN_MS;
            }

            channelCooldowns.set(channel.id, cooldownData);

            const linkRegex = /https?:\/\/\S+/;
            if (linkRegex.test(topic)) {
                const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logMsg = `**Chat Revive Link Detected**\n**User:** <@${user.id
                        }> (${user.id
                        })\n**Channel:** ${channel.toString()}\n**Content:** ${topic}`;
                    await logChannel.send({ content: logMsg });
                }
            }

            // 5. Send Revive
            await interaction.reply({
                content: `<@&${REVIVE_ROLE_ID}> Let's discuss: ${topic}\n-# if you don't want to get pinged, go to <id:customize> & remove the role`,
                allowedMentions: { roles: [REVIVE_ROLE_ID] },
            });
        } catch (error) {
            console.error("Error in revive command:", error);
            await interaction.reply({
                content: "There was an error sending the message.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};