/**
 * 模拟服务器 /api/accounts/confirm 端点的 BIN 处理流程
 * 用于精确对比：服务器 vs 独立测试
 */
import { readFileSync } from 'fs';
import { bon, ProtoMsg, getEnc } from './lib/bonProtocol.js';
import { transformToken, buildWsUrl, getBinBase64Token, getTokenId } from './lib/tokenAuth.js';

async function main() {
  const binPath = process.argv[2] || 'c:/Users/Administrator/Desktop/91/瞌睡.bin';
  console.log('📂 BIN:', binPath);

  // ====== 模拟 express-fileupload ======
  const buf = readFileSync(binPath);
  const binArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  console.log('📏 BIN大小:', binArrayBuffer.byteLength, 'bytes');

  // ====== getTokenId ======
  const tokenId = getTokenId(binArrayBuffer);
  console.log('🔑 TokenID:', tokenId);

  // ====== getBinBase64Token ======
  const binBase64 = getBinBase64Token(binArrayBuffer);
  console.log('📦 BIN Base64长度:', binBase64.length);

  // ====== transformToken ======
  console.log('\n--- 调用 transformToken ---');
  let jsonToken;
  try {
    jsonToken = await transformToken(binArrayBuffer);
    console.log('✅ Token长度:', jsonToken.length);
    const p = JSON.parse(jsonToken);
    console.log('🔑 Keys:', Object.keys(p).join(', '));
    console.log('   roleToken:', p.roleToken ? `✅ (${p.roleToken.length} chars)` : '❌ MISSING');
    console.log('   roleId:', p.roleId ?? '❌ MISSING');
    console.log('   sessId:', p.sessId ?? '❌ MISSING');
    console.log('   connId:', p.connId ?? '❌ MISSING');
    console.log('   isRestore:', p.isRestore ?? '❌ MISSING');
  } catch(e) {
    console.error('❌ transformToken失败:', e.message);
    process.exit(1);
  }

  // ====== buildWsUrl ======
  const wsUrl = buildWsUrl(jsonToken);
  console.log('\n--- buildWsUrl ---');
  console.log('URL全长:', wsUrl.length);
  // 解码 p 参数
  const urlObj = new URL(wsUrl);
  const pDecoded = decodeURIComponent(urlObj.searchParams.get('p'));
  console.log('p参数(解码):', pDecoded.substring(0, 200));

  // ====== 验证DB存储数据 ======
  const accountData = {
    token: jsonToken,
    wsUrl: wsUrl,
    binBase64,
  };
  console.log('\n--- DB存储验证 ---');
  console.log('account.token长度:', accountData.token.length);
  console.log('account.wsUrl长度:', accountData.wsUrl.length);
  console.log('account.binBase64长度:', accountData.binBase64.length);

  console.log('\n✅ 模拟上传流程完成，Token完整！');
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
