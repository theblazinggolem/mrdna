const { Pool } = require("pg");
const { quotes } = require("./quotes.js");
require("dotenv").config();

const connectionString = process.env.NEON;
const pool = new Pool({
    connectionString,
});

async function migrate() {
    console.log(`Starting migration of ${quotes.length} quotes...`);
    const client = await pool.connect();

    try {
        for (const quote of quotes) {
            const text = quote.text;
            const link = quote.link;
            const reply = quote.replyText || null;

            const query = `
                INSERT INTO quotes (text, link, reply)
                VALUES ($1, $2, $3)
            `;

            await client.query(query, [text, link, reply]);
            console.log(`Inserted: "${text.substring(0, 20)}..."`);
        }

        console.log("Migration complete!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
