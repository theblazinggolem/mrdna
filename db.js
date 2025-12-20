const { Pool } = require("pg");
require("dotenv").config();
const connectionString = process.env.NEON;
const pool = new Pool({
    connectionString,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
