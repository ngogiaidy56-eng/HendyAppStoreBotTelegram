export const commandNames = ['/start','/shop','/balance','/referral','/admin','/help'] as const;
export function menuKeyboard(appUrl:string) { return { keyboard:[[{text:'🛍 Mở cửa hàng',web_app:{url:appUrl}}],[{text:'💰 Số dư'},{text:'❓ Trợ giúp'}]],resize_keyboard:true,is_persistent:true }; }
