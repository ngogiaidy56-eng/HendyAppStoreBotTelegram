"""SQLite regression checks for the SQL sequences used by the D1 Worker."""
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
conn = sqlite3.connect(":memory:", isolation_level=None)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = ON")
for migration in sorted((ROOT / "database/migrations").glob("*.sql")):
    conn.executescript(migration.read_text(encoding="utf-8"))
now = 1_800_000_000
conn.execute("INSERT INTO users(telegram_id,first_name,balance_vnd,created_at,updated_at) VALUES(?,?,?,?,?)", ("10001", "Tester", 100_000, now, now))
user_id = conn.execute("SELECT id FROM users WHERE telegram_id='10001'").fetchone()[0]
conn.execute("INSERT INTO products(id,title,price_vnd,created_at,updated_at) VALUES(?,?,?,?,?)", ("product-1", "Test Code", 30_000, now, now))
conn.execute("INSERT INTO code_inventory(product_id,secret_value,created_at) VALUES(?,?,?)", ("product-1", "TEST-CODE-PRIVATE", now))

# Exercise the exact ordered SQL used in the Worker buy flow.
def buy(order_id, request_id):
    statements = [
        ("""INSERT OR IGNORE INTO orders(order_id,user_id,product_id,idempotency_key,amount_vnd,status,created_at)
          SELECT ?,u.id,p.id,?,p.price_vnd,'pending',? FROM users u JOIN products p ON p.id=?
          WHERE u.id=? AND u.is_banned=0 AND p.is_active=1 AND u.balance_vnd>=p.price_vnd
          AND EXISTS(SELECT 1 FROM code_inventory ci WHERE ci.product_id=p.id AND ci.sold_at IS NULL AND ci.order_id IS NULL)""", (order_id, request_id, now, "product-1", user_id)),
        ("""UPDATE code_inventory SET order_id=? WHERE id=(SELECT ci.id FROM code_inventory ci JOIN orders o ON o.order_id=?
          WHERE ci.product_id=? AND ci.sold_at IS NULL AND ci.order_id IS NULL AND o.status='pending' ORDER BY ci.id LIMIT 1)
          AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND status='pending')""", (order_id, order_id, "product-1", order_id)),
        ("""UPDATE users SET balance_vnd=balance_vnd-(SELECT amount_vnd FROM orders WHERE order_id=?)
          WHERE id=? AND balance_vnd >= (SELECT amount_vnd FROM orders WHERE order_id=?)
          AND EXISTS(SELECT 1 FROM code_inventory WHERE order_id=? AND sold_at IS NULL)""", (order_id, user_id, order_id, order_id)),
        ("""UPDATE users SET total_spent_vnd=total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?),
          vip_level=CASE WHEN total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?)>=5000000 THEN 'platinum'
            WHEN total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?)>=2000000 THEN 'gold'
            WHEN total_spent_vnd+(SELECT amount_vnd FROM orders WHERE order_id=?)>=500000 THEN 'silver' ELSE 'bronze' END
          WHERE id=? AND changes()=1""", (order_id,order_id,order_id,order_id,user_id)),
        ("UPDATE code_inventory SET sold_at=? WHERE order_id=? AND sold_at IS NULL AND changes()=1", (now, order_id)),
        ("UPDATE code_inventory SET order_id=NULL WHERE order_id=? AND sold_at IS NULL AND changes()=0", (order_id,)),
        ("""UPDATE orders SET status='completed',completed_at=? WHERE order_id=? AND status='pending'
          AND EXISTS(SELECT 1 FROM code_inventory WHERE order_id=? AND sold_at=?)""", (now, order_id, order_id, now)),
        ("""INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
          SELECT user_id,'purchase',-amount_vnd,order_id,'Test purchase',? FROM orders WHERE order_id=? AND status='completed'""", (now, order_id)),
    ]
    conn.execute("BEGIN")
    try:
        for sql, values in statements:
            conn.execute(sql, values)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise

buy("order-1", "request-1")
assert conn.execute("SELECT status FROM orders WHERE order_id='order-1'").fetchone()[0] == "completed"
assert conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == 70_000
assert conn.execute("SELECT total_spent_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == 30_000
assert conn.execute("SELECT secret_value FROM code_inventory WHERE order_id='order-1'").fetchone()[0] == "TEST-CODE-PRIVATE"
buy("order-retry", "request-1")
assert conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == 70_000
assert conn.execute("SELECT total_spent_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == 30_000
assert conn.execute("SELECT COUNT(*) FROM wallet_transactions WHERE kind='purchase'").fetchone()[0] == 1

# Deposit webhook is idempotent: duplicate provider callbacks cannot credit twice.
conn.execute("INSERT INTO deposit_requests(id,user_id,reference,amount_vnd,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", ("deposit-1", user_id, "HENDY-TEST", 50_000, "pending", now, now))
def credit_deposit():
    sqls = [
        ("""UPDATE users SET balance_vnd=balance_vnd+(SELECT amount_vnd FROM deposit_requests WHERE reference=? AND status='pending' AND amount_vnd=?),updated_at=?
          WHERE id=(SELECT user_id FROM deposit_requests WHERE reference=? AND status='pending' AND amount_vnd=?)
          AND EXISTS(SELECT 1 FROM deposit_requests WHERE reference=? AND status='pending' AND amount_vnd=?)""", ("HENDY-TEST", 50_000, now, "HENDY-TEST", 50_000, "HENDY-TEST", 50_000)),
        ("UPDATE deposit_requests SET status='credited',provider_tx_id=?,updated_at=? WHERE reference=? AND status='pending' AND amount_vnd=? AND changes()=1", ("bank-tx-1", now, "HENDY-TEST", 50_000)),
        ("""INSERT OR IGNORE INTO bank_webhook_events(provider_tx_id,reference,raw_event_hash,received_at)
          SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM deposit_requests WHERE reference=? AND status='credited' AND provider_tx_id=?)""", ("bank-tx-1", "HENDY-TEST", "digest", now, "HENDY-TEST", "bank-tx-1")),
        ("""INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
          SELECT user_id,'deposit',amount_vnd,provider_tx_id,'Bank deposit',? FROM deposit_requests WHERE reference=? AND status='credited' AND provider_tx_id=?""", (now, "HENDY-TEST", "bank-tx-1")),
    ]
    conn.execute("BEGIN")
    for sql, values in sqls:
        conn.execute(sql, values)
    conn.execute("COMMIT")
credit_deposit()
credit_deposit()
assert conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == 120_000
assert conn.execute("SELECT COUNT(*) FROM wallet_transactions WHERE kind='deposit'").fetchone()[0] == 1

# Giftcode duplicate callbacks/requests cannot double-credit.
conn.execute("INSERT INTO giftcodes(id,code,amount_vnd,max_uses,created_at) VALUES(?,?,?,?,?)", ("gift-1", "WELCOME", 20_000, 10, now))
def redeem_gift():
    sqls = [
        ("""INSERT OR IGNORE INTO giftcode_redemptions(giftcode_id,user_id,redeemed_at)
          SELECT id,?,? FROM giftcodes WHERE id=? AND is_active=1 AND used_count<max_uses AND (expires_at IS NULL OR expires_at>?)""", (user_id, now, "gift-1", now)),
        ("UPDATE giftcodes SET used_count=used_count+1 WHERE id=? AND changes()=1 AND used_count<max_uses", ("gift-1",)),
        ("UPDATE users SET balance_vnd=balance_vnd+(SELECT amount_vnd FROM giftcodes WHERE id=?) WHERE id=? AND changes()=1", ("gift-1", user_id)),
        ("""INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at)
          SELECT ?, 'giftcode', amount_vnd, 'GIFT:' || ? || ':' || ?, 'Giftcode', ? FROM giftcodes WHERE id=?
          AND EXISTS(SELECT 1 FROM giftcode_redemptions WHERE giftcode_id=? AND user_id=?)""", (user_id, "gift-1", user_id, now, "gift-1", "gift-1", user_id)),
    ]
    conn.execute("BEGIN")
    for sql, values in sqls:
        conn.execute(sql, values)
    conn.execute("COMMIT")
redeem_gift()
redeem_gift()
assert conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == 140_000
assert conn.execute("SELECT used_count FROM giftcodes WHERE id='gift-1'").fetchone()[0] == 1
assert conn.execute("SELECT COUNT(*) FROM wallet_transactions WHERE kind='giftcode'").fetchone()[0] == 1
# Reward endpoints must remain idempotent even if the same action is submitted twice.
balance_before = conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0]
def daily_checkin(day, reward):
    conn.execute("BEGIN")
    conn.execute("INSERT OR IGNORE INTO daily_checkins(user_id,day_key,reward_vnd,created_at) VALUES(?,?,?,?)", (user_id, day, reward, now))
    conn.execute("UPDATE users SET balance_vnd=balance_vnd+? WHERE id=? AND changes()=1", (reward, user_id))
    conn.execute("INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at) SELECT ?, 'daily_checkin', ?, ?, 'Daily check-in', ? WHERE changes()=1", (user_id, reward, f"CHECKIN:{user_id}:{day}", now))
    conn.execute("COMMIT")
daily_checkin('2026-10-28', 1000)
daily_checkin('2026-10-28', 1000)
assert conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == balance_before + 1000
assert conn.execute("SELECT COUNT(*) FROM wallet_transactions WHERE kind='daily_checkin'").fetchone()[0] == 1

# Referral rewards are unique per referred user, not per webhook / Mini App login.
conn.execute("INSERT INTO users(telegram_id,first_name,created_at,updated_at) VALUES(?,?,?,?)", ("10002", "Invitee", now, now))
invitee_id = conn.execute("SELECT id FROM users WHERE telegram_id='10002'").fetchone()[0]
def reward_referral():
    conn.execute("BEGIN")
    conn.execute("INSERT OR IGNORE INTO referrals(referrer_user_id,referred_user_id,reward_vnd,created_at) VALUES(?,?,?,?)", (user_id, invitee_id, 2000, now))
    conn.execute("UPDATE users SET balance_vnd=balance_vnd+? WHERE id=? AND changes()=1", (2000, user_id))
    conn.execute("UPDATE referrals SET rewarded_at=? WHERE referrer_user_id=? AND referred_user_id=? AND rewarded_at IS NULL AND changes()=1", (now, user_id, invitee_id))
    conn.execute("INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at) SELECT ?, 'referral', ?, ?, 'Referral reward', ? WHERE EXISTS(SELECT 1 FROM referrals WHERE referrer_user_id=? AND referred_user_id=? AND rewarded_at=?)", (user_id, 2000, f"REFERRAL:{user_id}:{invitee_id}", now, user_id, invitee_id, now))
    conn.execute("COMMIT")
ref_before = conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0]
reward_referral(); reward_referral()
assert conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == ref_before + 2000
assert conn.execute("SELECT COUNT(*) FROM referrals WHERE referred_user_id=?", (invitee_id,)).fetchone()[0] == 1
assert conn.execute("SELECT COUNT(*) FROM wallet_transactions WHERE reference=?", (f"REFERRAL:{user_id}:{invitee_id}",)).fetchone()[0] == 1

# Free minigame uses a per-user/day unique constraint and a ledger reference.
def spin_day(day, reward):
    conn.execute("BEGIN")
    conn.execute("INSERT OR IGNORE INTO minigame_spins(user_id,day_key,prize_key,reward_vnd,created_at) VALUES(?,?,?,?,?)", (user_id, day, 'test', reward, now))
    conn.execute("UPDATE users SET balance_vnd=balance_vnd+(SELECT reward_vnd FROM minigame_spins WHERE user_id=? AND day_key=?) WHERE id=? AND changes()=1", (user_id, day, user_id))
    conn.execute("INSERT OR IGNORE INTO wallet_transactions(user_id,kind,amount_vnd,reference,note,created_at) SELECT ?, 'minigame', reward_vnd, ?, 'Daily minigame', ? FROM minigame_spins WHERE user_id=? AND day_key=? AND changes()=1", (user_id, f"MINIGAME:{user_id}:{day}", now, user_id, day))
    conn.execute("COMMIT")
spin_before = conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0]
spin_day('2026-10-28', 1000); spin_day('2026-10-28', 5000)
assert conn.execute("SELECT balance_vnd FROM users WHERE id=?", (user_id,)).fetchone()[0] == spin_before + 1000
assert conn.execute("SELECT reward_vnd FROM minigame_spins WHERE user_id=? AND day_key='2026-10-28'", (user_id,)).fetchone()[0] == 1000

# Queue, DLQ, feature flags and admin notification schemas exist after migrations.
assert conn.execute("SELECT COUNT(*) FROM feature_flags WHERE enabled=1").fetchone()[0] >= 5
assert conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('queue_jobs','dead_letter_jobs','user_states','notifications','tasks','minigame_spins')").fetchone()[0] == 6
conn.execute("INSERT INTO queue_jobs(id,job_type,payload_json,available_at,created_at,updated_at) VALUES(?,?,?,?,?,?)", ('queue-test-id','bot_broadcast','{}',now,now,now))
conn.execute("INSERT INTO notifications(id,user_id,title,body,kind,created_at) VALUES(?,?,?,?,?,?)", ('notice-test',user_id,'Test','Test notice','info',now))
assert conn.execute("SELECT COUNT(*) FROM notifications WHERE user_id=?", (user_id,)).fetchone()[0] >= 1
print("SQLite migration + commerce + idempotent check-in/referral/minigame + queue/feature schema tests passed")
