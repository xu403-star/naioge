import fs from "fs";
import initSqlJs from "sql.js";
import crypto from "crypto";

const dbBuffer = fs.readFileSync("./data/cloud-bot.db");
const SQL = await initSqlJs();
const db = new SQL.Database(dbBuffer);

const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
console.log("表:", tables[0]?.values.map(r => r[0]).join(", "));

const result = db.exec("SELECT id, name, bin_base64 FROM accounts");
if (!result || !result[0]) {
  console.log("没有账号数据");
  process.exit(0);
}

const cols = result[0].columns;
const rows = result[0].values;

for (const row of rows) {
  const id = row[cols.indexOf("id")];
  const name = row[cols.indexOf("name")];
  const bin = row[cols.indexOf("bin_base64")];
  const binBuf = Buffer.from(bin, "base64");
  const md5 = crypto.createHash("md5").update(binBuf).digest("hex");
  const isRawEncrypted = binBuf[0] >= 0x60;
  console.log(id, name, "BIN大小="+binBuf.length, "MD5="+md5, "ID匹配="+(md5===id), "疑似原始加密="+isRawEncrypted);
}
