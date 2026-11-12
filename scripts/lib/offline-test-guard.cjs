// Verification-only Node preload. Protects the ordinary Node test transport surface before app imports;
// it is not an OS sandbox against arbitrary native code, saved pre-guard references, or deliberate unpatching.
// Fetch stays writable so tests can install in-memory mocks. UDP and Unix/custom routes are disabled.
/* eslint-disable @typescript-eslint/no-require-imports -- Node --require must install this synchronously. */
"use strict";

const net = require("node:net");
const dgram = require("node:dgram");
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const threads = require("node:worker_threads");
const { syncBuiltinESMExports } = require("node:module");
const marker = Symbol.for("cts.core.offline.guard");

if (!globalThis[marker]) {
  const denied = () => Object.assign(
    new Error("CTS offline verification: nonlocal or custom network route denied before transport"),
    { code: "CTS_OFFLINE_NETWORK_DENIED" },
  );
  const active = (value) => value !== undefined && value !== null && value !== false;
  const localHost = (host = "localhost") => {
    if (typeof host !== "string") throw denied();
    const value = host.toLowerCase().replace(/^\[|\]$/g, "");
    if (value === "localhost") return "127.0.0.1";
    const family = net.isIP(value);
    if (family === 4 && value.split(".")[0] === "127") return value;
    if (family === 6) {
      const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
      if (canonical === "::1") return canonical;
      const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical);
      if (mapped && (parseInt(mapped[1], 16) & 0xff00) === 0x7f00) return canonical;
    }
    throw denied();
  };
  const customRoutes = ["socketPath", "socket", "lookup", "createConnection", "fd", "handle", "dispatcher"];
  const nativeNormalized = net._normalizeArgs([]);
  const normalizedArgsSymbol = Object.getOwnPropertySymbols(nativeNormalized).find((key) => key.description === "normalizedArgs");
  const checkRoutes = (options, allowPath = false) => {
    for (const key of customRoutes) if (active(options[key])) throw denied();
    if (!allowPath && active(options.path)) throw denied();
    if (active(options.proxyEnv) && Object.keys(options.proxyEnv).length) throw denied();
  };
  const hostsOf = (options) => {
    for (const key of ["host", "hostname"]) if (options[key] !== undefined) localHost(options[key]);
  };
  const connectOptions = (options, implicitHost = true) => {
    checkRoutes(options);
    hostsOf(options);
    const copy = { ...options };
    if (implicitHost || options.host !== undefined || options.hostname !== undefined)
      copy.host = localHost(options.host ?? options.hostname ?? "localhost");
    return copy;
  };
  const connectArgs = (args, allowNormalized = false) => {
    const out = [...args];
    if (Array.isArray(out[0]) && normalizedArgsSymbol && out[0][normalizedArgsSymbol] === true) {
      if (!allowNormalized) throw denied();
      // net.connect calls Socket.connect with Node's symbol-marked normalized array; preserve its symbols.
      const normalized = Object.assign([...out[0]], out[0]);
      normalized[0] = connectOptions(normalized[0] ?? {});
      out[0] = normalized;
    } else if (out[0] && typeof out[0] === "object") {
      out[0] = connectOptions(out[0]);
    } else {
      // Numeric string ports are TCP in Node's normalizer; every nonnumeric string is a Unix/path overload.
      if (typeof out[0] === "string" && !/^\d+$/.test(out[0])) throw denied();
      if (typeof out[1] === "string") out[1] = localHost(out[1]);
      else out.splice(1, 0, "127.0.0.1");
    }
    // TLS can merge a second or third options object over the positional host.
    for (let i = 1; i < out.length; i++)
      if (out[i] && typeof out[i] === "object") out[i] = connectOptions(out[i], false);
    return out;
  };

  // Drop startup proxy configuration too: loopback tests must not leave through an environment proxy.
  for (const key of Object.keys(process.env)) {
    if (/^(BINGX|BINANCE|BYBIT|OKX)/i.test(key) || /^(?:https?|all|no)_proxy$/i.test(key) || key === "NODE_USE_ENV_PROXY")
      delete process.env[key];
  }
  process.env.CTS_CORE_LIVE = "0";
  // Mock API traffic must never consume the running desks' shared native request budget.
  process.env.CTS_BINGX_RATE_BUDGET_FILE = require("node:path").join(
    require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "cts-test-api-budget-")),
    "requests.sqlite",
  );
  const cleanAgents = [
    new http.Agent({ keepAlive: true, scheduling: "lifo", timeout: 5000, proxyEnv: {} }),
    new https.Agent({ keepAlive: true, scheduling: "lifo", timeout: 5000, proxyEnv: {} }),
  ];
  http.globalAgent = cleanAgents[0];
  https.globalAgent = cleanAgents[1];
  const agentMethods = cleanAgents.map((agent) => ({ connect: agent.createConnection, add: agent.addRequest }));
  const checkAgent = (agent) => {
    if (!active(agent)) return;
    const i = cleanAgents.indexOf(agent);
    if (i < 0 || agent.createConnection !== agentMethods[i].connect || agent.addRequest !== agentMethods[i].add) throw denied();
    checkRoutes(agent.options ?? {});
  };
  if (typeof http.setGlobalProxyFromEnv === "function") http.setGlobalProxyFromEnv = () => { throw denied(); };

  for (const name of ["connect", "createConnection"]) {
    const original = net[name];
    net[name] = function (...args) { return original.apply(this, connectArgs(args)); };
  }
  const socketConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) { return socketConnect.apply(this, connectArgs(args, true)); };
  const tlsConnect = tls.connect;
  tls.connect = function (...args) { return tlsConnect.apply(this, connectArgs(args)); };

  const checkUrl = (input, protocols) => {
    const url = input instanceof URL ? input : new URL(input);
    if (!protocols.includes(url.protocol)) throw denied();
    localHost(url.hostname);
    return url;
  };
  const checkProxyPath = (options) => {
    if (typeof options.path !== "string") return;
    if (/^(?:[a-z][\da-z+.-]*:)?\/\//i.test(options.path))
      checkUrl(new URL(options.path, "http://127.0.0.1"), ["http:", "https:"]);
    if (String(options.method).toUpperCase() === "CONNECT")
      checkUrl(`http://${options.path}`, ["http:"]);
  };
  const checkHttpOptions = (options) => {
    checkRoutes(options, true);
    hostsOf(options);
    checkAgent(options.agent);
    checkAgent(options._defaultAgent);
    checkProxyPath(options);
  };
  for (const module of [http, https]) for (const name of ["request", "get"]) {
    const original = module[name];
    module[name] = function (...args) {
      const first = args[0];
      if (typeof first === "string" || first instanceof URL) {
        checkUrl(first, ["http:", "https:"]);
        // urlToHttpOptions preserves URL-owned enumerable fields, including custom routing options.
        if (first instanceof URL) checkHttpOptions({ ...first });
        if (args[1] && typeof args[1] === "object") checkHttpOptions(args[1]);
      } else checkHttpOptions(first ?? {});
      checkAgent(module.globalAgent);
      return original.apply(this, args);
    };
  }

  dgram.Socket.prototype.send = function () { throw denied(); };
  dgram.Socket.prototype.connect = function () { throw denied(); };

  const nativeFetch = globalThis.fetch;
  const NativeRequest = globalThis.Request;
  const safeRequests = new WeakSet();
  const checkFetch = (input, init) => {
    if (NativeRequest && input instanceof NativeRequest && !safeRequests.has(input)) throw denied();
    checkUrl(typeof input === "string" || input instanceof URL ? input : input.url, ["http:", "https:"]);
    if (init) { checkRoutes(init); checkAgent(init.agent); }
  };
  if (NativeRequest) {
    const nativeClone = NativeRequest.prototype.clone;
    NativeRequest.prototype.clone = function (...args) {
      if (!safeRequests.has(this)) throw denied();
      const copy = nativeClone.apply(this, args);
      safeRequests.add(copy);
      return copy;
    };
    globalThis.Request = class OfflineRequest extends NativeRequest {
      constructor(input, init) {
        checkFetch(input, init);
        super(input, init);
        safeRequests.add(this);
      }
    };
  }
  if (nativeFetch) globalThis.fetch = async (input, init) => {
    checkFetch(input, init);
    return nativeFetch(input, init);
  };
  const NativeWebSocket = globalThis.WebSocket;
  if (NativeWebSocket) globalThis.WebSocket = class OfflineWebSocket extends NativeWebSocket {
    constructor(url, protocols, ...extra) {
      checkUrl(url, ["ws:", "wss:"]);
      if ((protocols && typeof protocols === "object" && !Array.isArray(protocols)) || extra.length) throw denied();
      super(url, protocols);
    }
  };

  const NativeWorker = threads.Worker;
  threads.Worker = class OfflineWorker extends NativeWorker {
    constructor(specifier, options = {}) {
      // Node --test expands process.execArgv with V8/process flags which Worker rejects when copied explicitly.
      const inherited = process.execArgv.filter((arg) => /^(?:--experimental-(?:strip|transform)-types|--no-warnings|--(?:no-)?enable-source-maps)$/.test(arg));
      const explicit = options.execArgv ?? inherited;
      // NODE_OPTIONS preloads run before execArgv preloads. Use explicit argv after our guard instead; leave the
      // parent's environment intact so a runner can independently propagate its guard to Node child processes.
      let env = options.env;
      if (env === threads.SHARE_ENV) {
        if (process.env.NODE_OPTIONS) throw denied();
      } else {
        env = { ...(env ?? process.env) };
        delete env.NODE_OPTIONS;
      }
      // A real preload pair, first even before caller preloads; a path under --conditions proves nothing.
      super(specifier, { ...options, env, execArgv: ["--require", __filename, ...explicit] });
    }
  };
  syncBuiltinESMExports();
  globalThis[marker] = Object.freeze({ version: 2, nonlocalTransportDenied: true, protection: "node-test-surface-only" });
}
