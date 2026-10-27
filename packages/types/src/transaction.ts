export type WalletTransactionKind='deposit'|'purchase'|'giftcode'|'admin_adjustment'|'daily_checkin'|'referral'|'task_reward'|'minigame';
export interface WalletTransaction { id:number; user_id:number; kind:WalletTransactionKind; amount_vnd:number; reference:string; note:string; created_at:number }
