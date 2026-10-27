import { HttpError, readJson, assertString, nowSeconds, json, safeEqual } from '../utils/http.js';
import { validateTelegramInitData } from '../auth/telegram.js';
import { signSession, requireSession, requireAdmin, isAdmin } from '../auth/session.js';
import { hmacBytes, bytesToHex } from '../utils/crypto.js';
import { signDownloadTicket, verifyDownloadTicket } from '../auth/ticket.js';
import { routeFeatureApi, isMaintenanceEnabled, isFeatureEnabled } from './features.js';
import { recordAudit } from '../services/d1-logger.js';
import { dispatchGitHubWorkflow, getGitHubActionsVariables, listGitHubActionsSecretNames, syncGitHubActionsSecrets, syncGitHubActionsVariables } from '../services/github-api.js';

const VND = new Intl.NumberFormat('vi-VN');

async function authenticate(request, env) {
  const { value } = await readJson(request);
  const telegramUser = await validateTelegramInitData(value.initData, env.BOT_TOKEN, Number(env.MAX_INIT_DATA_AGE_SECONDS || 86400));
  const now = nowSeconds();
  await env.DB.prepare(`INSERT INTO users (telegram_id, username, first_name, last_name, language_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name,
      last_name=excluded.last_name, language_code=excluded.language_code, updated_at=excluded.updated_at`)
    .bind(telegramUser.id, telegramUser.username || null, telegramUser.first_name || '', telegramUser.last_name || '', telegramUser.language_code || null, now, now).run();
  const dbUser = await env.DB.prepare('SELECT id, telegram_id, username, first_name, last_name, balance_vnd, total_spent_vnd, vip_level, is_banned FROM users WHERE telegram_id = ?').bind(telegramUser.id).first();
  if (!dbUser || dbUser.is_banned) throw new HttpError(403, 'Account is blocked', 'ACCOUNT_BLOCKED');
  const initParams = new URLSearchParams(String(value.initData || ''));
  const startParam = initParams.get('start_param') || '';
  const referralMatch = startParam.match(/^ref_(\d{1,24})$/);
  if (referralMatch && referralMatch[1] !== String(telegramUser.id)) {
    const referrer = await env.DB.prepare('SELECT id FROM users WHERE telegram_id=?').bind(referralMatch[1]).first();
    if (referrer) {
      const reward = Math.max(0, Math.min(Number(env.REFERRAL_REWARD_VND || 2000), 1000000));
      const nowReferral = nowSeconds();
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO referrals(referrer_user_id,referred_user_id,reward_vnd,created_at) VALUES(?,?,?,?)').bind(referrer.id, dbUser.id, reward, nowReferral),
        env.DB.prepare('UPDATE users SET balance_vnd=balance_vnd+? WHERE id=? AND changes()=1').bind(reward, referrer.id),
        env.DB.prepare('UPDATE referrals SET rewarded_at=? WHERE referrer_user_id=? AND referred_user_id=? AND rewarded_at IS NULL AND changes()=1').bind(nowReferral, referrer.id, dbUser.id),
        env.DB.prepare("INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at) SELECT ?, 'referral', ?, ?, 'Thưởng giới thiệu bạn mới', ? WHERE EXISTS(SELECT 1 FROM referrals WHERE referrer_user_id=? AND referred_user_id=? AND rewarded_at=?)").bind(referrer.id, reward, `REFERRAL:${referrer.id}:${dbUser.id}`, nowReferral, referrer.id, dbUser.id, nowReferral),
      ]);
    }
  }
  const ttl = Math.min(Math.max(Number(env.SESSION_TTL_SECONDS || 3600), 300), 86400);
  const token = await signSession({ telegramId: telegramUser.id }, env.SESSION_SECRET, ttl);
  return json({ token, expiresIn: ttl, user: { ...dbUser, isAdmin: isAdmin(dbUser.telegram_id, env) } });
}

async function listProducts(env) {
  const { results } = await env.DB.prepare(`SELECT p.id, p.title, p.description, p.category, p.price_vnd, p.kind,
    (SELECT COUNT(*) FROM code_inventory ci WHERE ci.product_id=p.id AND ci.sold_at IS NULL AND ci.order_id IS NULL) AS stock
    FROM products p WHERE p.is_active=1 ORDER BY p.category, p.created_at DESC`).all();
  return json({ products: results });
}

async function getMe(request, env) {
  const { user } = await requireSession(request, env);
  return json({ user: { ...user, isAdmin: isAdmin(user.telegram_id, env) } });
}

async function getVip(request, env) {
  const { user } = await requireSession(request, env);
  const levels = [
    { id: 'bronze', label: 'Đồng', minSpendVnd: 0, nextSpendVnd: 500000 },
    { id: 'silver', label: 'Bạc', minSpendVnd: 500000, nextSpendVnd: 2000000 },
    { id: 'gold', label: 'Vàng', minSpendVnd: 2000000, nextSpendVnd: 5000000 },
    { id: 'platinum', label: 'Bạch kim', minSpendVnd: 5000000, nextSpendVnd: null },
  ];
  const level = levels.find((item) => item.id === user.vip_level) || levels[0];
  const next = level.nextSpendVnd;
  return json({ level, totalSpentVnd: user.total_spent_vnd || 0, nextLevel: next === null ? null : levels[levels.indexOf(level) + 1],
    remainingVnd: next === null ? 0 : Math.max(0, next - (user.total_spent_vnd || 0)), levels });
}

async function getWallet(request, env) {
  const { user } = await requireSession(request, env);
  const { results } = await env.DB.prepare('SELECT id, kind, amount_vnd, reference, note, created_at FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
  return json({ balanceVnd: user.balance_vnd, transactions: results });
}

async function getOrders(request, env) {
  const { user } = await requireSession(request, env);
  const { results } = await env.DB.prepare(`SELECT o.order_id, o.amount_vnd, o.status, o.created_at, o.completed_at, p.title
    FROM orders o JOIN products p ON p.id=o.product_id WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 50`).bind(user.id).all();
  return json({ orders: results });
}

async function buyProduct(request, env) {
  const { user } = await requireSession(request, env);
  const { value } = await readJson(request);
  const productId = assertString(value.productId, 'productId', 80);
  const idempotencyKey = assertString(value.requestId, 'requestId', 100);
  const now = nowSeconds();
  const orderId = crypto.randomUUID();

  // The D1 batch is atomic. Price comes from D1; client-supplied amounts are ignored.
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO orders(order_id,user_id,product_id,idempotency_key,amount_vnd,status,created_at)
      SELECT ?, u.id, p.id, ?, p.price_vnd, 'pending', ? FROM users u JOIN products p ON p.id=?
      WHERE u.id=? AND u.is_banned=0 AND p.is_active=1 AND u.balance_vnd>=p.price_vnd
        AND EXISTS(SELECT 1 FROM code_inventory ci WHERE ci.product_id=p.id AND ci.sold_at IS NULL AND ci.order_id IS NULL)`)
      .bind(orderId, idempotencyKey, now, productId, user.id),
    env.DB.prepare(`UPDATE code_inventory SET order_id=? WHERE id=(SELECT ci.id FROM code_inventory ci JOIN orders o ON o.order_id=?
      WHERE ci.product_id=? AND ci.sold_at IS NULL AND ci.order_id IS NULL AND o.status='pending' ORDER BY ci.id LIMIT 1)
      AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND status='pending')`)
      .bind(orderId, orderId, productId, orderId),
    env.DB.prepare(`UPDATE users SET balance_vnd=balance_vnd-(SELECT amount_vnd FROM orders WHERE order_id=?)
      WHERE id=? AND balance_vnd >= (SELECT amount_vnd FROM orders WHERE order_id=?)
      AND EXISTS(SELECT 1 FROM code_inventory WHERE order_id=? AND sold_at IS NULL)`)
      .bind(orderId, user.id, orderId, orderId),
    env.DB.prepare(`UPDATE users SET total_spent_vnd=total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?),
      vip_level=CASE WHEN total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?)>=5000000 THEN 'platinum'
        WHEN total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?)>=2000000 THEN 'gold'
        WHEN total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?)>=500000 THEN 'silver' ELSE 'bronze' END
      WHERE id=? AND changes()=1`).bind(orderId, orderId, orderId, orderId, user.id),
    env.DB.prepare('UPDATE code_inventory SET sold_at=? WHERE order_id=? AND sold_at IS NULL AND changes()=1').bind(now, orderId),
    env.DB.prepare('UPDATE code_inventory SET order_id=NULL WHERE order_id=? AND sold_at IS NULL AND changes()=0').bind(orderId),
    env.DB.prepare(`UPDATE orders SET status='completed', completed_at=? WHERE order_id=? AND status='pending'
      AND EXISTS(SELECT 1 FROM code_inventory WHERE order_id=? AND sold_at=?)`).bind(now, orderId, orderId, now),
    env.DB.prepare(`INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
      SELECT user_id,'purchase',-amount_vnd,order_id,'Mua sản phẩm: ' || product_id,? FROM orders WHERE order_id=? AND status='completed'`)
      .bind(now, orderId),
  ]);

  const order = await env.DB.prepare(`SELECT o.order_id,o.amount_vnd,o.status,o.created_at,p.title,
    ci.secret_value AS delivery FROM orders o JOIN products p ON p.id=o.product_id
    LEFT JOIN code_inventory ci ON ci.order_id=o.order_id WHERE o.user_id=? AND o.idempotency_key=?`)
    .bind(user.id, idempotencyKey).first();
  if (!order) throw new HttpError(409, 'Không đủ số dư hoặc sản phẩm đã hết hàng', 'PURCHASE_UNAVAILABLE');
  if (order.status !== 'completed' || !order.delivery) {
    throw new HttpError(409, 'Không thể hoàn tất đơn hàng. Số dư chưa bị trừ nếu đơn không hoàn tất; hãy tải lại và thử lại.', 'PURCHASE_NOT_COMPLETED');
  }
  return json({ order: { orderId: order.order_id, title: order.title, amountVnd: order.amount_vnd, createdAt: order.created_at }, delivery: order.delivery, message: 'Mua hàng thành công' });
}

async function createDeposit(request, env) {
  const { user } = await requireSession(request, env);
  const { value } = await readJson(request);
  const amount = Number(value.amountVnd);
  const min = Number(env.MIN_DEPOSIT_VND || 10000); const max = Number(env.MAX_DEPOSIT_VND || 100000000);
  if (!Number.isSafeInteger(amount) || amount < min || amount > max) throw new HttpError(400, `Số tiền phải từ ${VND.format(min)} đến ${VND.format(max)} VNĐ`, 'INVALID_AMOUNT');
  const now = nowSeconds();
  const depositId = crypto.randomUUID();
  const reference = `HENDY${String(user.telegram_id).slice(-6)}${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  await env.DB.prepare('INSERT INTO deposit_requests(id,user_id,reference,amount_vnd,status,created_at,updated_at) VALUES(?,?,?,? ,\'pending\',?,?)')
    .bind(depositId, user.id, reference, amount, now, now).run();
  let qrUrl = null;
  if (env.BANK_ID && env.BANK_ACCOUNT_NUMBER) {
    const params = new URLSearchParams({ amount: String(amount), addInfo: reference });
    if (env.BANK_ACCOUNT_NAME) params.set('accountName', env.BANK_ACCOUNT_NAME);
    qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(env.BANK_ID)}-${encodeURIComponent(env.BANK_ACCOUNT_NUMBER)}-compact2.png?${params}`;
  }
  return json({ deposit: { id: depositId, reference, amountVnd: amount, status: 'pending', qrUrl, createdAt: now } }, 201);
}

async function bankWebhook(request, env, rawBody) {
  if (!env.BANK_WEBHOOK_SECRET) throw new HttpError(503, 'Bank webhook is not configured', 'WEBHOOK_NOT_CONFIGURED');
  const signature = (request.headers.get('x-signature') || '').replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(signature)) throw new HttpError(401, 'Invalid webhook signature', 'INVALID_SIGNATURE');
  const expected = bytesToHex(await hmacBytes(env.BANK_WEBHOOK_SECRET, rawBody));
  if (!safeEqual(signature, expected)) {
    throw new HttpError(401, 'Invalid webhook signature', 'INVALID_SIGNATURE');
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { throw new HttpError(400, 'Invalid webhook JSON', 'INVALID_JSON'); }
  const transactionId = assertString(String(event.transactionId || ''), 'transactionId', 160);
  const reference = assertString(String(event.reference || ''), 'reference', 100);
  const amount = Number(event.amount);
  if (event.direction !== 'credit' || !Number.isSafeInteger(amount) || amount <= 0) return json({ ok: true, ignored: true });
  const digest = bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawBody)));
  const now = nowSeconds();
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE users SET balance_vnd=balance_vnd+(SELECT amount_vnd FROM deposit_requests WHERE reference=? AND status='pending' AND amount_vnd=?), updated_at=?
      WHERE id=(SELECT user_id FROM deposit_requests WHERE reference=? AND status='pending' AND amount_vnd=?)
      AND EXISTS(SELECT 1 FROM deposit_requests WHERE reference=? AND status='pending' AND amount_vnd=?)`)
      .bind(reference, amount, now, reference, amount, reference, amount),
    env.DB.prepare(`UPDATE deposit_requests SET status='credited',provider_tx_id=?,updated_at=? WHERE reference=? AND status='pending' AND amount_vnd=? AND changes()=1`)
      .bind(transactionId, now, reference, amount),
    env.DB.prepare(`INSERT OR IGNORE INTO bank_webhook_events(provider_tx_id,reference,raw_event_hash,received_at)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM deposit_requests WHERE reference=? AND status='credited' AND provider_tx_id=?)`)
      .bind(transactionId, reference, digest, now, reference, transactionId),
    env.DB.prepare(`INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
      SELECT user_id,'deposit',amount_vnd,provider_tx_id,'Nạp tiền ngân hàng',? FROM deposit_requests WHERE reference=? AND status='credited' AND provider_tx_id=?`)
      .bind(now, reference, transactionId),
  ]);
  const deposit = await env.DB.prepare('SELECT status,amount_vnd,provider_tx_id FROM deposit_requests WHERE reference=?').bind(reference).first();
  if (!deposit || deposit.amount_vnd !== amount) return json({ ok: true, ignored: true });
  if (deposit.provider_tx_id === transactionId && deposit.status === 'credited') return json({ ok: true, credited: true, duplicateSafe: true });
  return json({ ok: true, credited: false, ignored: true });
}

async function redeemGiftcode(request, env) {
  const { user } = await requireSession(request, env);
  const { value } = await readJson(request);
  const code = assertString(String(value.code || '').toUpperCase(), 'code', 80);
  const now = nowSeconds();
  const gift = await env.DB.prepare('SELECT id,amount_vnd FROM giftcodes WHERE code=? COLLATE NOCASE AND is_active=1 AND used_count<max_uses AND (expires_at IS NULL OR expires_at>?)').bind(code, now).first();
  if (!gift) throw new HttpError(404, 'Gifcode không hợp lệ, đã hết lượt hoặc hết hạn', 'GIFTCODE_INVALID');
  const alreadyRedeemed = await env.DB.prepare('SELECT 1 AS yes FROM giftcode_redemptions WHERE giftcode_id=? AND user_id=?').bind(gift.id, user.id).first();
  if (alreadyRedeemed) throw new HttpError(409, 'Gifcode này đã được tài khoản sử dụng', 'GIFTCODE_USED');
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO giftcode_redemptions(giftcode_id,user_id,redeemed_at)
      SELECT id,?,? FROM giftcodes WHERE id=? AND is_active=1 AND used_count<max_uses AND (expires_at IS NULL OR expires_at>?)`)
      .bind(user.id, now, gift.id, now),
    env.DB.prepare('UPDATE giftcodes SET used_count=used_count+1 WHERE id=? AND changes()=1 AND used_count<max_uses').bind(gift.id),
    env.DB.prepare('UPDATE users SET balance_vnd=balance_vnd+(SELECT amount_vnd FROM giftcodes WHERE id=?) WHERE id=? AND changes()=1').bind(gift.id, user.id),
    env.DB.prepare(`INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
      SELECT ?, 'giftcode', amount_vnd, 'GIFT:' || ? || ':' || ?, 'Đổi gifcode', ? FROM giftcodes WHERE id=? AND EXISTS(SELECT 1 FROM giftcode_redemptions WHERE giftcode_id=? AND user_id=?)`)
      .bind(user.id, gift.id, user.id, now, gift.id, gift.id, user.id),
  ]);
  const redeemed = await env.DB.prepare('SELECT 1 AS ok FROM giftcode_redemptions WHERE giftcode_id=? AND user_id=?').bind(gift.id, user.id).first();
  const ledger = await env.DB.prepare('SELECT 1 AS ok FROM wallet_transactions WHERE user_id=? AND reference=?').bind(user.id, `GIFT:${gift.id}:${user.id}`).first();
  if (!redeemed || !ledger) throw new HttpError(409, 'Gifcode đã được sử dụng hoặc hết lượt', 'GIFTCODE_USED');
  const updated = await env.DB.prepare('SELECT balance_vnd FROM users WHERE id=?').bind(user.id).first();
  return json({ ok: true, amountVnd: gift.amount_vnd, balanceVnd: updated.balance_vnd });
}

async function adminOverview(request, env) {
  await requireAdmin(request, env);
  const [users, products, orders, deposits] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM products').first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE status='completed'").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM deposit_requests WHERE status='pending'").first(),
  ]);
  return json({ stats: { users: users.count, products: products.count, completedOrders: orders.count, pendingDeposits: deposits.count } });
}

async function adminProducts(request, env) {
  await requireAdmin(request, env);
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT p.*, (SELECT COUNT(*) FROM code_inventory ci WHERE ci.product_id=p.id AND ci.sold_at IS NULL AND ci.order_id IS NULL) AS stock
      FROM products p ORDER BY p.created_at DESC`).all();
    return json({ products: results });
  }
  const { user } = await requireAdmin(request, env);
  const { value } = await readJson(request);
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim().slice(0,80) : crypto.randomUUID();
  const title = assertString(value.title, 'title', 160);
  const category = typeof value.category === 'string' ? value.category.trim().slice(0,80) || 'Khác' : 'Khác';
  const description = typeof value.description === 'string' ? value.description.slice(0,2000) : '';
  const price = Number(value.priceVnd);
  if (!Number.isSafeInteger(price) || price < 0 || price > 1000000000) throw new HttpError(400, 'Invalid priceVnd', 'INVALID_AMOUNT');
  const kind = value.kind === 'link' ? 'link' : 'code';
  const active = value.isActive === false ? 0 : 1;
  const now = nowSeconds();
  await env.DB.prepare(`INSERT INTO products(id,title,description,category,price_vnd,kind,is_active,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,
    price_vnd=excluded.price_vnd,kind=excluded.kind,is_active=excluded.is_active,updated_at=excluded.updated_at`)
    .bind(id, title, description, category, price, kind, active, now, now).run();
  await recordAudit(env, user.telegram_id, 'product.upsert', 'product', id, { title, priceVnd: price, kind });
  return json({ ok: true, id }, 201);
}

async function adminStock(request, env) {
  const { user } = await requireAdmin(request, env);
  const { value } = await readJson(request, 256 * 1024);
  const productId = assertString(value.productId, 'productId', 80);
  if (!Array.isArray(value.codes) || value.codes.length < 1 || value.codes.length > 500) throw new HttpError(400, 'codes must contain 1–500 entries', 'INVALID_CODES');
  const product = await env.DB.prepare('SELECT id FROM products WHERE id=?').bind(productId).first();
  if (!product) throw new HttpError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
  const now = nowSeconds();
  const values = value.codes.map((code) => {
    if (typeof code !== 'string' || !code.trim() || code.length > 4000) throw new HttpError(400, 'Each inventory code must be a non-empty string no longer than 4000 characters', 'INVALID_CODES');
    return env.DB.prepare('INSERT INTO code_inventory(product_id,secret_value,created_at) VALUES(?,?,?)').bind(productId, code.trim(), now);
  });
  for (let i = 0; i < values.length; i += 50) await env.DB.batch(values.slice(i, i + 50));
  await recordAudit(env, user.telegram_id, 'inventory.import', 'product', productId, { count: values.length });
  return json({ ok: true, imported: values.length }, 201);
}

async function adminGiftcode(request, env) {
  const { user } = await requireAdmin(request, env);
  const { value } = await readJson(request);
  const code = assertString(String(value.code || '').toUpperCase(), 'code', 80);
  const amount = Number(value.amountVnd); const maxUses = Number(value.maxUses || 1);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000 || !Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 100000) {
    throw new HttpError(400, 'Invalid amountVnd or maxUses', 'INVALID_GIFTCODE');
  }
  const id = crypto.randomUUID(); const now = nowSeconds();
  await env.DB.prepare('INSERT INTO giftcodes(id,code,amount_vnd,max_uses,expires_at,is_active,created_at) VALUES(?,?,?,?,?,1,?)')
    .bind(id, code, amount, maxUses, Number.isSafeInteger(Number(value.expiresAt)) ? Number(value.expiresAt) : null, now).run();
  await recordAudit(env, user.telegram_id, 'giftcode.create', 'giftcode', id, { amountVnd: amount, maxUses });
  return json({ ok: true, id, code }, 201);
}

async function adminUsers(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare('SELECT telegram_id,username,first_name,last_name,balance_vnd,total_spent_vnd,vip_level,is_banned,created_at FROM users ORDER BY created_at DESC LIMIT 100').all();
  return json({ users: results });
}

async function releases(request, env, platform) {
  const subject = request.headers.get('cf-connecting-ip') || 'public-release-list';
  if (!await isFeatureEnabled(env, 'app_releases', subject)) return json({ releases: [] });
  const valid = ['android','ios','windows','macos'];
  if (platform && !valid.includes(platform)) throw new HttpError(400, 'Invalid platform', 'INVALID_PLATFORM');
  const stmt = platform
    ? env.DB.prepare('SELECT id,platform,version,build_number,file_name,size_bytes,sha256,notes,created_at FROM app_releases WHERE platform=? AND is_active=1 ORDER BY created_at DESC LIMIT 1').bind(platform)
    : env.DB.prepare('SELECT id,platform,version,build_number,file_name,size_bytes,sha256,notes,created_at FROM app_releases WHERE is_active=1 ORDER BY created_at DESC');
  const result = platform ? await stmt.first() : (await stmt.all()).results;
  return json({ releases: result });
}


const RELEASE_PART_SIZE = 8 * 1024 * 1024;
const MAX_RELEASE_SIZE = 2 * 1024 * 1024 * 1024;

function releaseContentType(fileName) {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return ({
    '.apk': 'application/vnd.android.package-archive',
    '.aab': 'application/octet-stream',
    '.ipa': 'application/octet-stream',
    '.exe': 'application/vnd.microsoft.portable-executable',
    '.msix': 'application/msix',
    '.dmg': 'application/x-apple-diskimage',
    '.pkg': 'application/octet-stream',
  })[extension] || 'application/octet-stream';
}

function validateReleaseFile(platform, fileName) {
  const extensions = { android: ['.apk', '.aab'], ios: ['.ipa'], windows: ['.exe', '.msix'], macos: ['.dmg', '.pkg'] };
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (!extensions[platform]?.includes(extension)) throw new HttpError(400, `File extension not allowed for ${platform}`, 'INVALID_FILE_TYPE');
}

async function adminReleases(request, env) {
  const { user } = await requireAdmin(request, env);
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT id,platform,version,build_number,file_name,content_type,size_bytes,sha256,notes,is_active,created_at
      FROM app_releases ORDER BY created_at DESC LIMIT 100`).all();
    return json({ releases: results });
  }
  if (!env.ARTIFACTS) throw new HttpError(503, 'R2 ARTIFACTS binding is not configured', 'R2_NOT_CONFIGURED');
  const { value } = await readJson(request);
  const platform = String(value.platform || '');
  const version = String(value.version || '').trim();
  const buildNumber = Number(value.buildNumber || 1);
  const notes = typeof value.notes === 'string' ? value.notes.slice(0, 4000) : '';
  const sizeBytes = Number(value.sizeBytes);
  const originalName = assertString(value.fileName, 'fileName', 240).split(/[\\/]/).pop();
  const fileName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'artifact.bin';
  if (!['android','ios','windows','macos'].includes(platform)) throw new HttpError(400, 'Invalid platform', 'INVALID_PLATFORM');
  if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/.test(version)) throw new HttpError(400, 'Invalid version string', 'INVALID_VERSION');
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) throw new HttpError(400, 'Invalid build number', 'INVALID_BUILD');
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_RELEASE_SIZE) throw new HttpError(400, 'File size must be between 1 byte and 2 GiB', 'INVALID_FILE_SIZE');
  validateReleaseFile(platform, fileName);
  const duplicate = await env.DB.prepare('SELECT id FROM app_releases WHERE platform=? AND version=?').bind(platform, version).first();
  if (duplicate) throw new HttpError(409, 'A release with this platform/version already exists', 'RELEASE_VERSION_EXISTS');
  const id = crypto.randomUUID(); const now = nowSeconds();
  const key = `releases/${platform}/${version}/${id}-${fileName}`;
  const contentType = releaseContentType(fileName);
  const multipart = await env.ARTIFACTS.createMultipartUpload(key, { httpMetadata: { contentType }, customMetadata: { platform, version, buildNumber: String(buildNumber) } });
  try {
    await env.DB.prepare(`INSERT INTO release_uploads(id,r2_key,r2_upload_id,platform,version,build_number,file_name,content_type,size_bytes,notes,admin_telegram_id,status,created_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'uploading',?,?)`)
      .bind(id, key, multipart.uploadId, platform, version, buildNumber, fileName, contentType, sizeBytes, notes, user.telegram_id, now, now + 3600).run();
  } catch (error) {
    await multipart.abort().catch(() => {});
    throw error;
  }
  await recordAudit(env, user.telegram_id, 'release.upload_start', 'release_upload', id, { platform, version, sizeBytes });
  return json({ uploadSessionId: id, partSizeBytes: RELEASE_PART_SIZE, totalParts: Math.ceil(sizeBytes / RELEASE_PART_SIZE), expiresInSeconds: 3600 }, 201);
}

async function uploadReleasePart(request, env, sessionId, partNumber) {
  const { user } = await requireAdmin(request, env);
  const session = await env.DB.prepare('SELECT * FROM release_uploads WHERE id=?').bind(sessionId).first();
  if (!session || session.admin_telegram_id !== user.telegram_id) throw new HttpError(404, 'Upload session not found', 'UPLOAD_NOT_FOUND');
  if (session.status !== 'uploading' || session.expires_at <= nowSeconds()) throw new HttpError(409, 'Upload session expired or closed', 'UPLOAD_CLOSED');
  const totalParts = Math.ceil(session.size_bytes / RELEASE_PART_SIZE);
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > totalParts) throw new HttpError(400, 'Invalid part number', 'INVALID_PART_NUMBER');
  const expectedSize = partNumber < totalParts ? RELEASE_PART_SIZE : session.size_bytes - RELEASE_PART_SIZE * (totalParts - 1);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength && declaredLength !== expectedSize) throw new HttpError(400, 'Chunk size does not match the expected part size', 'INVALID_PART_SIZE');
  if (!request.body) throw new HttpError(400, 'Upload part body is empty', 'EMPTY_PART');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== expectedSize) throw new HttpError(400, 'Chunk size does not match the expected part size', 'INVALID_PART_SIZE');
  const upload = env.ARTIFACTS.resumeMultipartUpload(session.r2_key, session.r2_upload_id);
  let result;
  try { result = await upload.uploadPart(partNumber, bytes); }
  catch { throw new HttpError(400, 'R2 rejected this upload part; retry the part', 'PART_UPLOAD_FAILED'); }
  await env.DB.prepare(`INSERT INTO release_upload_parts(upload_session_id,part_number,etag,size_bytes,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(upload_session_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes,created_at=excluded.created_at`)
    .bind(sessionId, partNumber, result.etag, bytes.byteLength, nowSeconds()).run();
  return json({ partNumber, etag: result.etag, sizeBytes: bytes.byteLength });
}

async function completeReleaseUpload(request, env, sessionId) {
  const { user } = await requireAdmin(request, env);
  const session = await env.DB.prepare('SELECT * FROM release_uploads WHERE id=?').bind(sessionId).first();
  if (!session || session.admin_telegram_id !== user.telegram_id) throw new HttpError(404, 'Upload session not found', 'UPLOAD_NOT_FOUND');
  if (session.status === 'completed' && session.release_id) return json({ ok: true, releaseId: session.release_id, duplicateSafe: true });
  if (session.status !== 'uploading' || session.expires_at <= nowSeconds()) throw new HttpError(409, 'Upload session expired or closed', 'UPLOAD_CLOSED');
  const { results: rows } = await env.DB.prepare('SELECT part_number,etag,size_bytes FROM release_upload_parts WHERE upload_session_id=? ORDER BY part_number').bind(sessionId).all();
  const totalParts = Math.ceil(session.size_bytes / RELEASE_PART_SIZE);
  if (rows.length !== totalParts || rows.some((part, index) => part.part_number !== index + 1)) throw new HttpError(409, 'Some upload parts are missing; upload them before completing', 'PARTS_INCOMPLETE');
  if (rows.reduce((sum, part) => sum + part.size_bytes, 0) !== session.size_bytes) throw new HttpError(409, 'Uploaded size does not match the declared size', 'UPLOAD_SIZE_MISMATCH');
  const upload = env.ARTIFACTS.resumeMultipartUpload(session.r2_key, session.r2_upload_id);
  let object;
  try { object = await upload.complete(rows.map((part) => ({ partNumber: part.part_number, etag: part.etag }))); }
  catch { throw new HttpError(400, 'R2 could not complete this release upload', 'UPLOAD_COMPLETION_FAILED'); }
  const releaseId = crypto.randomUUID(); const now = nowSeconds();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO app_releases(id,platform,version,build_number,r2_key,sha256,notes,is_active,created_at,file_name,content_type,size_bytes)
        VALUES(?,?,?,?,?,NULL,?,0,?,?,?,?)`)
        .bind(releaseId, session.platform, session.version, session.build_number, session.r2_key, session.notes, now, session.file_name, session.content_type, session.size_bytes),
      env.DB.prepare("UPDATE release_uploads SET status='completed',release_id=? WHERE id=? AND status='uploading'").bind(releaseId, sessionId),
      env.DB.prepare('INSERT INTO audit_logs(actor_telegram_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,?,?,?,?)')
        .bind(user.telegram_id, 'release.upload_complete', 'release', releaseId, JSON.stringify({ platform: session.platform, version: session.version, sizeBytes: session.size_bytes, etag: object.httpEtag }), now),
    ]);
  } catch (error) {
    await env.ARTIFACTS.delete(session.r2_key).catch(() => {});
    await env.DB.prepare("UPDATE release_uploads SET status='aborted' WHERE id=?").bind(sessionId).run().catch(() => {});
    throw error;
  }
  return json({ ok: true, release: { id: releaseId, platform: session.platform, version: session.version, buildNumber: session.build_number, fileName: session.file_name, sizeBytes: session.size_bytes, active: false } }, 201);
}

async function abortReleaseUpload(request, env, sessionId) {
  const { user } = await requireAdmin(request, env);
  const session = await env.DB.prepare('SELECT * FROM release_uploads WHERE id=?').bind(sessionId).first();
  if (!session || session.admin_telegram_id !== user.telegram_id) throw new HttpError(404, 'Upload session not found', 'UPLOAD_NOT_FOUND');
  if (session.status === 'completed') throw new HttpError(409, 'Completed upload cannot be aborted', 'UPLOAD_CLOSED');
  if (session.status === 'uploading') {
    try { await env.ARTIFACTS.resumeMultipartUpload(session.r2_key, session.r2_upload_id).abort(); }
    catch { throw new HttpError(503, 'Could not abort the R2 upload; the cleanup job will retry', 'UPLOAD_ABORT_FAILED'); }
    await env.DB.batch([
      env.DB.prepare("UPDATE release_uploads SET status='aborted' WHERE id=? AND status='uploading'").bind(sessionId),
      env.DB.prepare('DELETE FROM release_upload_parts WHERE upload_session_id=?').bind(sessionId),
    ]);
  }
  return json({ ok: true });
}

async function activateRelease(request, env, releaseId) {
  const { user } = await requireAdmin(request, env);
  const release = await env.DB.prepare('SELECT id,platform,version FROM app_releases WHERE id=?').bind(releaseId).first();
  if (!release) throw new HttpError(404, 'Release not found', 'RELEASE_NOT_FOUND');
  await env.DB.batch([
    env.DB.prepare('UPDATE app_releases SET is_active=0 WHERE platform=?').bind(release.platform),
    env.DB.prepare('UPDATE app_releases SET is_active=1 WHERE id=?').bind(releaseId),
    env.DB.prepare('INSERT INTO audit_logs(actor_telegram_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,?,?,?,?)')
      .bind(user.telegram_id, 'release.activate', 'release', releaseId, JSON.stringify({ platform: release.platform, version: release.version }), nowSeconds()),
  ]);
  return json({ ok: true, releaseId, platform: release.platform, version: release.version });
}

async function downloadTicket(request, env, platform) {
  const subject = request.headers.get('cf-connecting-ip') || 'public-release-download';
  if (!await isFeatureEnabled(env, 'app_releases', subject)) throw new HttpError(404, 'App releases are temporarily disabled', 'FEATURE_DISABLED');
  if (!['android','ios','windows','macos'].includes(platform)) throw new HttpError(400, 'Invalid platform', 'INVALID_PLATFORM');
  const release = await env.DB.prepare(`SELECT id,platform,version,build_number,file_name,size_bytes,sha256,notes,created_at
    FROM app_releases WHERE platform=? AND is_active=1 ORDER BY created_at DESC LIMIT 1`).bind(platform).first();
  if (!release) throw new HttpError(404, 'No active release for this platform', 'RELEASE_NOT_FOUND');
  const ticket = await signDownloadTicket(release.id, env.SESSION_SECRET, 300);
  const downloadUrl = new URL(`/downloads/${encodeURIComponent(release.id)}?ticket=${encodeURIComponent(ticket)}`, request.url).toString();
  return json({ release, downloadUrl, ticketExpiresIn: 300 });
}

export async function handleBinaryDownload(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  const releaseId = url.pathname.split('/')[2];
  if (!releaseId || !env.ARTIFACTS) throw new HttpError(404, 'Release not found', 'RELEASE_NOT_FOUND');
  await verifyDownloadTicket(url.searchParams.get('ticket') || '', releaseId, env.SESSION_SECRET);
  const release = await env.DB.prepare('SELECT r2_key,file_name,content_type,size_bytes FROM app_releases WHERE id=? AND is_active=1').bind(releaseId).first();
  if (!release) throw new HttpError(404, 'Release not found or no longer active', 'RELEASE_NOT_FOUND');
  const object = await env.ARTIFACTS.get(release.r2_key);
  if (!object) throw new HttpError(404, 'Binary is missing from storage', 'BINARY_NOT_FOUND');
  const safeName = String(release.file_name || 'download.bin').replace(/[\r\n"\\]/g, '_');
  const headers = new Headers({
    'content-type': release.content_type || 'application/octet-stream',
    'content-disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'content-length': String(release.size_bytes || object.size),
  });
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}



const CONFIG_RULES = {
  APP_URL: 'optional-url', ADMIN_URL: 'optional-url', STOREFRONT_URL: 'optional-url',
  MINIAPP_PUBLIC_URL: 'optional-url', ADMIN_PUBLIC_URL: 'optional-url', STOREFRONT_PUBLIC_URL: 'optional-url',
  MINIAPP_DOMAIN_OVERRIDE: 'optional-url', ADMIN_DOMAIN_OVERRIDE: 'optional-url', STOREFRONT_DOMAIN_OVERRIDE: 'optional-url',
  VITE_API_BASE_URL: 'optional-url', CORS_ORIGINS: 'origins',
  BOT_USERNAME: 'username',
  MIN_DEPOSIT_VND: 'integer', MAX_DEPOSIT_VND: 'integer',
  DAILY_CHECKIN_REWARD_VND: 'integer', REFERRAL_REWARD_VND: 'integer',
  SESSION_TTL_SECONDS: 'integer', MAX_INIT_DATA_AGE_SECONDS: 'integer',
  BANK_ID: 'short', BANK_ACCOUNT_NUMBER: 'account', BANK_ACCOUNT_NAME: 'name', BANK_SYNC_URL: 'optional-url',
  TASKS_CONFIG_JSON: 'json', MINIGAME_CONFIG_JSON: 'json',
  MAINTENANCE_MESSAGE: 'message', TASKS_ENABLED: 'boolean', MINIGAME_ENABLED: 'boolean',
  AUTO_REDEPLOY_WORKERS_AFTER_DOMAIN_SYNC: 'boolean',
};
const CONFIG_DEFAULTS = {
  APP_URL: '', ADMIN_URL: '', STOREFRONT_URL: '',
  MINIAPP_PUBLIC_URL: '', ADMIN_PUBLIC_URL: '', STOREFRONT_PUBLIC_URL: '',
  MINIAPP_DOMAIN_OVERRIDE: '', ADMIN_DOMAIN_OVERRIDE: '', STOREFRONT_DOMAIN_OVERRIDE: '',
  VITE_API_BASE_URL: '', CORS_ORIGINS: '',
  BOT_USERNAME: '', MIN_DEPOSIT_VND: '10000', MAX_DEPOSIT_VND: '100000000',
  DAILY_CHECKIN_REWARD_VND: '1000', REFERRAL_REWARD_VND: '2000',
  SESSION_TTL_SECONDS: '3600', MAX_INIT_DATA_AGE_SECONDS: '86400',
  BANK_ID: '', BANK_ACCOUNT_NUMBER: '', BANK_ACCOUNT_NAME: '', BANK_SYNC_URL: '',
  TASKS_CONFIG_JSON: '{}', MINIGAME_CONFIG_JSON: '{}',
  MAINTENANCE_MESSAGE: 'Hệ thống đang bảo trì, vui lòng quay lại sau.',
  TASKS_ENABLED: 'true', MINIGAME_ENABLED: 'true',
  AUTO_REDEPLOY_WORKERS_AFTER_DOMAIN_SYNC: 'true',
};
const SECRET_ALLOWLIST = new Set([
  'BOT_TOKEN','BOT_WEBHOOK_SECRET','SESSION_SECRET','ADMIN_TELEGRAM_IDS',
  'BANK_WEBHOOK_SECRET','BANK_API_KEY','BANK_API_SECRET','GITHUB_WEBHOOK_SECRET',
  'CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','HENDY_GITHUB_TOKEN',
  'ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD',
  'IOS_CERTIFICATE_BASE64','IOS_CERTIFICATE_PASSWORD','IOS_PROVISIONING_PROFILE_BASE64',
  'WINDOWS_PFX_BASE64','WINDOWS_PFX_PASSWORD','MACOS_CERTIFICATE_BASE64','MACOS_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY',
  'SENTRY_AUTH_TOKEN',
]);

function validateCentralConfigValue(name, raw) {
  const rule = CONFIG_RULES[name];
  if (!rule) throw new HttpError(400, 'Unsupported configuration key', 'CONFIG_KEY_NOT_ALLOWED');
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
    throw new HttpError(400, 'Invalid value for ' + name, 'INVALID_CONFIG_VALUE');
  }
  let value = String(raw).trim();
  if (value.length > 8000) throw new HttpError(400, 'Value for ' + name + ' is too long', 'CONFIG_VALUE_TOO_LONG');
  if (rule === 'url' || rule === 'optional-url') {
    if (!value && rule === 'optional-url') return '';
    let parsed;
    try { parsed = new URL(value); } catch { throw new HttpError(400, name + ' must be a valid URL', 'INVALID_CONFIG_URL'); }
    if (!['https:','http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost','127.0.0.1'].includes(parsed.hostname))) {
      throw new HttpError(400, name + ' must use HTTPS (HTTP is allowed only for localhost)', 'INVALID_CONFIG_URL');
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new HttpError(400, name + ' cannot contain credentials, query parameters, or fragments', 'INVALID_CONFIG_URL');
    return parsed.origin.replace(/\/$/, '');
  }
  if (rule === 'origins') {
    if (!value) return '';
    const origins = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
      let parsed;
      try { parsed = new URL(item); } catch { throw new HttpError(400, 'CORS_ORIGINS contains an invalid URL', 'INVALID_CORS_ORIGINS'); }
      if (!['https:','http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost','127.0.0.1'].includes(parsed.hostname)) || parsed.origin !== item.replace(/\/$/, '')) {
        throw new HttpError(400, 'CORS_ORIGINS must contain origins only, without paths or query strings', 'INVALID_CORS_ORIGINS');
      }
      return parsed.origin;
    }))];
    if (origins.length > 10) throw new HttpError(400, 'CORS_ORIGINS supports at most 10 origins', 'INVALID_CORS_ORIGINS');
    return origins.join(',');
  }
  if (rule === 'integer') {
    if (!/^\d{1,12}$/.test(value)) throw new HttpError(400, name + ' must be an integer', 'INVALID_CONFIG_VALUE');
    const number = Number(value);
    const limits = {
      MIN_DEPOSIT_VND: [1, 1000000000], MAX_DEPOSIT_VND: [1, 1000000000],
      DAILY_CHECKIN_REWARD_VND: [0, 1000000], REFERRAL_REWARD_VND: [0, 1000000],
      SESSION_TTL_SECONDS: [300, 86400], MAX_INIT_DATA_AGE_SECONDS: [60, 604800],
    }[name] || [0, 1000000000];
    if (!Number.isSafeInteger(number) || number < limits[0] || number > limits[1]) throw new HttpError(400, name + ' is outside the allowed range', 'CONFIG_VALUE_OUT_OF_RANGE');
    return String(number);
  }
  if (rule === 'boolean') {
    if (!['true','false'].includes(value.toLowerCase())) throw new HttpError(400, name + ' must be true or false', 'INVALID_CONFIG_VALUE');
    return value.toLowerCase();
  }
  if (rule === 'json') {
    if (!value) value = '{}';
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new HttpError(400, name + ' must be valid JSON', 'INVALID_CONFIG_JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, name + ' must be a JSON object', 'INVALID_CONFIG_JSON');
    if (name === 'TASKS_CONFIG_JSON') {
      const allowed = new Set(['maxActiveTasks','maxTargetCount','maxRewardVnd']);
      if (Object.keys(parsed).some((key) => !allowed.has(key))) throw new HttpError(400, 'TASKS_CONFIG_JSON supports maxActiveTasks, maxTargetCount, and maxRewardVnd only', 'INVALID_CONFIG_JSON');
      const ranges = { maxActiveTasks: [1, 100], maxTargetCount: [1, 100000], maxRewardVnd: [0, 1000000000] };
      for (const [key, item] of Object.entries(parsed)) {
        if (!Number.isSafeInteger(item) || item < ranges[key][0] || item > ranges[key][1]) throw new HttpError(400, 'Invalid numeric task limit: ' + key, 'INVALID_CONFIG_JSON');
      }
    }
    if (name === 'MINIGAME_CONFIG_JSON' && parsed.prizes !== undefined) {
      if (!Array.isArray(parsed.prizes) || parsed.prizes.length < 1 || parsed.prizes.length > 12) throw new HttpError(400, 'MINIGAME_CONFIG_JSON prizes must contain 1–12 entries', 'INVALID_CONFIG_JSON');
      let totalThreshold = 0;
      for (const prize of parsed.prizes) {
        if (!prize || typeof prize !== 'object' || !/^[a-z][a-z0-9_-]{1,39}$/.test(String(prize.key || '')) ||
          !Number.isSafeInteger(prize.threshold) || prize.threshold < 0 || prize.threshold > 1000 ||
          !Number.isSafeInteger(prize.rewardVnd) || prize.rewardVnd < 0 || prize.rewardVnd > 1000000) {
          throw new HttpError(400, 'Each minigame prize needs a valid key, threshold (0–1000), and rewardVnd (0–1000000)', 'INVALID_CONFIG_JSON');
        }
        totalThreshold += prize.threshold;
      }
      if (totalThreshold > 1000) throw new HttpError(400, 'Total minigame prize thresholds cannot exceed 1000', 'INVALID_CONFIG_JSON');
    }
    return JSON.stringify(parsed);
  }
  if (rule === 'username') {
    value = value.replace(/^@/, '');
    if (value && !/^[A-Za-z0-9_]{5,32}$/.test(value)) throw new HttpError(400, 'BOT_USERNAME is invalid', 'INVALID_BOT_USERNAME');
    return value;
  }
  if (rule === 'account' && value && !/^\d{6,30}$/.test(value)) throw new HttpError(400, 'BANK_ACCOUNT_NUMBER must contain 6–30 digits', 'INVALID_BANK_ACCOUNT');
  if (rule === 'short' && value && !/^[A-Za-z0-9_.-]{1,60}$/.test(value)) throw new HttpError(400, name + ' contains unsupported characters', 'INVALID_CONFIG_VALUE');
  if (rule === 'name' && value.length > 120) throw new HttpError(400, name + ' is too long', 'INVALID_CONFIG_VALUE');
  if (rule === 'message' && value.length > 2000) throw new HttpError(400, name + ' is too long', 'INVALID_CONFIG_VALUE');
  return value;
}

async function adminCentralConfig(request, env) {
  const { user } = await requireAdmin(request, env);
  if (request.method === 'GET') {
    const { results: rows } = await env.DB.prepare('SELECT config_key,value_json,updated_by,updated_at FROM central_configs ORDER BY config_key').all();
    const values = { ...CONFIG_DEFAULTS };
    const metadata = {};
    for (const row of rows) {
      if (!Object.hasOwn(CONFIG_RULES, row.config_key)) continue;
      try { values[row.config_key] = String(JSON.parse(row.value_json)); } catch { values[row.config_key] = String(row.value_json); }
      metadata[row.config_key] = { updatedBy: row.updated_by, updatedAt: row.updated_at };
    }
    let githubVariablesAvailable = false;
    let githubSecretsAvailable = false;
    let secretNames = [];
    try {
      const variables = await getGitHubActionsVariables(env);
      Object.assign(values, variables);
      githubVariablesAvailable = true;
    } catch { /* Keep D1/default values visible when GitHub integration is not configured. */ }
    try {
      secretNames = await listGitHubActionsSecretNames(env);
      githubSecretsAvailable = true;
    } catch { /* Never return secret values; a name inventory is optional when GitHub is unavailable. */ }
    const { results: secretMeta } = await env.DB.prepare('SELECT secret_key,updated_by,updated_at FROM central_config_secrets ORDER BY secret_key').all();
    const secretKeys = [...new Set([...secretNames, ...secretMeta.map((row) => row.secret_key)])];
    const secretStatus = Object.fromEntries(secretKeys.map((name) => [name, {
      configured: secretNames.includes(name),
      updatedAt: secretMeta.find((row) => row.secret_key === name)?.updated_at || null,
    }]));
    return json({
      values, metadata, secretStatus, githubVariablesAvailable, githubSecretsAvailable,
      secretKeys: [...SECRET_ALLOWLIST],
      deploymentTargets: ['domains','workers','web','miniapp','secrets'],
    });
  }
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  const { value } = await readJson(request, 64 * 1024);
  if (!value.values || typeof value.values !== 'object' || Array.isArray(value.values)) throw new HttpError(400, 'values must be an object', 'INVALID_CONFIG');
  const keys = Object.keys(value.values);
  if (!keys.length || keys.length > Object.keys(CONFIG_RULES).length) throw new HttpError(400, 'Provide at least one supported configuration value', 'INVALID_CONFIG');
  const normalized = {};
  for (const key of keys) normalized[key] = validateCentralConfigValue(key, value.values[key]);
  let synced;
  try { synced = await syncGitHubActionsVariables(env, normalized); }
  catch { throw new HttpError(502, 'Could not sync configuration to GitHub Actions. Check the repository token has Actions variables read/write permissions.', 'GITHUB_VARIABLE_SYNC_FAILED'); }
  const now = nowSeconds();
  await env.DB.batch([
    ...Object.entries(normalized).map(([key, val]) => env.DB.prepare('INSERT INTO central_configs(config_key,value_json,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(key, JSON.stringify(val), user.telegram_id, now)),
    ...('MAINTENANCE_MESSAGE' in normalized ? [env.DB.prepare("INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('maintenance_message',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(normalized.MAINTENANCE_MESSAGE), user.telegram_id, now)] : []),
    ...('DAILY_CHECKIN_REWARD_VND' in normalized ? [env.DB.prepare("INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('daily_checkin_reward_vnd',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(Number(normalized.DAILY_CHECKIN_REWARD_VND)), user.telegram_id, now)] : []),
    ...('REFERRAL_REWARD_VND' in normalized ? [env.DB.prepare("INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('referral_reward_vnd',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(Number(normalized.REFERRAL_REWARD_VND)), user.telegram_id, now)] : []),
    ...('MINIGAME_ENABLED' in normalized ? [env.DB.prepare("INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('minigame_enabled',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(normalized.MINIGAME_ENABLED === 'true'), user.telegram_id, now), env.DB.prepare("UPDATE feature_flags SET enabled=?,updated_by=?,updated_at=? WHERE flag_key='minigame'").bind(normalized.MINIGAME_ENABLED === 'true' ? 1 : 0, user.telegram_id, now)] : []),
    ...('TASKS_CONFIG_JSON' in normalized ? [env.DB.prepare("INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('tasks_config_json',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(JSON.parse(normalized.TASKS_CONFIG_JSON)), user.telegram_id, now)] : []),
    ...('MINIGAME_CONFIG_JSON' in normalized ? [env.DB.prepare("INSERT INTO bot_configs(config_key,value_json,updated_by,updated_at) VALUES('minigame_config_json',?,?,?) ON CONFLICT(config_key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(JSON.parse(normalized.MINIGAME_CONFIG_JSON)), user.telegram_id, now)] : []),
    ...('TASKS_ENABLED' in normalized ? [env.DB.prepare("UPDATE feature_flags SET enabled=?,updated_by=?,updated_at=? WHERE flag_key='tasks'").bind(normalized.TASKS_ENABLED === 'true' ? 1 : 0, user.telegram_id, now)] : []),
    env.DB.prepare('INSERT INTO audit_logs(actor_telegram_id,action,target_type,target_id,details_json,created_at) VALUES(?,?,?,?,?,?)')
      .bind(user.telegram_id, 'config.update', 'central_config', 'runtime', JSON.stringify({ keys: Object.keys(normalized) }), now),
  ]);
  return json({ ok: true, updatedKeys: Object.keys(normalized), syncedVariables: synced, updatedAt: now });
}

async function adminConfigApply(request, env) {
  const { user } = await requireAdmin(request, env);
  const { value } = await readJson(request);
  if (value.confirm !== true) throw new HttpError(400, 'Confirm before dispatching deployment workflows', 'DEPLOY_CONFIRMATION_REQUIRED');
  const requested = value.targets;
  if (!Array.isArray(requested) || !requested.length || requested.some((target) => !['domains','workers','web','miniapp','secrets'].includes(target))) {
    throw new HttpError(400, 'Select one or more supported deployment targets', 'INVALID_DEPLOYMENT_TARGETS');
  }
  const mapping = { domains: ['sync-domains.yml', {}], workers: ['deploy-workers.yml', {}], web: ['deploy-web.yml', {}], miniapp: ['deploy-miniapp.yml', {}], secrets: ['secrets-sync.yml', { confirm: 'SYNC' }] };
  const dispatched = [];
  for (const target of [...new Set(requested)]) {
    const entry = mapping[target];
    try {
      await dispatchGitHubWorkflow(env, entry[0], entry[1]);
      dispatched.push({ target: target, workflow: entry[0], ref: 'main' });
    } catch {
      await recordAudit(env, user.telegram_id, 'config.apply_partial_failure', 'workflow', entry[0], { dispatched: dispatched.map((item) => item.workflow) });
      return json({ ok: false, dispatched, error: 'Could not dispatch ' + entry[0] + '; verify GitHub Actions workflow permissions.' }, 502);
    }
  }
  await recordAudit(env, user.telegram_id, 'config.apply', 'workflows', dispatched.map((item) => item.workflow).join(','), { targets: dispatched.map((item) => item.target) });
  return json({ ok: true, dispatched, message: 'Workflow đã được gửi đi; hãy theo dõi GitHub Actions để xác nhận kết quả triển khai.' });
}

export async function routeApi(request, env, url) {
  const path = url.pathname; const method = request.method.toUpperCase();
  if (path.startsWith('/api/') && !path.startsWith('/api/admin/')) {
    if (await isMaintenanceEnabled(env)) {
      const row = await env.DB.prepare("SELECT value_json FROM bot_configs WHERE config_key='maintenance_message'").first();
      let message = 'Hệ thống đang bảo trì.';
      try { message = JSON.parse(row?.value_json || '""') || message; } catch { /* default */ }
      throw new HttpError(503, String(message), 'MAINTENANCE_MODE');
    }
  }
  const featureResponse = await routeFeatureApi(request, env, url);
  if (featureResponse) return featureResponse;
  if (path === '/api/auth/telegram' && method === 'POST') return authenticate(request, env);
  if (path === '/api/products' && method === 'GET') return listProducts(env);
  if (path === '/api/me' && method === 'GET') return getMe(request, env);
  if (path === '/api/wallet' && method === 'GET') return getWallet(request, env);
  if (path === '/api/vip' && method === 'GET') return getVip(request, env);
  if (path === '/api/orders' && method === 'GET') return getOrders(request, env);
  if (path === '/api/orders' && method === 'POST') return buyProduct(request, env);
  if (path === '/api/deposits' && method === 'POST') return createDeposit(request, env);
  if (path === '/api/giftcodes/redeem' && method === 'POST') return redeemGiftcode(request, env);
  if (path === '/webhooks/bank' && method === 'POST') {
    const { raw } = await readJson(request, 128 * 1024);
    return bankWebhook(request, env, raw);
  }
  if (path === '/api/admin/config' && ['GET','POST'].includes(method)) return adminCentralConfig(request, env);
  if (path === '/api/admin/config/apply' && method === 'POST') return adminConfigApply(request, env);
  if (path === '/api/admin/overview' && method === 'GET') return adminOverview(request, env);
  if (path === '/api/admin/products' && ['GET','POST'].includes(method)) return adminProducts(request, env);
  if (path === '/api/admin/inventory' && method === 'POST') return adminStock(request, env);
  if (path === '/api/admin/giftcodes' && method === 'POST') return adminGiftcode(request, env);
  if (path === '/api/admin/releases' && ['GET','POST'].includes(method)) return adminReleases(request, env);
  const partUpload = path.match(/^\/api\/admin\/releases\/uploads\/([a-zA-Z0-9-]+)\/parts\/(\d+)$/);
  if (partUpload && method === 'PUT') return uploadReleasePart(request, env, partUpload[1], Number(partUpload[2]));
  const uploadComplete = path.match(/^\/api\/admin\/releases\/uploads\/([a-zA-Z0-9-]+)\/complete$/);
  if (uploadComplete && method === 'POST') return completeReleaseUpload(request, env, uploadComplete[1]);
  const uploadAbort = path.match(/^\/api\/admin\/releases\/uploads\/([a-zA-Z0-9-]+)$/);
  if (uploadAbort && method === 'DELETE') return abortReleaseUpload(request, env, uploadAbort[1]);
  const activation = path.match(/^\/api\/admin\/releases\/([a-zA-Z0-9-]+)\/activate$/);
  if (activation && method === 'POST') return activateRelease(request, env, activation[1]);
  const ticketPath = path.match(/^\/api\/releases\/(android|ios|windows|macos)\/download-ticket$/);
  if (ticketPath && method === 'GET') return downloadTicket(request, env, ticketPath[1]);
  if (path === '/api/admin/users' && method === 'GET') return adminUsers(request, env);
  if (path === '/api/releases' && method === 'GET') return releases(request, env, url.searchParams.get('platform'));
  if (path === '/api/admin/audit' && method === 'GET') {
    await requireAdmin(request, env);
    const { results } = await env.DB.prepare('SELECT id,actor_telegram_id,action,target_type,target_id,details_json,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
    return json({ logs: results });
  }
  throw new HttpError(404, 'Route not found', 'NOT_FOUND');
}
