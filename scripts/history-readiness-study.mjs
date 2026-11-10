#!/usr/bin/env node
/** Native generated-tape diagnostics. No exchange transport, credentials or orders. */
import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_TACTIC_CONFIG, DEFAULT_BLOCK_CONFIG, DEFAULT_STRATEGY_TOGGLES } from "../src/lib/desk/engine.ts";
import { simulateHours } from "../src/lib/desk/vst.ts";
const [range="micro",preArg="48",symbolArg="3",output="docs/verification/history-study"] = process.argv.slice(2);
if (!["micro","minimal","short"].includes(range)) throw new Error("Unknown range");
const prehours=Number(preArg),symbolCount=Number(symbolArg),hours=24;
if (![24,48].includes(prehours) || !Number.isInteger(symbolCount) || symbolCount<3 || symbolCount>12) throw new Error("Study is bounded to 48/72 total hours and 3–12 symbols");
const cfg={...DEFAULT_TACTIC_CONFIG,microRange:range==="micro",minimalRange:range==="minimal",shortRange:range==="short",
  tpAtr:range==="micro"?.3:range==="minimal"?2:.6,slOfTp:.5};
const t0=performance.now();
const realNow=Date.now, realRandom=Math.random;
const frozenClock=Date.UTC(2026,10,6,6), seed=0x43545341;
let randomState=seed;
Date.now=()=>frozenClock;
Math.random=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;};
console.log(JSON.stringify({event:"start",range,prehours,hours,symbolCount}));
const {report}=simulateHours(hours,cfg,"trailing",{symbolCount,prehours,complete:false,comboOnly:true,
  rangeType:"atr",block:{...DEFAULT_BLOCK_CONFIG,enabled:false,overall:false},
  strategyToggles:{...DEFAULT_STRATEGY_TOGGLES,normal:true,trailing:true,axis:false,dca:false,block:false}});
Date.now=realNow; Math.random=realRandom;
const result={frozenClock,seed,evidence:"native CTS-A generated tape; synthetic, not historical market or venue acceptance",
  comparison:"Different generated prehistory lengths; not a same-period market comparison",
  range,cfg,prehours,hours,symbolCount,elapsedMs:performance.now()-t0,report};
mkdirSync(output,{recursive:true});
writeFileSync(`${output}/${range}-${prehours}h.json`,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({event:"complete",range,prehours,elapsedMs:result.elapsedMs,pf:report.pf,trades:report.trades,
  samples:report.sampleCoverage?.rows.filter(r=>r.window==="base"&&[15,50,80].includes(r.n))}));
