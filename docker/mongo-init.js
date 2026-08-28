const dbName = process.env.MONGO_DB_NAME;
const appUser = process.env.MONGO_APP_USER;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!dbName || !appUser || !appPassword) {
  throw new Error(
    "mongo-init: MONGO_DB_NAME, MONGO_APP_USER and MONGO_APP_PASSWORD must all be set",
  );
}

db.getSiblingDB(dbName).createUser({
  user: appUser,
  pwd: appPassword,
  roles: [{ role: "readWrite", db: dbName }],
});

print(`mongo-init: created user '${appUser}' with readWrite on '${dbName}'`);
