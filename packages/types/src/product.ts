export interface ProductRecord { id:string; title:string; description:string; category:string; price_vnd:number; kind:'code'|'link'; is_active:0|1; stock?:number }
