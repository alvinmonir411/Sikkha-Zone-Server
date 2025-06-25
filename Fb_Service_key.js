const fs = require("fs");
const { buffer } = require("stream/consumers");

const key = fs.readFileSync("./serviceAccountKey.json", "utf8");
const base64 = Buffer.from(key).toString("base64");
console.log(base64);
