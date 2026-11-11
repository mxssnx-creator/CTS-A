/** Trailing protection only tightens. A venue tick floor cannot loosen a confirmed stop. */
export function improvesTrailingStop(side,current,next,minMove=0){
 return ['long','short'].includes(side)&&[current,next,minMove].every(Number.isFinite)&&current>0&&next>0&&minMove>=0&&
 (side==='long'?next-current:current-next)>minMove;
}
/** A cancel acknowledgement alone cannot rule out a racing fill. */
export function confirmedUnfilledCancellation(reply,orderId){
 const order=reply?.order;if(!reply?.ok||!order)return false;
 const raw=order.orderID??order.orderId;
 if(typeof raw==='number'&&!Number.isSafeInteger(raw))return false;
 const quantity=order.executedQty??order.filledQty??order.cumQty;
 return String(raw)===String(orderId)&&['CANCELED','CANCELLED','EXPIRED'].includes(String(order.status).toUpperCase())&&
 quantity!==undefined&&quantity!==null&&quantity!==''&&Number.isFinite(Number(quantity))&&Number(quantity)===0;
}
/** Oldest attempted lane first; one bounded update instead of a growing price-request queue. */
export function selectTrailingControls(rows,lastAttempt,now,budget=1){
 const active=new Set(rows.map(row=>row.key));
 for(const key of lastAttempt.keys())if(!active.has(key))lastAttempt.delete(key);
 return rows.filter(row=>now-(lastAttempt.get(row.key)??-Infinity)>=500)
 .sort((a,b)=>(lastAttempt.get(a.key)??-Infinity)-(lastAttempt.get(b.key)??-Infinity)||a.key.localeCompare(b.key))
 .slice(0,Math.max(0,Math.floor(budget)));
}
