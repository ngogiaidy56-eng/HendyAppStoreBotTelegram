import { HttpError, readJson, assertString, nowSeconds, json } from '../utils/http.js';
import { requireSession, requireAdmin } from '../auth/session.js';
import { syncGitHubActionsSecrets, dispatchGitHubWorkflow } from '../services/github-api.js';
import { rolloutBucket } from '../../../../packages/feature-flags/src/evaluator.js';
import { recordAudit } from '../services/d1-logger.js';

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function readConfig(env, key, fallback = null) {
  const row = await env.DB.prepare('SELECT value_json FROM bot_configs WHERE config_key=?').bind(key).first();
  if (!row) return fallback;
  try { return JSON.parse(row.value_json); } catch { return fallback; }
}

export async function isFeatureEnabled(env, key, subject = 'anonymous') {
  const row = await env.DB.prepare('SELECT enabled,rollout_percent FROM feature_flags WHERE flag_key=?').bind(key).first();
  return !!row && Number(row.enabled) === 1 && rolloutBucket(subject, key) < Number(row.rollout_percent);
}

async function getFeatures(request, env) {
  let subject = 'anonymous';
  if (request.headers.get('authorization')) {
    try { subject = String((await requireSession(request, env)).user.telegram_id); } catch { subject = 'anonymous'; }
  }
  const rows = (await env.DB.prepare('SELECT flag_key,description,enabled,rollout_percent FROM feature_flags ORDER BY flag_key').all()).results;
  return json({ features: rows.map((row) => ({ key: row.flag_key, description: row.description, enabled: !!row.enabled && rolloutBucket(subject, row.flag_key) < Number(row.rollout_percent) })) });
}

async function adminFeatures(request, env) {
  const { user } = await requireAdmin(request, env);
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT flag_key,description,enabled,rollout_percent,updated_by,updated_at FROM feature_flags ORDER BY flag_key').all();
    return json({ features: results });
  }
  const { value } = await readJson(request);
  const key = assertString(String(value.key || ''), 'key', 80);
  if (!/^[a-z][a-z0-9_]{1,79}$/.test(key)) throw new HttpError(400, 'Invalid feature flag key', 'INVALID_FLAG_KEY');
  const description = typeof value.description === 'string' ? value.description.trim().slice(0, 300) : '';
  const enabled = value.enabled === true ? 1 : value.enabled === false ? 0 : null;
  const rollout = value.rolloutPercent === undefined ? 100 : Number(value.rolloutPercent);
  if (enabled === null || !Number.isInteger(rollout) || rollout < 0 || rollout > 100) throw new HttpError(400, 'enabled and rolloutPercent are invalid', 'INVALID_FLAG');
  const now = nowSeconds();
  await env.DB.prepare(`INSERT INTO feature_flags(flag_key,description,enabled,rollout_percent,updated_by,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(flag_key) DO UPDATE SET description=excluded.description,enabled=excluded.enabled,rollout_percent=excluded.rollout_percent,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(key, description, enabled, rollout, user.telegram_id, now).run();
  await recordAudit(env, user.telegram_id, 'feature.update', 'feature', key, { enabled: !!enabled, rolloutPercent: rollout });
  return json({ ok: true, key, enabled: !!enabled, rolloutPercent: rollout });
}

async function referralProfile(request, env) {
  const { user } = await requireSession(request, env);
  if (!await isFeatureEnabled(env, 'referrals', user.telegram_id)) throw new HttpError(404, 'Referral feature is disabled', 'FEATURE_DISABLED');
  const [count, reward] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM referrals WHERE referrer_user_id=?').bind(user.id).first(),
    readConfig(env, 'referral_reward_vnd', Number(env.REFERRAL_REWARD_VND || 2000)),
  ]);
  const botName = String(env.BOT_USERNAME || '').replace(/^@/, '');
  const inviteLink = botName ? `https://t.me/${botName}?start=ref_${user.telegram_id}` : null;
  return json({ inviteLink, referralCode: `ref_${user.telegram_id}`, totalReferrals: count.count, rewardVnd: Number(reward), note: inviteLink ? null : 'Cần cấu hình BOT_USERNAME để tạo liên kết mời.' });
}

async function dailyCheckin(request, env) {
  const { user } = await requireSession(request, env);
  if (!await isFeatureEnabled(env, 'daily_checkin', user.telegram_id)) throw new HttpError(404, 'Daily check-in is disabled', 'FEATURE_DISABLED');
  const day = todayKey();
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT reward_vnd,created_at FROM daily_checkins WHERE user_id=? AND day_key=?').bind(user.id, day).first();
    const reward = await readConfig(env, 'daily_checkin_reward_vnd', Number(env.DAILY_CHECKIN_REWARD_VND || 1000));
    return json({ day, checkedIn: !!row, rewardVnd: Number(reward), checkin: row || null });
  }
  const reward = Math.max(0, Math.min(Number(await readConfig(env, 'daily_checkin_reward_vnd', Number(env.DAILY_CHECKIN_REWARD_VND || 1000))), 1000000));
  const now = nowSeconds();
  const claimResults = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO daily_checkins(user_id,day_key,reward_vnd,created_at) VALUES(?,?,?,?)').bind(user.id, day, reward, now),
    env.DB.prepare('UPDATE users SET balance_vnd=balance_vnd+? WHERE id=? AND changes()=1').bind(reward, user.id),
    env.DB.prepare(`INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
      SELECT ?, 'daily_checkin', ?, ?, 'Điểm danh hàng ngày', ? WHERE changes()=1`).bind(user.id, reward, `CHECKIN:${user.id}:${day}`, now),
  ]);
  if (!Number(claimResults?.[0]?.meta?.changes || 0)) throw new HttpError(409, 'Bạn đã điểm danh hôm nay', 'CHECKIN_ALREADY_CLAIMED');
  return json({ ok: true, rewardVnd: reward, day });
}

async function listTasks(request, env) {
  const { user } = await requireSession(request, env);
  if (!await isFeatureEnabled(env, 'tasks', user.telegram_id)) throw new HttpError(404, 'Tasks are disabled', 'FEATURE_DISABLED');
  const taskConfig = await readConfig(env, 'tasks_config_json', {});
  const maxItems = Math.max(1, Math.min(100, Number(taskConfig?.maxActiveTasks || 20)));
  const rows = (await env.DB.prepare(`SELECT t.id,t.title,t.description,t.task_type,t.target_count,t.reward_vnd,t.is_active,
    COALESCE(ut.status,'in_progress') AS status,COALESCE(ut.progress_count,0) AS manual_progress
    FROM tasks t LEFT JOIN user_tasks ut ON ut.task_id=t.id AND ut.user_id=? WHERE t.is_active=1 ORDER BY t.created_at DESC LIMIT ?`).bind(user.id, maxItems).all()).results;
  const items = await Promise.all(rows.map(async (task) => {
    let progress = Number(task.manual_progress || 0);
    if (task.task_type === 'referrals') progress = (await env.DB.prepare('SELECT COUNT(*) AS count FROM referrals WHERE referrer_user_id=?').bind(user.id).first()).count;
    if (task.task_type === 'purchases') progress = (await env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE user_id=? AND status='completed'").bind(user.id).first()).count;
    return { id: task.id, title: task.title, description: task.description, type: task.task_type, targetCount: task.target_count, progress,
      rewardVnd: task.reward_vnd, status: task.status === 'claimed' ? 'claimed' : progress >= task.target_count ? 'completed' : 'in_progress' };
  }));
  return json({ tasks: items });
}

async function claimTask(request, env, taskId) {
  const { user } = await requireSession(request, env);
  if (!await isFeatureEnabled(env, 'tasks', user.telegram_id)) throw new HttpError(404, 'Tasks are disabled', 'FEATURE_DISABLED');
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id=? AND is_active=1').bind(taskId).first();
  if (!task) throw new HttpError(404, 'Task not found', 'TASK_NOT_FOUND');
  let progress = 0;
  if (task.task_type === 'referrals') progress = (await env.DB.prepare('SELECT COUNT(*) AS count FROM referrals WHERE referrer_user_id=?').bind(user.id).first()).count;
  else if (task.task_type === 'purchases') progress = (await env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE user_id=? AND status='completed'").bind(user.id).first()).count;
  else progress = (await env.DB.prepare("SELECT progress_count FROM user_tasks WHERE task_id=? AND user_id=?").bind(taskId, user.id).first())?.progress_count || 0;
  if (progress < task.target_count) throw new HttpError(409, 'Chưa hoàn thành điều kiện nhiệm vụ', 'TASK_INCOMPLETE');
  const now = nowSeconds();
  const existingLedger = await env.DB.prepare('SELECT 1 AS ok FROM wallet_transactions WHERE reference=?').bind(`TASK:${taskId}:${user.id}`).first();
  if (existingLedger) throw new HttpError(409, 'Nhiệm vụ đã nhận thưởng', 'TASK_ALREADY_CLAIMED');
  const claimResults = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO user_tasks(task_id,user_id,progress_count,status,completed_at) VALUES(?,?,?,'completed',?)").bind(taskId, user.id, progress, now),
    env.DB.prepare("UPDATE user_tasks SET progress_count=?,status='completed',completed_at=COALESCE(completed_at,?) WHERE task_id=? AND user_id=? AND status!='claimed'").bind(progress, now, taskId, user.id),
    env.DB.prepare("UPDATE users SET balance_vnd=balance_vnd+? WHERE id=? AND EXISTS(SELECT 1 FROM user_tasks WHERE task_id=? AND user_id=? AND status='completed') AND NOT EXISTS(SELECT 1 FROM wallet_transactions WHERE reference=?)").bind(task.reward_vnd, user.id, taskId, user.id, `TASK:${taskId}:${user.id}`),
    env.DB.prepare("UPDATE user_tasks SET status='claimed',claimed_at=? WHERE task_id=? AND user_id=? AND status='completed' AND changes()=1").bind(now, taskId, user.id),
    env.DB.prepare(`INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
      SELECT ?, 'task_reward', ?, ?, ?, ? WHERE changes()=1`).bind(user.id, task.reward_vnd, `TASK:${taskId}:${user.id}`, `Thưởng nhiệm vụ: ${task.title}`, now),
  ]);
  if (!Number(claimResults?.[2]?.meta?.changes || 0)) throw new HttpError(409, 'Nhiệm vụ đã nhận thưởng hoặc chưa đủ điều kiện', 'TASK_ALREADY_CLAIMED');
  const ledger = await env.DB.prepare('SELECT 1 AS ok FROM wallet_transactions WHERE reference=?').bind(`TASK:${taskId}:${user.id}`).first();
  if (!ledger) throw new HttpError(500, 'Không ghi được sổ cái phần thưởng nhiệm vụ', 'TASK_LEDGER_FAILED');
  await recordAudit(env, user.telegram_id, 'task.claim', 'task', taskId, { rewardVnd: task.reward_vnd });
  return json({ ok: true, rewardVnd: task.reward_vnd });
}


async function playMinigame(request, env) {
  const { user } = await requireSession(request, env);
  if (!await isFeatureEnabled(env, 'minigame', user.telegram_id) || !(await readConfig(env, 'minigame_enabled', true))) {
    throw new HttpError(404, 'Minigame is disabled', 'FEATURE_DISABLED');
  }
  const day = todayKey();
  if (request.method === 'GET') {
    const previous = await env.DB.prepare('SELECT prize_key,reward_vnd,created_at FROM minigame_spins WHERE user_id=? AND day_key=?').bind(user.id, day).first();
    return json({ day, played: !!previous, result: previous || null });
  }
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const roll = random[0] % 1000;
  const gameConfig = await readConfig(env, 'minigame_config_json', {});
  let prize = null;
  if (Array.isArray(gameConfig?.prizes) && gameConfig.prizes.length) {
    let threshold = 0;
    for (const item of gameConfig.prizes) {
      threshold += Number(item.threshold || 0);
      if (roll < threshold) { prize = { key: String(item.key), reward: Number(item.rewardVnd || 0) }; break; }
    }
  }
  if (!prize && Array.isArray(gameConfig?.prizes)) { const fallback = gameConfig.prizes.find((item) => item.key === 'try_again'); if (fallback) prize = { key: String(fallback.key), reward: Number(fallback.rewardVnd || 0) }; }
  if (!prize) prize = roll < 5 ? { key: 'jackpot', reward: 5000 } : roll < 55 ? { key: 'bonus', reward: 1000 } : roll < 205 ? { key: 'small', reward: 200 } : { key: 'try_again', reward: 0 };
  const now = nowSeconds();
  const spinResults = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO minigame_spins(user_id,day_key,prize_key,reward_vnd,created_at) VALUES(?,?,?,?,?)').bind(user.id, day, prize.key, prize.reward, now),
    env.DB.prepare('UPDATE users SET balance_vnd=balance_vnd+(SELECT reward_vnd FROM minigame_spins WHERE user_id=? AND day_key=?) WHERE id=? AND changes()=1').bind(user.id, day, user.id),
    env.DB.prepare(`INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
      SELECT ?, 'minigame', reward_vnd, ?, 'Vòng quay miễn phí hàng ngày', ? FROM minigame_spins WHERE user_id=? AND day_key=? AND changes()=1`)
      .bind(user.id, `MINIGAME:${user.id}:${day}`, now, user.id, day),
  ]);
  if (!Number(spinResults?.[0]?.meta?.changes || 0)) throw new HttpError(409, 'Bạn đã quay hôm nay', 'MINIGAME_ALREADY_PLAYED');
  const result = await env.DB.prepare('SELECT prize_key,reward_vnd,created_at FROM minigame_spins WHERE user_id=? AND day_key=?').bind(user.id, day).first();
  return json({ ok: true, prizeKey: result.prize_key, rewardVnd: result.reward_vnd, day, playedAt: result.created_at });
}

async function getNotifications(request, env) {
  const { user } = await requireSession(request, env);
  if (!await isFeatureEnabled(env, 'notifications', user.telegram_id)) throw new HttpError(404, 'Notifications are disabled', 'FEATURE_DISABLED');
  const { results } = await env.DB.prepare('SELECT id,title,body,kind,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();
  return json({ notifications: results, unreadCount: results.filter((item) => !item.read_at).length });
}

async function markNotificationRead(request, env, id) {
  const { user } = await requireSession(request, env);
  await env.DB.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL').bind(nowSeconds(), id, user.id).run();
  return json({ ok: true });
}

async function adminTasks(request, env) {
  const { user } = await requireAdmin(request, env);
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    return json({ tasks: results });
  }
  const { value } = await readJson(request);
  const id = typeof value.id === 'string' && /^[a-z0-9_-]{2,80}$/i.test(value.id) ? value.id : crypto.randomUUID();
  const title = assertString(value.title, 'title', 160);
  const description = typeof value.description === 'string' ? value.description.slice(0, 2000) : '';
  const type = ['manual','referrals','purchases'].includes(value.taskType) ? value.taskType : 'manual';
  const taskConfig = await readConfig(env, 'tasks_config_json', {});
  const maxTarget = Math.max(1, Math.min(100000, Number(taskConfig?.maxTargetCount || 100000)));
  const maxReward = Math.max(0, Math.min(1000000000, Number(taskConfig?.maxRewardVnd ?? 1000000000)));
  const target = Number(value.targetCount || 1);
  const reward = Number(value.rewardVnd);
  if (!Number.isInteger(target) || target < 1 || target > maxTarget || !Number.isSafeInteger(reward) || reward < 0 || reward > maxReward) {
    throw new HttpError(400, 'Invalid targetCount or rewardVnd', 'INVALID_TASK');
  }
  const now = nowSeconds();
  await env.DB.prepare(`INSERT INTO tasks(id,title,description,task_type,target_count,reward_vnd,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,task_type=excluded.task_type,target_count=excluded.target_count,reward_vnd=excluded.reward_vnd,is_active=1,updated_at=excluded.updated_at`)
    .bind(id,title,description,type,target,reward,now,now).run();
  await recordAudit(env, user.telegram_id, 'task.upsert', 'task', id, { type, target, reward });
  return json({ ok: true, id }, 201);
}


async function adminCompleteTask(request, env) {
  const { user } = await requireAdmin(request, env);
  const { value } = await readJson(request);
  const taskId = assertString(String(value.taskId || ''), 'taskId', 80);
  const telegramId = assertString(String(value.telegramId || ''), 'telegramId', 24);
  const task = await env.DB.prepare('SELECT id,target_count FROM tasks WHERE id=? AND is_active=1').bind(taskId).first();
  const target = await env.DB.prepare('SELECT id FROM users WHERE telegram_id=?').bind(telegramId).first();
  if (!task || !target) throw new HttpError(404, 'Task or user not found', 'TASK_OR_USER_NOT_FOUND');
  const now = nowSeconds();
  await env.DB.prepare("INSERT INTO user_tasks(task_id,user_id,progress_count,status,completed_at) VALUES(?,?,?,'completed',?) ON CONFLICT(task_id,user_id) DO UPDATE SET progress_count=excluded.progress_count,status=CASE WHEN user_tasks.status='claimed' THEN user_tasks.status ELSE 'completed' END,completed_at=excluded.completed_at")
    .bind(taskId, target.id, task.target_count, now).run();
  await recordAudit(env, user.telegram_id, 'task.complete_manual', 'task', taskId, { telegramId });
  return json({ ok: true, taskId, telegramId });
}

async function adminMaintenance(request, env) {
  const { user } = await requireAdmin(request, env);
  if (request.method === 'GET') {
    return json({ enabled: await readConfig(env, 'maintenance_enabled', false), message: await readConfig(env, 'maintenance_message', 'Hệ thống đang bảo trì.') });
  }
  const { value } = await readJson(request);
  if (typeof value.enabled !== 'boolean') throw new HttpError(400, 'enabled must be boolean', 'INVALID_MAINTENANCE');
  const message = typeof value.message === 'string' ? value.message.trim().slice(0, 500) : 'Hệ thống đang bảo trì, vui lòng quay lại sau.';
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('maintenance_enabled',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(JSON.stringify(value.enabled), user.telegram_id, now),
    env.DB.prepare(`INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('maintenance_message',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(JSON.stringify(message), user.telegram_id, now),
  ]);
  await recordAudit(env, user.telegram_id, 'maintenance.update', 'system', 'maintenance', { enabled: value.enabled });
  return json({ ok: true, enabled: value.enabled, message });
}

async function adminBroadcast(request, env) {
  const { user } = await requireAdmin(request, env);
  const { value } = await readJson(request);
  const title = assertString(value.title, 'title', 160);
  const body = assertString(value.body, 'body', 3500);
  const kind = ['info','success','warning','maintenance'].includes(value.kind) ? value.kind : 'info';
  const id = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const now = nowSeconds();
  const recipientCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE is_banned=0').first();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO notifications(id,user_id,title,body,kind,created_at) SELECT lower(hex(randomblob(16))),id,?,?,?,? FROM users WHERE is_banned=0').bind(title,body,kind,now),
    env.DB.prepare("INSERT INTO queue_jobs(id,job_type,payload_json,status,attempts,available_at,created_at,updated_at) VALUES(?, 'bot_broadcast', ?, 'pending', 0, ?, ?, ?)").bind(jobId, JSON.stringify({ title, body, cursor: '' }), now, now, now),
  ]);
  if (env.JOBS) {
    try { await env.JOBS.send({ jobId }); }
    catch (error) { console.error('queue_send_failed', { error: error?.message || 'unknown' }); }
  }
  await recordAudit(env, user.telegram_id, 'broadcast.create', 'broadcast', id, { recipientCount: recipientCount.count, kind });
  return json({ ok: true, broadcastId: id, recipients: recipientCount.count, queued: !!env.JOBS }, 201);
}

const MANAGED_GITHUB_SECRET_KEYS = new Set([
  'BOT_TOKEN','BOT_WEBHOOK_SECRET','SESSION_SECRET','ADMIN_TELEGRAM_IDS',
  'BANK_WEBHOOK_SECRET','BANK_API_KEY','BANK_API_SECRET','GITHUB_WEBHOOK_SECRET',
  'CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','HENDY_GITHUB_TOKEN',
  'ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD',
  'IOS_CERTIFICATE_BASE64','IOS_CERTIFICATE_PASSWORD','IOS_PROVISIONING_PROFILE_BASE64',
  'WINDOWS_PFX_BASE64','WINDOWS_PFX_PASSWORD','MACOS_CERTIFICATE_BASE64','MACOS_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','SENTRY_AUTH_TOKEN',
]);

async function adminSyncGitHubSecrets(request, env) {
  const { user } = await requireAdmin(request, env);
  const { value } = await readJson(request, 1200 * 1024);
  if (value.confirm !== true) throw new HttpError(400, 'Explicit confirmation is required before syncing repository secrets', 'SYNC_CONFIRMATION_REQUIRED');
  if (!value.secrets || typeof value.secrets !== 'object' || Array.isArray(value.secrets)) throw new HttpError(400, 'secrets must be an object', 'INVALID_SECRETS');
  const entries = Object.entries(value.secrets);
  if (entries.length < 1 || entries.length > MANAGED_GITHUB_SECRET_KEYS.size) throw new HttpError(400, 'Provide at least one supported secret', 'INVALID_SECRETS_COUNT');
  const secrets = {};
  for (const [name, secret] of entries) {
    if (!MANAGED_GITHUB_SECRET_KEYS.has(name)) throw new HttpError(400, `Secret key is not in the allowlist: ${name}`, 'SECRET_KEY_NOT_ALLOWED');
    if (typeof secret !== 'string' || !secret.trim() || new TextEncoder().encode(secret).byteLength > 40 * 1024) {
      throw new HttpError(400, `Secret ${name} must be non-empty and no larger than 40 KiB`, 'INVALID_SECRET_VALUE');
    }
    secrets[name] = secret;
  }
  let synced;
  try { synced = await syncGitHubActionsSecrets(env, secrets); }
  catch (error) {
    console.warn('github_secret_sync_failed', { error: String(error?.message || 'unknown').slice(0, 180), count: entries.length });
    throw new HttpError(502, 'Không thể đồng bộ secrets lên GitHub. Kiểm tra token/quyền Actions và public key repo.', 'GITHUB_SECRET_SYNC_FAILED');
  }
  const now = nowSeconds();
  await env.DB.batch(synced.map((name) => env.DB.prepare('INSERT INTO central_config_secrets(secret_key,updated_by,updated_at) VALUES(?,?,?) ON CONFLICT(secret_key) DO UPDATE SET updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(name, user.telegram_id, now)));
  await recordAudit(env, user.telegram_id, 'github.secrets_sync', 'repository', `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, { keys: synced, count: synced.length });
  return json({ ok: true, count: synced.length, syncedKeys: synced });
}

async function adminSystemUpdate(request, env) {
  const { user } = await requireAdmin(request, env);
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) throw new HttpError(503, 'Chưa cấu hình quyền chạy quy trình GitHub Actions', 'GITHUB_NOT_CONFIGURED');
  const { value } = await readJson(request);
  const workflows = { ci: 'ci-test.yml', workers: 'deploy-workers.yml', miniapp: 'deploy-miniapp.yml', web: 'deploy-web.yml' };
  const workflow = workflows[String(value.workflow || '')];
  if (!workflow) throw new HttpError(400, 'Quy trình này không nằm trong danh sách được phép', 'WORKFLOW_NOT_ALLOWED');
  try {
    const result = await dispatchGitHubWorkflow(env, workflow, {});
    await recordAudit(env, user.telegram_id, 'system.workflow_dispatch', 'workflow', workflow, {});
    return json({ ok: true, ...result }, 202);
  } catch (error) {
    console.warn('github_dispatch_failed', { workflow, error: String(error?.message || 'unknown').slice(0, 180) });
    throw new HttpError(502, 'GitHub không chấp nhận yêu cầu chạy quy trình', 'WORKFLOW_DISPATCH_FAILED');
  }
}


export async function isMaintenanceEnabled(env) {
  return Boolean(await readConfig(env, 'maintenance_enabled', false));
}

export async function routeFeatureApi(request, env, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (path === '/api/features' && method === 'GET') return getFeatures(request, env);
  if (path === '/api/referral' && method === 'GET') return referralProfile(request, env);
  if (path === '/api/checkin' && ['GET','POST'].includes(method)) return dailyCheckin(request, env);
  if (path === '/api/tasks' && method === 'GET') return listTasks(request, env);
  if (path === '/api/minigames/spin' && ['GET','POST'].includes(method)) return playMinigame(request, env);
  if (path === '/api/notifications' && method === 'GET') return getNotifications(request, env);
  const taskClaim = path.match(/^\/api\/tasks\/([a-zA-Z0-9_-]{2,80})\/claim$/);
  if (taskClaim && method === 'POST') return claimTask(request, env, taskClaim[1]);
  const notificationRead = path.match(/^\/api\/notifications\/([a-zA-Z0-9-]{1,80})\/read$/);
  if (notificationRead && method === 'POST') return markNotificationRead(request, env, notificationRead[1]);
  if (path === '/api/admin/features' && ['GET','PUT','POST'].includes(method)) return adminFeatures(request, env);
  if (path === '/api/admin/github-secrets' && method === 'POST') return adminSyncGitHubSecrets(request, env);
  if (path === '/api/admin/tasks' && ['GET','POST'].includes(method)) return adminTasks(request, env);
  if (path === '/api/admin/tasks/complete' && method === 'POST') return adminCompleteTask(request, env);
  if (path === '/api/admin/maintenance' && ['GET','POST'].includes(method)) return adminMaintenance(request, env);
  if (path === '/api/admin/broadcast' && method === 'POST') return adminBroadcast(request, env);
  if (path === '/api/admin/system-update' && method === 'POST') return adminSystemUpdate(request, env);
  return null;
}
