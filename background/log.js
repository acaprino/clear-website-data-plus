/* ============================================================
   Clear Website Data+ — Debug-gated logger
   debug/info are silent unless the user opts in via the options
   page. warn/error are always emitted so failures stay visible
   on support tickets without a separate flag flip.
   ============================================================ */

let _debug = false;

function setDebug(v) { _debug = !!v; }
function isDebug()   { return _debug; }

function debug(...args) { if (_debug) console.log(...args); }
function info(...args)  { if (_debug) console.info(...args); }
function warn(...args)  { console.warn(...args); }
function error(...args) { console.error(...args); }

globalThis.CWD_LOG = Object.freeze({ setDebug, isDebug, debug, info, warn, error });
