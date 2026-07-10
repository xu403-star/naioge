/**
 * 通过API端点模拟BIN上传，检查服务器端transformToken结果
 */
import { readFileSync } from 'fs';

const binPath = process.argv[2] || 'c:/Users/Administrator/Desktop/91/瞌睡.bin';
const buf = readFileSync(binPath);
const binBase64 = buf.toString('base64');

console.log('📂 BIN:', binPath);
console.log('📏 大小:', buf.length, 'bytes');
console.log('📦 Base64长度:', binBase64.length);

// POST到 /api/accounts/bin
const res = await fetch('http://localhost:3456/api/accounts/bin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ binBase64, name: 'test-api-upload' }),
});

const data = await res.json();
console.log(`📡 响应 status=${res.status}:`, JSON.stringify(data).substring(0, 300));

if (data.success) {
  // 再通过GET /api/accounts 查看存储的账号
  const acctsRes = await fetch('http://localhost:3456/api/accounts');
  const accounts = await acctsRes.json();
  console.log('\n📋 账号列表:');
  for (const a of accounts) {
    console.log(`  ${a.id}: ${a.name} status=${a.status}`);
  }
}
