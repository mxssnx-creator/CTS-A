import { readFileSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

/** Durable identities for close writes. No timeout or restart permits a resend. */
export class PendingCloseState {
  constructor(path, connId) {
    this.path=path; this.connId=connId; this.rows=new Map();
    let saved;
    try { saved=JSON.parse(readFileSync(path,'utf8')); }
    catch (e) { if (e.code==='ENOENT') return; throw e; }
    if(saved.version!==1 || saved.connId!==connId || !Array.isArray(saved.rows)) throw new Error('Invalid pending-close state');
    for(const row of saved.rows) {
      this.validate(row);
      const key=this.key(row);
      if(this.rows.has(key)) throw new Error('Duplicate pending close');
      this.rows.set(key,row);
    }
  }
  key(row) { return `${row.symbol}:${row.side}`; }
  validate(row) {
    if(!row || typeof row.symbol!=='string' || !row.symbol || !['long','short'].includes(row.side) ||
       !Number.isFinite(row.qty) || row.qty<=0 || typeof row.clientOrderId!=='string' || !row.clientOrderId)
      throw new Error('Invalid pending close identity');
  }
  save() {
    mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
    const temp=this.path+'.tmp'; const fd=openSync(temp,'w',0o600);
    try { writeFileSync(fd,JSON.stringify({version:1,connId:this.connId,rows:[...this.rows.values()]})); fsyncSync(fd); }
    finally { closeSync(fd); }
    renameSync(temp,this.path);
  }
  begin(row) {
    this.validate(row); const key=this.key(row);
    if(this.rows.has(key)) return false;
    this.rows.set(key,{...row,createdAt:Date.now()});
    try { this.save(); } catch(e) { this.rows.delete(key); throw e; }
    return true;
  }
  acknowledge(key, reply) {
    const row=this.rows.get(key); if(!row) return;
    if(reply?.orderId) row.orderId=String(reply.orderId);
    this.save();
  }
  resolve(key, response, book) {
    const row=this.rows.get(key); if(!row) return {state:'absent'};
    const o=response?.order;
    if(!response?.ok || !o || !book?.ok || book.error || !Array.isArray(book.positions)) return {state:'pending'};
    const cid=String(o.clientOrderID ?? o.clientOrderId ?? '');
    const id=String(o.orderId ?? '');
    if(cid.toLowerCase()!==row.clientOrderId.toLowerCase() || (row.orderId && id!==row.orderId) ||
       !['FILLED','CANCELED','CANCELLED','EXPIRED','REJECTED'].includes(String(o.status).toUpperCase())) return {state:'pending'};
    const own=book.positions.filter(p=>p.symbol===row.symbol && p.side===row.side);
    if(own.some(p=>!Number.isFinite(p.qty) || p.qty<0)) return {state:'pending'};
    const qty=own.reduce((n,p)=>n+p.qty,0);
    // A filled ticket can precede position propagation: keep waiting if exposure remains.
    if(qty>0 && String(o.status).toUpperCase()==='FILLED') return {state:'pending'};
    if(qty>0) this.complete(key);
    return {state:qty>0?'remaining':'flat',row,orderId:id};
  }
  complete(key) {
    const row=this.rows.get(key); this.rows.delete(key);
    try { this.save(); } catch(e) { if(row) this.rows.set(key,row); throw e; }
  }
}
