// 动作账本回归测试：覆盖「失败后换内容重试」与「永久拒绝识别」两处修复。
// 不依赖 DSH 宿主，`node --test tests/` 直接跑。
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ActionLedger } from '../lib/store.mjs';
import { isPermanentSendFailure } from '../lib/runtime.mjs';

const ledgerAt = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-access-ledger-'));
  const ledger = new ActionLedger(dir);
  await ledger.init();
  return ledger;
};

const rejected = (retcode = 100) => {
  const error = new Error(`send_private_msg 被 OneBot 拒绝，retcode=${retcode}。`);
  error.name = 'OneBotRejectedError';
  error.retcode = retcode;
  return error;
};

test('失败（确定没发出去）后允许同一 request_id 换内容重试', async () => {
  const ledger = await ledgerAt();
  await assert.rejects(ledger.run('k', { text: 'A' }, async () => { throw rejected(); }));
  const retry = await ledger.run('k', { text: 'B' }, async () => ({ status: 'sent', messageId: '42' }));
  assert.equal(retry.status, 'sent');
  assert.equal(retry.result.messageId, '42');
});

test('已发送的 request_id 仍然锁死内容', async () => {
  const ledger = await ledgerAt();
  await ledger.run('k', { text: 'A' }, async () => ({ status: 'sent', messageId: '1' }));
  await assert.rejects(
    ledger.run('k', { text: 'B' }, async () => ({ status: 'sent' })),
    /同一 request_id/,
  );
});

test('相同内容重复提交只执行一次', async () => {
  const ledger = await ledgerAt();
  let runs = 0;
  const operation = async () => { runs += 1; return { status: 'sent', messageId: '1' }; };
  await ledger.run('k', { text: 'A' }, operation);
  const again = await ledger.run('k', { text: 'A' }, operation);
  assert.equal(again.duplicate, true);
  assert.equal(runs, 1);
});

test('永久拒绝的 retcode 被识别，临时失败不标记', () => {
  for (const code of [100, 102, 103, 104, 106]) {
    assert.equal(isPermanentSendFailure(rejected(code)), true, `retcode=${code} 应判为永久`);
  }
  assert.equal(isPermanentSendFailure(rejected(1200)), false);
  assert.equal(isPermanentSendFailure(new Error('fetch failed')), false);
  assert.equal(isPermanentSendFailure(undefined), false);
});
