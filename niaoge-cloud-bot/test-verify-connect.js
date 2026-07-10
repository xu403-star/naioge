/**
 * 验证：通过API上传 → 检查DB → 连接WebSocket
 */
async function main() {
  // Step 1: 连接账号
  const accountId = '678049640e719a4e527f036d4882421e';
  console.log('连接账号:', accountId);
  const res = await fetch(`http://localhost:3456/api/control/connect/${accountId}`, { method: 'POST' });
  const data = await res.json();
  console.log('连接响应:', JSON.stringify(data));

  // Step 2: 等待并检查状态
  await new Promise(r => setTimeout(r, 3000));
  const statusRes = await fetch('http://localhost:3456/api/control/status');
  const statuses = await statusRes.json();
  console.log('状态:', JSON.stringify(statuses, null, 2));
}

main().catch(err => console.error('❌', err));
