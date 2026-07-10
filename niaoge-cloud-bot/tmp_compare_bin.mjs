import fs from "fs";
import crypto from "crypto";
import initSqlJs from "sql.js";

const dbBuffer = fs.readFileSync("./data/cloud-bot.db");
const SQL = await initSqlJs();
const db = new SQL.Database(dbBuffer);

const result = db.exec("SELECT id, bin_base64 FROM accounts WHERE id IN ('14a1e53f2ef7a9f0811d103b4048c33d', '94d8c2c1c311a4a0d97c3548a46623ef')");
const rows = result[0].values;

for (const [id, bin] of rows) {
  const binBuf = Buffer.from(bin, "base64");
  const md5 = crypto.createHash("md5").update(binBuf).digest("hex");
  fs.writeFileSync(`c:/Users/18049/Desktop/niaoge/db_${id}.bin`, binBuf);
  console.log(id, "数据库BIN大小:", binBuf.length, "MD5:", md5, "匹配:", md5 === id);
}

const desktopFiles = ["派派002.bin", "闲臣云开.bin"];
for (const f of desktopFiles) {
  const buf = fs.readFileSync(`c:/Users/18049/Desktop/niaoge/${f}`);
  const md5 = crypto.createHash("md5").update(buf).digest("hex");
  console.log(f, "桌面BIN大小:", buf.length, "MD5:", md5);
}
