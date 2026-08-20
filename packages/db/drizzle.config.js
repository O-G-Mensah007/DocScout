export default {
    schema: "./src/schema.ts",
    out: "./migrations",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL },
    strict: true,
};
//# sourceMappingURL=drizzle.config.js.map