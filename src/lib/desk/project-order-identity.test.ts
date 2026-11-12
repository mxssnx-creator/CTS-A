import assert from "node:assert/strict";
import {test} from "node:test";
import {makeClientOrderId,isDeskClientOrderId,deskClientPrefix} from "./feed.ts";
test("CTS-A connection order IDs are disjoint from every other project",()=>{
 for(const conn of ["bingx-x01","bingx-vst-01","bingx-vst-02"]){
  for(const kind of ["E","S","T","C","L","X"] as const){const id=makeClientOrderId(conn,kind);assert.ok(id.startsWith(deskClientPrefix(conn)));assert.equal(isDeskClientOrderId(id,conn),true);assert.ok(id.length<=40)}
  for(const foreign of ["CTSBV2_E1","CTSXV2_E1","ctsc_abcd","Gx02abc","knabc123entry","ktabc123mentry"])assert.equal(isDeskClientOrderId(foreign,conn),false);
 }
});

test("an explicit instance namespace cannot adopt another concurrent CTS-A desk",()=>{
 const previous=process.env.CTS_A_CLIENT_NAMESPACE;
 try {
  delete process.env.CTS_A_CLIENT_NAMESPACE;
  const legacy=makeClientOrderId("bingx-vst-02");
  process.env.CTS_A_CLIENT_NAMESPACE="STUDY12";
  const own=makeClientOrderId("bingx-vst-02","S");
  assert.ok(own.startsWith("CTSAV2_STUDY12_S"));assert.ok(own.length<=40);
  assert.equal(isDeskClientOrderId(own,"bingx-vst-02"),true);
  assert.equal(isDeskClientOrderId(own),true);
  assert.equal(isDeskClientOrderId(legacy,"bingx-vst-02"),false);
  assert.equal(isDeskClientOrderId(legacy),false);
  process.env.CTS_A_CLIENT_NAMESPACE="OTHER12";
  assert.equal(isDeskClientOrderId(own,"bingx-vst-02"),false);
  assert.equal(isDeskClientOrderId(own),false);
  assert.equal(isDeskClientOrderId(makeClientOrderId("bingx-vst-02"),"bingx-vst-02"),true);
 } finally {if(previous===undefined)delete process.env.CTS_A_CLIENT_NAMESPACE;else process.env.CTS_A_CLIENT_NAMESPACE=previous;}
});
test("invalid instance namespaces fail before a client identity is issued",()=>{
 const previous=process.env.CTS_A_CLIENT_NAMESPACE;
 try {process.env.CTS_A_CLIENT_NAMESPACE="TOO-LONG-INVALID";assert.throws(()=>makeClientOrderId("bingx-vst-02"),/NAMESPACE/);}
 finally{if(previous===undefined)delete process.env.CTS_A_CLIENT_NAMESPACE;else process.env.CTS_A_CLIENT_NAMESPACE=previous;}
});
