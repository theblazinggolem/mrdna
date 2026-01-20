const { Pool } = require("pg");
require("dotenv").config();
const connectionString = process.env.NEON;
const pool = new Pool({
    connectionString,
});

// Prevent crash on idle client error
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
