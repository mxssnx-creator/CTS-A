import assert from "node:assert/strict";
import {test} from "node:test";
import {makeClientOrderId,isDeskClientOrderId,deskClientPrefix} from "./feed.ts";
test("CTS-A connection order IDs are disjoint from every other project",()=>{
 for(const conn of ["bingx-x01","bingx-vst-01","bingx-vst-02"]){
  for(const kind of ["E","S","T","C","L","X"] as const){const id=makeClientOrderId(conn,kind);assert.ok(id.startsWith(deskClientPrefix(conn)));assert.equal(isDeskClientOrderId(id,conn),true);assert.ok(id.length<=40)}
  for(const foreign of ["CTSBV2_E1","CTSXV2_E1","ctsc_abcd","Gx02abc","knabc123entry","ktabc123mentry"])assert.equal(isDeskClientOrderId(foreign,conn),false);
 }
});
