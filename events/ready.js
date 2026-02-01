const { Events, ActivityType } = require("discord.js");
const db = require("../db");

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        const statusMessages = [
            {
                name: "sequencing DNA",
                type: ActivityType.Custom,
            },
            {
                name: "scrubbing the Mosasaur",
                type: ActivityType.Custom,
            },
            {
                name: "greeting visitors",
                type: ActivityType.Custom,
            },
            {
                name: "cleaning enclosures",
                type: ActivityType.Custom,
            },
            {
                name: "monitoring the park",
                type: ActivityType.Custom,
            },
            {
                name: "playing god",
                type: ActivityType.Custom,
            },
            {
                name: "hatching new species",
                type: ActivityType.Custom,
            },
            {
                name: "feeding the Rex",
                type: ActivityType.Custom,
            },
            {
                name: "incubating eggs",
                type: ActivityType.Custom,
            },
            {
                name: "inspecting fences",
                type: ActivityType.Custom,
            },
            {
                name: "scheduling rides",
                type: ActivityType.Custom,
            },
        ];

        let currentIndex = 0;

        client.user.setActivity(statusMessages[currentIndex]);
        console.log(`Bot status set to: ${statusMessages[currentIndex].name}`);

        setInterval(() => {
            currentIndex = (currentIndex + 1) % statusMessages.length;
            client.user.setActivity(statusMessages[currentIndex]);
        }, 300000);

        console.log("Bot status rotation enabled");
    },
};
