import React from 'react';
import { Download, RefreshCw } from 'lucide-react';
export default function AndroidDirectLink({available,loading,onDownload}:{available:boolean;loading:boolean;onDownload:()=>void}){return <button disabled={!available||loading} className="download" onClick={onDownload}>{loading?<RefreshCw size={16} className="spin"/>:<Download size={16}/>} {loading?'Đang chuẩn bị…':available?'Tải APK/AAB':'Chưa có bản phát hành'}</button>}
