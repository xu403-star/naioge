import initSqlJs from "sql.js";
import fs from "fs";
import crypto from "crypto";
import { transformToken } from "./lib/tokenAuth.js";

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync("./data/cloud-bot.db"));
const result = db.exec("SELECT id, name, token, bin_base64 FROM accounts WHERE id='14a1e53f2ef7a9f0811d103b4048c33d'");
const cols = result[0].columns;
const row = result[0].values[0];
const id = row[cols.indexOf("id")];
const name = row[cols.indexOf("name")];
const token = row[cols.indexOf("token")];
const bin = row[cols.indexOf("bin_base64")];
const binBuf = Buffer.from(bin, "base64");
const md5 = crypto.createHash("md5").update(binBuf).digest("hex");
console.log("id:", id, "name:", name);
console.log("BIN大小:", binBuf.length, "MD5:", md5, "ID匹配:", md5 === id);
console.log("BIN前10字节:", binBuf.slice(0,10).toString("hex"));
console.log("token keys:", Object.keys(JSON.parse(token)).join(","));

const ab = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength);
const newToken = await transformToken(ab);
const obj = JSON.parse(newToken);
console.log("重新transformToken keys:", Object.keys(obj).join(","));
console.log("roleToken存在:", obj.roleToken != null, "roleId存在:", obj.roleId != null);
