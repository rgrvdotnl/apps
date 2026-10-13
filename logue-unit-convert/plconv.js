// This code implements the `-sMODULARIZE` settings by taking the generated
// JS program code (INNER_JS_CODE) and wrapping it in a factory function.

// Single threaded MINIMAL_RUNTIME programs do not need access to
// document.currentScript, so a simple export declaration is enough.
var createPlconv = (() => {
  // When MODULARIZE this JS may be executed later,
  // after document.currentScript is gone, so we save it.
  // In EXPORT_ES6 mode we can just use 'import.meta.url'.
  var _scriptName = globalThis.document?.currentScript?.src;
  return async function(moduleArg = {}) {
    var Module = moduleArg;
// include: shell.js
// include: minimum_runtime_check.js
(function() {
  // "30.0.0" -> 300000
  function humanReadableVersionToPacked(str) {
    str = str.split('-')[0]; // Remove any trailing part from e.g. "12.53.3-alpha"
    var vers = str.split('.').slice(0, 3);
    while(vers.length < 3) vers.push('00');
    vers = vers.map((n, i, arr) => n.padStart(2, '0'));
    return vers.join('');
  }
  // 300000 -> "30.0.0"
  var packedVersionToHumanReadable = n => [n / 10000 | 0, (n / 100 | 0) % 100, n % 100].join('.');

  var TARGET_NOT_SUPPORTED = 2147483647;

  // Note: We use a typeof check here instead of optional chaining using
  // globalThis because older browsers might not have globalThis defined.

  // We skip the node version checking when running on Bun/Deno since the node
  // version they report doesn't seem to be useful.
  if (typeof process !== 'undefined' && !process.versions?.bun && typeof Deno == "undefined") {
    var currentNodeVersion = process.versions?.node ? humanReadableVersionToPacked(process.versions.node) : TARGET_NOT_SUPPORTED;
    if (currentNodeVersion < 180300) {
      throw new Error(`This emscripten-generated code requires node v${ packedVersionToHumanReadable(180300) } (detected v${packedVersionToHumanReadable(currentNodeVersion)})`);
    }
  }

  var userAgent = typeof navigator !== 'undefined' && navigator.userAgent;
  if (!userAgent) {
    return;
  }

  var currentSafariVersion = userAgent.includes("Safari/") && !userAgent.includes("Chrome/") && userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/) ? humanReadableVersionToPacked(userAgent.match(/Version\/(\d+\.?\d*\.?\d*)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentSafariVersion < 150000) {
    throw new Error(`This emscripten-generated code requires Safari v${ packedVersionToHumanReadable(150000) } (detected v${currentSafariVersion})`);
  }

  var currentFirefoxVersion = userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Firefox\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentFirefoxVersion < 79) {
    throw new Error(`This emscripten-generated code requires Firefox v79 (detected v${currentFirefoxVersion})`);
  }

  var currentChromeVersion = userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/) ? parseFloat(userAgent.match(/Chrome\/(\d+(?:\.\d+)?)/)[1]) : TARGET_NOT_SUPPORTED;
  if (currentChromeVersion < 85) {
    throw new Error(`This emscripten-generated code requires Chrome v85 (detected v${currentChromeVersion})`);
  }
})();

// end include: minimum_runtime_check.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = !!globalThis.window;
var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


var programArgs = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

if (typeof __filename != 'undefined') { // Node
  _scriptName = __filename;
} else
  /*no-op*/{}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {
  const isNode = globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';
  if (!isNode) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('node:fs');

  scriptDirectory = __dirname + '/';

// include: node_shell_read.js
readBinary = (filename) => {
  // We need to re-wrap `file://` strings to URLs.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename);
  assert(Buffer.isBuffer(ret));
  return ret;
};

readAsync = async (filename, binary = true) => {
  // See the comment in the `readBinary` function.
  filename = isFileURI(filename) ? new URL(filename) : filename;
  var ret = fs.readFileSync(filename, binary ? undefined : 'utf8');
  assert(binary ? Buffer.isBuffer(ret) : typeof ret == 'string');
  return ret;
};
// end include: node_shell_read.js
  if (process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  programArgs = process.argv.slice(2);

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

} else
if (ENVIRONMENT_IS_SHELL) {

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  try {
    scriptDirectory = new URL('.', _scriptName).href; // includes trailing slash
  } catch {
    // Must be a `blob:` or `data:` URL (e.g. `blob:http://site.com/etc/etc`), we cannot
    // infer anything from them.
  }

  if (!(globalThis.window || globalThis.WorkerGlobalScope)) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  {
// include: web_or_worker_shell_read.js
readAsync = async (url) => {
    assert(!isFileURI(url), "readAsync does not work with file:// URLs");
    var response = await fetch(url, { credentials: 'same-origin' });
    if (response.ok) {
      return response.arrayBuffer();
    }
    throw new Error(response.status + ' : ' + response.url);
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
  throw new Error('environment detection error');
}

var out = console.log.bind(console);
var err = console.error.bind(console);

var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

// perform assertions in shell.js after we set up out() and err(), as otherwise
// if an assertion fails it cannot print the message

assert(!ENVIRONMENT_IS_WORKER, 'worker environment detected but not enabled at build time (add `worker` to `-sENVIRONMENT` to enable)');

assert(!ENVIRONMENT_IS_SHELL, 'shell environment detected but not enabled at build time (add `shell` to `-sENVIRONMENT` to enable)');

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary;

if (!globalThis.WebAssembly) {
  err('no native wasm support detected');
}

// Wasm globals

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.
function _malloc() {
  abort('malloc() called but not included in the build - add `_malloc` to EXPORTED_FUNCTIONS');
}
function _free() {
  // Show a helpful error since we used to include free by default in the past.
  abort('free() called but not included in the build - add `_free` to EXPORTED_FUNCTIONS');
}

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');

// include: runtime_common.js
// include: runtime_exceptions.js
// Base Emscripten EH error class
class EmscriptenEH {}

class EmscriptenSjLj extends EmscriptenEH {}

// end include: runtime_exceptions.js
// include: runtime_debug.js
var runtimeDebug = true; // Switch to false at runtime to disable logging at the right times

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  if (!runtimeDebug && typeof runtimeDebug != 'undefined') return;
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}

// Endianness check
(() => {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) abort('Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)');
})();

function consumedModuleProp(prop) {
  var value = Module[prop];
  var msg = `Attempt to modify \`Module.${prop}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`;
  if (Array.isArray(value)) {
    value = new Proxy(value, {
      set(target, key, val) {
        abort(msg);
        return false;
      },
      defineProperty(target, key, descriptor) {
        abort(msg);
        return false;
      },
      deleteProperty(target, key) {
        abort(msg);
        return false;
      }
    });
  }
  Object.defineProperty(Module, prop, {
    configurable: true,
    get() { return value; },
    set() {
      abort(msg);
    }
  });
}

function makeInvalidEarlyAccess(name) {
  return () => assert(false, `call to '${name}' via reference taken before Wasm module initialization`);

}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
         name === 'FS_createDataFile' ||
         name === 'FS_createPreloadedFile' ||
         name === 'FS_preloadFile' ||
         name === 'FS_unlink' ||
         name === 'addRunDependency' ||
         // The old FS has some functionality that WasmFS lacks.
         name === 'FS_createLazyFile' ||
         name === 'FS_createDevice' ||
         name === 'removeRunDependency';
}

function missingLibrarySymbol(sym) {

  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      },
    });
  }
}

// end include: runtime_debug.js
// include: runtime_stack_check.js
const stackCookie1 = 0x02135467;
const stackCookie2 = 0x89BACDFE;

// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max)>>2)] = stackCookie1;
  HEAPU32[(((max)+(4))>>2)] = stackCookie2;
  // Also test the global address 0 for integrity.
  HEAPU32[((0)>>2)] = 1668509029;
}

function u32ToHexString(num) {
  return '0x' + (num >>> 0).toString(16).padStart(8, '0');
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var val1 = HEAPU32[((max)>>2)];
  var val2 = HEAPU32[(((max)+(4))>>2)];
  if (val1 != stackCookie1 || val2 != stackCookie2) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords ${u32ToHexString(stackCookie2)} and ${u32ToHexString(stackCookie1)}, but received ${u32ToHexString(val2)} ${u32ToHexString(val1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0)>>2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
// include: binaryDecode.js
// Prevent Closure from minifying the binaryDecode() function, or otherwise
// Closure may analyze through the WASM_BINARY_DATA placeholder string into this
// function, leading into incorrect results.
/** @noinline */
function binaryDecode(bin) {
  for (var i = 0, l = bin.length, o = new Uint8Array(l), c; i < l; ++i) {
    c = bin.charCodeAt(i);
    o[i] = ~c >> 8 & c; // Recover the null byte in a manner that is compatible with https://crbug.com/453961758
  }
  return o;
}
// end include: binaryDecode.js
// Memory management

var runtimeInitialized = false;



// When ALLOW_MEMORY_GROWTH is enabled, the conversion from Wasm
// memory to ArrayBuffer requires some additional logic.
function getMemoryBuffer() {
  return wasmMemory.buffer;
}

function updateMemoryViews() {
  // If we already have a heap that is resizeable/growable buffer we don't
  // need to do anything in updateMemoryViews.
  if (HEAP8?.buffer?.resizable) return;
  var b = getMemoryBuffer();
  HEAP8 = new Int8Array(b);
  HEAP16 = new Int16Array(b);
  HEAPU8 = new Uint8Array(b);
  
  HEAP32 = new Int32Array(b);
  HEAPU32 = new Uint32Array(b);
  
  
  HEAP64 = new BigInt64Array(b);
  
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// end include: runtime_common.js
assert(globalThis.Int32Array && globalThis.Float64Array && Int32Array.prototype.subarray && Int32Array.prototype.set,
       'JS engine does not provide full typed array support');

function preRun() {
  var preRun = Module['preRun'];
  if (preRun) {
    if (typeof preRun == 'function') preRun = [preRun];
    onPreRuns.push(...preRun);
  }
  consumedModuleProp('preRun');
  // Begin ATPRERUNS hooks
  callRuntimeCallbacks(onPreRuns);
  // End ATPRERUNS hooks
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  checkStackCookie();

  // Begin ATINITS hooks
  if (!Module['noFSInit'] && !FS.initialized) FS.init();
TTY.init();
  // End ATINITS hooks

  wasmExports['__wasm_call_ctors']();

  // Begin ATPOSTCTORS hooks
  FS.ignorePermissions = false;
  // End ATPOSTCTORS hooks

  checkStackCookie();
}

function postRun() {
  checkStackCookie();

  var postRun = Module['postRun'];
  if (postRun) {
    if (typeof postRun == 'function') postRun = [postRun];
    onPostRuns.push(...postRun);
  }
  consumedModuleProp('postRun');

  // Begin ATPOSTRUNS hooks
  callRuntimeCallbacks(onPostRuns);
  // End ATPOSTRUNS hooks
}

/**
 * @param {string|number=} what
 */
function abort(what) {
  Module['onAbort']?.(what);

  what = `Aborted(${what})`;
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

function createExportWrapper(name, func, nargs) {
  assert(func);
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return func(...args);
  };
}

var wasmBinaryFile;

function findWasmBinary() {
  return binaryDecode(' asm   Æ```~~`|` ` ``~`  ` ```	` ` `~`~`~~`||``` `~`~`|~`~~~~ `~~ `~~|¼env\ninvoke_vii envinvoke_iiii env__syscall_openat env__syscall_fcntl64 env__syscall_ioctl wasi_snapshot_preview1fd_write wasi_snapshot_preview1fd_read wasi_snapshot_preview1fd_close  wasi_snapshot_preview1fd_seek env	_abort_js envemscripten_resize_heap  env_emscripten_throw_longjmp 	\n  \r                \r \r\r\r      	  \r \r\r\r\r \rp\r\rAA A A Òmemory __wasm_call_ctors __main_argc_argv strerror T__indirect_function_table fflush emscripten_builtin_memalign emscripten_stack_get_end emscripten_stack_get_base setThrew emscripten_stack_init emscripten_stack_get_free _emscripten_stack_restore _emscripten_stack_alloc emscripten_stack_get_current 	 A+,-/NOpqu\n³ß K¶\'~ A A¼0ü @  E\r  AI\r  AtAÉ j! AtAÌÈ j! Aj"At"AàÈ j!	 AÔÈ j!\n AK!A !A!A !\r@ \r! !\r@@   j(  "A ü¿jA I\r  A á¿jAÀ I\r @ \r @  ( "I\r    / jI\r AK\r   	( "I\r    \n( jI\r A|qA|F\r  AqAÀ F\r  AxqAG\r@ AI\r  A: 0  Aj"60  Alj"A 6 B7 A :   6  6  ! \rAj" M\r AA !A !@@ At"Aj K\r Aj!A ! !\r@@ \r M\r \r \r kAv j"  Alj"( " I"!\r Aj  !  G\r   - Ar:  Aj" G\r @@@ AvAjAv"Aü "E\r Aù "\r û  A: 0 E\r A 6  B 7 B 7 B 7 B 7 A !A !A!	A !A !@@@@@  Að!A0!A !Aà !A!A!A !	A!  j!A!A !A !@@ At"\rAj K\r@    \rj( "\r OqAG\r  \r O\r  \r k"A~q"Aj K\r   Avj-   \rAvAqvAq\r @@  G\r  AH\r  Atý "\rE\r At! \r!  Atj 6  Aj! !A! Aj" G\r AÄ !@ AÄ I 	r\r AÀ !\r@ \r! !\r   j(  " I\r  O\r AqE\r@  k"A~q"Aj K\r   Avj-   AvAqvAq\r @@  G\r  AH\r  Atý "E\r At! !  Atj 6  Aj! !A! \rAj" M\r A !@ E\r A!A !@ A   Aj"\nAt"j( " F!@@A AvAqt"  Avj"\r-  "q\r    j"- ! -  ! \r  r:   Aj!AA AçK"\r j K\r  At r"Aðq!@@ \r\r @ AàqA G\r  ArAqAF\r   AtAujAj" Aur!A!A!\r@ AÀG\r   AtAuAðÿÿq AÿqrAtjAj" Aur!A!A!\r@ AêqAâG\r A!A!\r  AvA>qj AvAÀ qjAj" Aur!A!\rA!@ Aÿq"AG\r A!@ AG\r A!AA AþqAúF!@ AðÿqAÐÑG\r A!\rAA AqAF!A! - !	 - "At"Á!A!\rA!@ A°ÿqA°ÑG\r  A N\r A!@ AÿþqAßðG\r  AÿqAïM\r A!A! AàG\r A! AJ\r   	rAÿÿq"Av! A\rv!	 A\nv"Aq!@ A qE\r A!\r  	 sAtAq Atr  sAtAqr AtAàÿqr AtAþqrAs"Apr  jAj" Aur!AA Aq!A!\r  AtA q 	AtAqr Atr AtAàq AtAþqrr"Ar  jAj" Aur!A!@ Aj" \r j"O\r @@A AvAqt"\r  Avj"-  "q\r    \rr:   Aj! Aj" I\r A ! (0"	!\r@ 	E\r @ \r kAv j"Aj   Alj(  I"" \r  "\rI\r @  	O\r @  Alj"\r(  O\r \r \r- Ar:  Aj" 	G\r  Aq"\rAr  AI! AqAv!@@ E\r  Aj!@ A¿F Aq"A Gq\r A !@ AqE\r A!@ AqE\r A!AA Aq!   !@@ \rE\r  Aj K\r  Aq\r   Avj-   AvAqvAq\r @@@ \n F\r  ! AH\r  Atý "E\r At!  j 6  ! !A! ! \n!   !\r@@ Aj M\r  !@ AqE\r  !@ \rAq\r  !@  Avj-   AvAqvAqE\r  !@@@  F\r  ! AH\r  Atý "E\r At!  Atj 6  Aj! ! !A! \rAI\r Aj"\r K\r -  AqAG\r@ - At - "rAðÿqA |j   AI\r Aj-  !@@ A}j-  "AøqAðG\r  At A|j-  rAÀqAG\r  Aq\r Az! AØG\rA|!  j"Aj K\r   j"	- "AøqA(G\r Aq AqG\rAA Aq"! Av! \rA|q"Ar! 	-  !\nA !\r@   \r t j"	j"-  !@ E\r  - At r! 	 j K\r  Atj K\r \r \nG! \rAj!\r \r    j!A !@  "\r tj"	-  !@ E\r  	- At r!@ At j"Aj K\r   Avj-   AvAqvAq\r @@  G\r  AH\r  Atý "	E\r At! 	!  Atj 6  Aj! !A! \rAj! \r \nG\r  \n! ! \r   At6¸0@ E\r  A ; !  :    6  6 A 6  6  6  6  6   6  A : # û  û A !@@AA   "j"- "\rAçK j" K\r \rAt -  r!@@@ \rAèI\r  A|qAj!\r - At - "r!@@ AßðF\r  AßñG\r Aq\r Aÿq \rj"Aj K\r (0!\rA !@ \r M\rA! \r \r kAv j"  Alj"( " I"!\r Aj  !  G\r  \r Aÿqk"Aq\r Aj K\r (0!\rA !@ \r M\rA! \r \r kAv j"  Alj"( " I"!\r Aj  !  G\r  A¿þqAÚG\r At"A  k Aq \rj"Aj K\r (0!\rA !@ \r M\r \r \r kAv j"  Alj"( " I"!\r Aj  !  G\r A! AðqAG\r A|q AtAüqj"Aj K\r Aj! (0!\rA !@ \r M\rA! \r \r kAv j"  Alj"( " I"!\r Aj  !  G\r   -  r:  Aj M\r  (0"E\r AþAøý AF! At"AìÈ j!	 AÉ j! AtAÌÈ j!  Aj"At"AàÈ j! AÔÈ j!\nA ! AK!@@@@@@@@@@@@@  Alj"("A ü¿jA I\r  A á¿jAÀ I\r @@@ \r @  ( "\rI\r   \r  / jI\r AK\r   ( "\rI\r   \r \n( jI\r - Aq!\r A|qA|F\r AqAÀ F\r AxqAF\r \rAj - AqAj	 - Aq - AqAj \rAj  A6  (¤0Aj6¤0 A6  (¨0Aj6¨0 A6  	(  j6  (0Aj60  (0Aj60 A6  (¬0Aj6¬0A ! A 6  (0Aj60@@@@@@@@ Al"\r(ÐÂ  F\r \rAÐÂ j! \r(ÜÂ  F\r \r(èÂ  F\r A(F\r \r(ôÂ  F\r Aj!  \rAÐÂ j!@@ AqE\r  AþÿÀ q!\rB !@@B Bª¨P\r  §Al"(ÐÂ  \rG\r  AÐÂ j! B*Q\r@B BÔÐ P\r  §Al"(ÜÂ  \rF\r B|!   (0Aj60\n AÐÂ jAj! A$j! Aj! Aj! !\r   \rk6  (6  (0Aj60@ (A}q\r   (°0Aj6°0  (´0Aj6´0 A6  	(  j6  (0Aj60 A6   j6  (0Aj60 A6  ( 0Aj6 0  (¬0Aj6¬0 Aj" G\r ¾# Aà0k"$ @ E\r  A :  A !@  E\r  AI\r  E\r      A$j   - ©0\r  Av!A ! (!A ! @@@   Avj-    AqvAqE\r   At"	! @@  Aj"  O\r   Avj-    AvAqvAq\r @  G\r @ \r  ! A:   !  Atj"\n  6 \n 	6  Aj!  Av"  I\r  Aj"  I\r  û  (û  Aà0j$   %~# A× k"$ A!@@@@  AH\r A !Aöä!A!A !A !A !	A !\nA !@ !@@@@@@@@@@  Atj( "-  A-G"\r\r @@ - Aè G\r  - E\r A Ò \r A Ò E\r - Aï G\r - E\r A Ò E\r Aø Ò \r Aj"  H\rAÖ¤ Aè\rAA (Ä ¾ A!@@ AÕ Ò "E\r  AÞ Ò \r Aj"  N\r  Atj( "! ,  "!\r E\r@@ \rAFjAÿqAöI\r - !\r Aj! \r\r @@ A0G\r  - "\rA rAø F\r Õ AF\r Õ !\r A H\r \rAG\r - !\r \rÀA H\r , "A H\r , "A H\r \rAÿqAt Atr rAt r!\r@ A¼ Ò \r A!\n@ A· Ò \r A!@ A£ Ò \r A!	@ \r\r  - E\r   6A (Ä "\rA¨  Aj² AÖ¤ Aè\rA \r¾ A! E\rAØ AAA (Ä "\r¾ AÖ¤ Aè\rA \r¾ A!\n  Atj( ! A 6¤$ "A 6   A¤$jA à !\r ( \r  (¤$" F\r  -  E\r  6A (Ä "\rAÂ  Aj² AÖ¤ Aè\rA \r¾ A! \r  !  \r ! ! Aj"  H\r  \rAÖ¤ Aè\rAA (Ä ¾ @Aù "\r\r  A0Ô 6  6 A (Ä Aã  ² A!@@ A§ ± "E\r A!  \rAA µ !  !@ AG\r  \r  £ AF!    r!@  \r  \r  A6 A  "AJ\r  ( Ô 6  6A (Ä Aã  Aj²  \rû A!Aº !@@ AI\r @ \r-  "AÐ F\r  Aÿ G\r \r- AÅ G\r \r- AÌ G\rAÅ Aº  \r- AÆ F! \r- AË G\r  \r- AG\r  \r- AF\r \rû   6$  6 A (Ä A¿²  A j² A! \rû  A 6øV A 6ôV@@  AøÖ j AôÖ j \r  (øV"\r\r  60A (Ä AÒ   A0j² A!@@ (ôVAI\r A !@ \r(  AÕÍF\r @ \r(  AÕ½¢G\r A!@ \r(  AÕâG\r A! \r(  AÕ¤²G\rA! A 6äT A 6àT AèÔ jA Aü @ AÌ  AäÔ j AàÔ j \r  (äT"\rE\r  \r AèÔ j  (äTû   6ô AÎ 6ðAú  AðjÇ Aç !\rA !@@@@@  AÞ !\rA ! AÞ 6à  6ä  \r6è  (ôV6ìA   AàjÇ A !\rAà ! AÞ 6À A  6Ä A 6È  (ôV6ÌA   AÀjÇ A!\rA! AÞ 6Ð A¡ 6Ô A 6Ø  (ôV6ÜA   AÐjÇ Að!\rA0!  6¸  \r6´ A± 6°A  A°jÇ @ - èTE\r  A½ 6   (U"\r6¨ AÆÂ Aõ  \rAF6¬  AèÔ j6¤A¿  A jÇ  (øV (ôV  A¤$jA  A!@ - ©TAG\r   6PA (Ä A®¢  AÐ j²  (øVû @ - ¨TAG\r  A6d  6`A (Ä AÞ¸  Aà j²  (øVû A! Aj (¸T6  Aj (ÀT6  AðjAj )ÄT7  Aj )ÌT7  AÃ 6ð  (¤T"\r6ô  (¬T6ü AÆÂ Aõ  \rAF6øA¿  AðjÇ  A§ 6à  (ÜT6ä  (¼T"\r6è AÆÂ Aõ  \rAF6ìA  AàjÇ @ (¤T"E\r A ! A !A !A !@@@@@@@@ A¤$j  Alj"\r(  \r("AÚ  ! \r( !A !\r \r@ \r  \r( ! Aj!@@ A j \rAtj"(  Ò E\r \rAj"\r F\r  ("\rE\r A j Atj" 6 B7  6  Aj!  6A !\r  \rAj6  Aj"  G\r @ E\r  A· 6Ð  6Ô AÆÂ Aõ  AF6ØA§¡  AÐjÇ A ! AÄj! AÀj!@@@@@@ (¤T"E\r  A j Atj!A !\r@@ A¤$j \rAlj"(\r  ( ( " G\r  (!A !@@@@@@@ Al"\r(ÐÂ  F\r \rAÐÂ j! \r(ÜÂ  F\r \r(èÂ  F\r A(F\r \r(ôÂ  F\r Aj!  \rAÐÂ j!\r AqE\r A~q!\rB !@@B Bª¨P\r  §Al"(ÐÂ  \rG\r  AÐÂ j!\r B*Q\r@@B BÔÐ P\r  §Al"(ÜÂ  \rF\r B|! AÐÂ jAj!\r A$j!\r Aj!\r Aj!\rAí !@ \r("A}q\r Aä ! \r("\rA¢ Ò E\r  \rA Ò E\r AÆÂ Aä  \rA Ò !Aå !\r  \rAj"\r G\r  A j Atj( ! Aô !\rAÆÂ !A !\rAÚ !\rA¯ !\r  6   A j Atj"(6    6°  \r6´  ("\r6¸ AÆÂ Aõ  \rAF6¼A  A°jÇ  Aj" G\r  E\r   6¬ A± 6   6¤ AÆÂ Aõ  AF6¨Aê  A jÇ @ \nAqE\r  A¾ 6AÙ¡  AjÇ  (¤T"E\r A !\r Aj! Aj!@@ A¤$j \rAlj"("A~qAF\r  ( ! A« !@ AK\r  At(üÈ ! (! (!  (6  A· AÆÂ  6   6ø  6ô   6ð  AÆÂ  6üA¡  AðjÇ  (¤T! \rAj"\r I\r @@@@ - ¨TE\r Aò !\r@ - ©TE\r A !\r@ (ÐTE\r Aö !\r@ (´TE\r A !\r@ (ÄTE\r Að !\r@ (ÀTE\r A· !\r (ØTE\rAæ !\r  \r6Ô A  6ÐAù  AÐjÇ A ! A 6àAÉ  AàjÇ A!A!@@ AqE\r  (ôV! (øV!A !\r A : ÿV At(É !    AÀ« A AÿÖ j !   6ÀAÎ  AÀjÇ   6°AÛ  A°jÇ @ E\r @  \rAt)À« 7 A¹  A jÇ  \rAj"\r G\r @ - ÿVE\r  A6A  AjÇ  E\r E\rA ! E\r@ 	AqE\r   6 A¥ 6AÔ  AjÇ    (øV (ôV  AèÔ j A¤$j   !  6pA (Ä AÀ  Að j²   6@A (Ä AÔ£  AÀ j²  (øVû A! (øVû A !AÖ¤ Aè\rAA (È ¾  A× j$  «[~# AÐ\rk"	$ A¡ !\nA0!A !@@@@  A  !\nA!Aà !A !\n !@@@ A~j A !\nA¤ !\n !A !\rA !@@@@@@A (°õ "-  "E\r A !@ Aÿq \n j-  G\r  Aj"j-  "\r  \n j-  E\rA !@@AÌ (°õ "-  "E\r @ Aÿq \n j-  G\r  Aj"j-  "\r  \n j-  \r A!\rA !@@A(°õ "-  "E\r @ Aÿq \n j-  G\r  Aj"j-  "\r  \n j-  \r A!\rA !@Aä(°õ "-  "E\r @ Aÿq \n j-  G\r  Aj"j-  "\r  \n j-  \rA!\rA (¨õ "\r 	 \n6 	 6 A (Ä Aüµ  	² A!@@A°õ  \rAÌ lj"("E\r  ("E\r  ("\r 	 \n6 	 6A (Ä A¢¾  	Aj² A!@@ E\r   O\rA (Ä !A¤ !@ AK\r  At(É ! 	 6, 	 6( 	 6$ 	 6  AÒ´  	A j² A!AÀë A Aü  	AØj"A A¤ü  	A6ÀA\n!@ AK\r  At/°É ! 	A6Ô 	 6Ð 	 6Ì 	A6È 	 6Ä !@ -  \r  	AÐj"!@ A/× "Aj  "\r-  "E\r  ! A.F\r  	AÐjAr! 	 : Ð \r- "E\r  A.F\r  	AÐjAr! 	 : Ñ \r- "E\r  A.F\r  	AÐjAr! 	 : Ò \r- "E\r  A.F\r  	AÐjAr! 	 : Ó \r- "E\r  A.F\r  	AÐjAr! 	 : Ô \r- "E\r  A.F\r  	AÐjAr! 	 : Õ \r- "E\r  A.F\r  	AÐjAr! 	 : Ö \r- "E\r  A.F\r  	AÐjAr! 	 : × \r- "E\r  A.F\r  	AÐjA	r! 	 : Ø \r- 	"E\r  A.F\r  	AÐjA\nr! 	 : Ù \r- \n"E\r  A.F\r  	AÐjAr! 	 : Ú \r- "E\r  A.F\r  	AÐjAr! 	 : Û \r- "E\r  A.F\r  	AÐjA\rr! 	 : Ü \r- \r"E\r  A.F\r  	AÐjAr! 	 : Ý \r- "E\r  A.F\r  	AÐjAr! 	 : Þ \r- "E\r  A.F\r  	Aàj! 	 : ß \r- "E\r  A.F\r  	Aáj! 	 : à \r- "E\r  A.F\r  	Aâj! 	 : á \r- "E\r  A.F\r  	AÐjAj! 	 : â A :  @ Õ "A AI"E\r    ü\n  @@ \r  Aj! 	Aðj!\r (!A !@ \r Atj!@@ AI\r  Aÿ; Aü6   AtA¼Æ j(  @@  N\r   A(lj"-  \r A ; A : \n A 6   (" ("  J";     H";    k  k Am j;   A! Aj"AG\r @@ AG\r  	A )øÆ 7è 	A )ðÆ 7à 	A )èÆ 7Ø 	A )àÆ 7ÐA!A ! A~qAG\r 	A )¸Ç 7 	A )°Ç 7 	A )¨Ç 7ø 	A ) Ç 7ð 	A )Ç 7è 	A )Ç 7à 	A )Ç 7Ø 	A )Ç 7ÐA! Aj! 	Aðj! (!A !@  Atj! 	AÐj Atj( !\r@  N\r   A(lj" \r -  !\r Aÿ; Aü6   \r  Aj" G\r  	 6ìAÔ!A !A!@@@@@ 	(Ä"Av"\rAÿqA|j A!Aø!A!A !A !A !A !AÂ !@ Aÿq"AK\r A !@ \rA|jAÿq"AK\r  - ¬É !  vAqE\r @ AþqAG\r Aå !A !A !@ \rA|jAÿq"\rAK\r  \r- ¬É !@  vAqE\r A\n!@@ Aÿuj  A!@ AF\r A !A!@   K"\rrE\r A½ Añ  \r!@ E\r AÀë A  ü A  6Äë A  6Àë A  	)È7Èë A  	)Ð7Ðë  (! )! ) !A  6ôë A  7Øë A  7àë A  6èë @ E\r  	Aðj!A !\r@ \rAt"  j"/ ;øë   /;úë   /;üë   /;þë   - : ì   - 	: ì   )\n7ì   )7ì   )7ì  \rAj"\r G\r @ E\r  	Aðj! 	- úAÿq! 	- Aÿq! 	- ºAÿq! 	- ÚAÿq! 	- úAÿq! 	- Aÿq! 	- ºAÿq! 	- ÚAÿq!A !@@@  I\r  AtA ;øí A !\rA !@@@ E\r A! \r A ! E\r@ E\r  AF\r Aj! AF\r@ E\r  AF\r Aj! AF\r@ E\r  AF\r Aj! AF\r@ E\r  AF\r Aj! AF\r@ E\r  AF\r Aj! AF\r@ E\r  AF\r Aj! AF\r E\r AG\rA !\r AO\r  Aj!\r At"A : ùí   \r: øí    Atj"\r/ ;úí   \r/;üí   \r/;þí  Aj"AG\r Að AÿAü Að AÿAü  	 ((6Ä 	A¾ 6À 	 ($6¼ 	A  6¸ 	 (6´ 	A§ 6° 	 (6¬ 	Aß 6¨ 	 (H6¤ 	AÑ 6  	 (D6 	AÃ 6 	 (@6 	A´ 6 	 (,6 	A 6 	 ( 6 	Aõ 6 	 (6ü 	A 6ø 	 (<6ô 	A 6ð 	 (86ì 	A£ 6è 	 (46ä 	A­ 6à 	 (06Ü 	AÛ 6Ø 	 6Ô 	AÆ 6Ð 	 6Ì 	AÙ 6È 	 6Ä 	AÓ 6À  k!A !@@ 	AÀj Atj"("\rE\r Al"B 7ðî  ( ! A: ðî   \rA~q6ìî  B7äî   6àî @ AF\r  	AÀj Ar"Atj"("\rE\r Al"B 7ðî  ( ! A: ðî   \rA~q6ìî  B7äî   6àî  Aj!A B 7ò A B 7ò A A6üñ A Aå 6øñ  (0!A!A!A !@A !\nA !@ E\r @@  \nAlj"(\r  (E\r  (!A !@@@@@@@ Al"(ÐÂ  F\r AÐÂ j!\r (ÜÂ  F\r (èÂ  F\r A(F\r (ôÂ  F\r Aj!  AÐÂ j! AqE\r A~q!B !@@B Bª¨P\r  §Al"(ÐÂ  G\r  AÐÂ j! B*Q\r@@B BÔÐ P\r  §Al"(ÜÂ  F\r B|! AÐÂ jAj! \rA$j! \rAj! \rAj! AÐÂ kAm!@@A¢  ("Ò \r AÀÇ !@A  Ò \r AÌÇ !A AØÇ A  Ò !@ AqE\r  E\r At"(ð AJ\r@ ("\r j"AI\r  	A6 	 6 	 6A (Ä Aº  	Aj² A! Að j 6 @ \r\r  ! Aàþ j ( \rü\n   ! At"(ð AJ\r @ AI\r  	A6¤ 	 6 A (Ä A§¸  	A j² A! Að j! Al"\rB 7ðî  \rB 7èî  \r 6àî  \rAàî j!@@ \r A ! A6  (ð 6  (6A!  6  6  Aj! \nAj"\n (0"I\r  Aq!A ! ! \r A !\n@ (0"E\r A !\rA !\n@@@  \rAlj"("AK\r @ \nAI\r  	A6ä 	 6àA (Ä Aì·  	Aàj² A! ( !@@ AG\r  (!A !A ! (!A !@@@@@@@ Al"(ÐÂ  F\r AÐÂ j! (ÜÂ  F\r (èÂ  F\r A(F\r (ôÂ  F\r Aj!  AÐÂ j! AqE\r A~q!B !@@B Bª¨P\r  §Al"(ÐÂ  G\r  AÐÂ j! B*Q\r@@B BÔÐ P\r  §Al"(ÜÂ  F\r B|! AÐÂ jAj! A$j! Aj! Aj!@ ("E\r  	 6 	 6 	 6 	 (6A (Ä A»  	Aj² A! AÐÂ kAm(ð "AL\rA !A! \nAl"A 6ô   6ð   6ì   6è   6ä  A 6à  \nAj!\n \rAj"\r G\r  	 6ð 	 (6ôA (Ä A¢  	Aðj² A!@A (û "E\r A !A A \nk" AK!@@  G\r  	A6´ 	 6°A (Ä Aì·  	A°j² A!@@Aà÷  Alj"( "Aq\r  Aj M\r 	 6È 	 6Ä 	 6ÀA (Ä Aª½  	AÀj² A!@ ("\rAI\r  	 \r6Ô 	 6ÐA (Ä A¾¿  	AÐj² A! \nAl" \rAG6ô   (6ð  B 7è   6ä  A6à  \nAj!\n Aj" G\r  	B 7  	B 7¨ 	B 7° 	B 7¸ 	 6 	A 6 	 6 	 6 	A Ì 6  	 6¤ 	A6¨A!@ E\r  	A6¸ 	 6´ 	Aàþ 6°A! 	AÐjA AÀü @@@ AM\r A!\r@ \nAM\r A!\r@ \r  E\r A!\r Aj!@@  F"E\r A !@ E\r A !@@ 	Aj Aj"Atj(E\r  F\r A!\rA!@ 	( \r  	(¤E\r A!\r@ 	(¬E\r A!\r 	(¨\r  G\rA! AF\r @ 	Aj Aj"Atj(E\r  G\r A!@ E\r @ 	(°\r  	(´E\r A!\r 	(¼E\r A!\r 	(¸ r\rA! AF\r @ 	Aj Aj"Atj(E\r  G\r @ E\r A !A!@@ Al"(àî "\r A!\r@ -  \r A!\r@ Õ "AÿM\r A!\r@  jAj"AM\r A!\rA!\r@@ Aàî j"( @ (" I\r A!\r 5 5| 	Aj Atj5X\r A!\r Aj" G\r @ \nE\r A !@@ Al"(à " I\r A!\r@ Aà j"("AM\r A	!\r@ ("AqE\r A!\rA!\r ­B| 	Aj Atj5V\r@@ AG\r  ( I\rA!\r@  (ô " AF" I\r A!\r 	Aj Atj"5 5| 5T\r Aj" \nG\r A! 	A6 	 Aj"6 	 6@ E\r A !@  Al(àî Õ jAj! Aj" G\r  	 6 	AÔ6Ì 	  jAtAàj"6Ð 	  Atj"6Ô 	  jAj"A|q6Ø 	 \nAt" jAjApq"6   	(¤ j 	(¨!@ E\r   	(´ j 	(¸! 	 6ü 	 6Ü 	 6¤  j!@@ E\r  ! 	 6Ä 	 Aÿ jAÿq"6È 	 6 	 6À  j!@ 	(¨\r  	 6 	(¤" j! 	 6à  j! 	(¬"E\r  	 6Ä 	 Aÿ jAq"6È 	 6 	 6À  j!@ E\r  	(¸\r  	 6 	(´" j! 	 6ä  j! 	(¼"E\r  	 6Ä 	 Aÿ jAq"6È 	 6 	 6À  j! 	 6ô@ 	("\r  	 6Ä 	 6À 	 Aÿ jAq"6Ü 	  j"6ø 	 6à 	A 6ü 	 A j6¬ 	 A j"6¨ 	(¤A  	(¨AF!@ E\r  	(´ j  	(¸AF! 	 6° 	  jA¯j"\rApq"6´ 	  k6¸ 	(¤A  	(¨AF!@ E\r  	(´ j  	(¸AF! 	 6¼ 	  \rArjApq"6è 	  k6ä 	 AÈ j" k6 	  k"6ì 	 A|q"AÜ j6ð@@@@ 	(¨Aj  	 6à ! 	(¤ j! 	 6à ! 	(¤ j! 	  	(k6@ E\r @@@ 	(¸Aj  	 6ä 	 6ä ! 	  	(k6 	 A¼j"6Ø 	A Aµ  	5 	5¨|BT"6ÔA!\r 	A A 6Ð \r 	 \r 6T 	 6PA (Ä A  	AÐ j² A!@ ù "\r\r  	A0Ô 6d 	 6`A (Ä Aã  	Aà j² A!@@@@@ 	("E\r A !@ E\r  \rA  ü  	AÐjAj! \rA46  \rB7  \rA 6  \rBÿ±² À 7   	(ð! \rB 7 \\ \rB7 T \rBÀ 7 L \rB 7 D \rB´À7 < \rBÀ7 4 \rA,6 0 \rB´Ð7 ( \rA(6 $ \r 6   \r 	(ô6 d 	(ø!A! \rA6 t \rB7 l \r 6 h \r 	(Ü" 6 x \r 	(à"6  \r 6 | 	(ü! \rA6  \rB7  \r 6  \r 6  \r 	(¬6  \r 	(¨"6   \r 6  	(! \rA6 ´ \rB7 ¬ \r 6 ¨ \r 6 ¤ \r 	(ä"!6 ¸ 	(è! \rBÀ 7 Ì \rBÈ	7 Ä \r 6 À \r 6 ¼ \r 	(Ô"j"A :  @ E\r @ Al(àî "Õ ! 	AÀj Atj 6 @ Aj"E\r   j  ü\n    j! Aj" G\r  \r 	(Ðj!A !@  Aj"Atj" 	AÀj Atj( 6  @@@@ Al"(äî Aj   Aàî j"(  ("Atj( j - "A Gr6  (! A : \r AA :   6  AAA 	Aj Atj("AF AF:  A:  A;  A6   6  A :  A;  B 7  A :  !  G\r  	(! \r 	(Ì"j" 6   6  @ AF\r  Aj" Atj!@A !@ AlA°î j( "-  "E\r @ At Aÿqj"Aq"Av s Asq! - ! Aj! \r   Aj"Atj   pAtj"( 6   6  AK\r @ E\r  E\r  \r 	(üj  ü\n  @ 	(¤"E\r  E\r  \r 	(j 	(  ü\n   E\r 	(´"E\r E\r \r 	(j 	(° ü\n  A ! E\r 	 	(Ð 6¤ 	 6 A (Ä Aó  	A j²  	(Ø!@ \nE\r  	Aüj! \r j!A !@ Al"(ä "  (à "At"j( j! Aà j!A !@ (è "\r  (   (" AFAtj( j! \r  j( j j 6    Atj" 6  A!@ AG\r  (AtAj!  6  Aj" \nG\r  \r  jAÀë Aü\n   	(Ð! 	(! \r !j"B 7 @ B7 8  6 4 A6 0  6 , A6 ( B7    6  A\n6   6  A6   6  A6   6  A6   \r 	(ìjAðÇ AÙ ü\n   \r 	(ðj"B 7   B 7  B 7  B 7  B 7   	(! B7 À B7 ¸  6 ´  6 °  6 ¬ AÂ 6 ¨ B7   B7  B 7   6   6   6  A6  B07 x B7 p B7 h  6 `  6 \\ A6 X B°7 P BÀ 7 H B7 @  6 8  6 4 A6 0 BÐ 7 (  At6 d   jAtAj6 < 	( ! 	(¤! B7 è B 7 à  6 Ü  6 Ø  6 Ô A6 Ð B 7 È 	)¨! 	(°! B7  B 7   6   7 ü B¦7 ð A6 ø 	)´! 	(¼! B7 ¸ B 7 °  6 ¬  7 ¤ B¬7  A6   	)Ü! A 6 ä B7 Ü B7 Ô B´7 À A6 È  B 7 Ì 	)ä! A6  BÀ 7  BÈ07 ü BÁà 7 è A6 ð  B 7 ô 	)À! 	(È! B7 ° B 7 ¨  6 ¤  7  BÊ7  A6  	(ì! \r 	(ðj"A 6 Ü B7 Ô BÙ 7 Ì  6 È B 7 À BÏ07 ¸ 	(Ø!  A¤ ± "\r 	 ( Ô 6t 	  6pA (Ä Aã  	Að j²  \rû A!A!@@ \rA  ¾  G\r   E\r 	 ( Ô 6 	  6A (Ä Aã  	Aj²  \rû  \rû  	Aj 6  	AðjAj 6  	AðjAj 6  	AðjAj 6  	 6ø 	  6ô 	Að 6ð 	  j j6üAæ  	AðjÇ A\n!@ AK\r  At/°É ! 	AÐjAj \n6  	AÐjAjAÆÂ Aõ  \nAF6  	 6Ô 	Añ 6Ð 	 6Ø 	AÆÂ Aõ  AF6ÜAÄ  	AÐjÇ @@ Av"A`jAÞ K\r  	 : ° Av"AÿqA`jAÞ K\r  	 : ± Av"AÿqA`jAÞ K\r  	 : ² AÿqA`jAÞ K\r  	A : ´ 	 : ³ 	 6° 	 	A°j6´ 	AÀjAA¤  	A°jÍ  	 6À 	AÀjAAÔ  	AÀjÍ @@ Av"A`jAÞ K\r  	 : Ë\r Av"AÿqA`jAÞ K\r  	 : Ì\r Av"AÿqA`jAÞ K\r  	 : Í\r AÿqA`jAÞ K\r  	A : Ï\r 	 : Î\r 	 6 	 	AË\rj6 	A°jAA¤  	AjÍ  	 6  	A°jAAÔ  	A jÍ  	A² 6 	 	AÀj6 	 	A°j6Aö  	AjÇ A ! 	 ( 6H 	 \n6D 	 6@A (Ä A·  	AÀ j² A! 	 64 	 60A (Ä A¢  	A0j² A! 	AÐ\rj$  ö@@ -  \r A !@ - \r A!@ - \r A!@ - \r A!@ - \r A!@ - \r A!@ - \r A!@ - \r A!@ - \r A!@ - 	\r A	!@ - \n\r A\n!@ - \r A!@ - \r A!@ - \r\r A\r!@ - \r A!@ - \r A!@ - \r A!@ - \r A!@ - \r A!@ - \r A!AA - !  A\nj! @ E\r     ü\n     jA :  &A¶ !@  AK\r   At(¸É ! Ö# Ak"$ A!@ E\r  -  E\r  Õ !@  A§ ± "\r   ( Ô 6   6 A (Ä AÅ  ²  A A¸  » ! A A ¸ @ A J\r   @ ù "	\r   @ 	A  µ  F\r    6A (Ä AÃ  Aj²  	û     @@ Ajj"A  Aëÿ{j"\n \n K"H\r @ 	 j"\n(  AÐ0F\r  J!\n Aj! \n\r    6A (Ä AÊÁ  Aj²  	û @@@ \n/ \n"E\r A !A  k!\r \n( !@@@ A.j" K\r  	 j"(  AÐF\r  60A (Ä Aè  A0j²  /  ! / !@  / "\nK\r   \nj \rjA.j  Ã \r @@ ( *"\nAj" K\r  	 \nj"\n(  AÐ F\r  6@A (Ä A  AÀ j² @  ( "j \n/ "j \n/ "j M\r   6PA (Ä Aô  AÐ j²  / \n! ( "Ajù "E\r \n j jAj!\n  jA :  @@@ 	  E\r  \n ü\n    6  6  Aj \n Aj !\n (!@ \n\r   F\r  6|  6x   6t  \n6pA (Ä AÔ  Að j²  û   6`A (Ä A  Aà j²  û   \nj j j! Aj" G\r    6$  6 A (Ä Aß  A j²  	û A! 	û   6   6 A ! Aj$     A¬    è# Ak"$ A !@  E\r  E\r A ! A Aü @  A° Ù "E\r  A:Ð "E\r   "-  A"G\r A !@ AK!@@ - "E\r A"F\r Aj! \r   j :   Aj!  jA :    A Ù "E\r  AÛ Ð "E\r A !@ Aj "-  AÛ G\r  Aj!A !@@ Aj "-  A"F\r  !  A(lj!A ! @  AK!@@@ - "\r  ! A"F\r Aj! \r    j :    Aj!    jA :   Aj ! A 6  AjA\ná !@  ("G\r  !  6  ! A 6  AjA\ná !@  ("G\r  !  6@  "-  A"F\r  ! A j!A ! @  AK!@@@ - "\r  ! A"F\r Aj! \r    j :    Aj!    jA :   Aj! Aj!@@ -  "E\r@ AÝ F\r  Aj! Aj!  "-  AÛ G\r AI! ! \r   6 Aj$  S @@@  -  Awj2        Aj!     )# AÐk"$    6 ( !   6 A 6   6 ( !  A 6  B 7   6 A$j"A  A! A°jAr!A ! @@@@@  \r@ (!@@ ( " A L\r   !	 (!\n (! (!@@  G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r	   !   Aj"6 \n j-  !   Aj"	6    t r!  AyH!\r ! 	!  \r\r   	Aj" 6   Au"6@@ 	AM\r   !	 (! (! (!\n@@  \nG\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r	   !   Aj"\r6  j-  !   Aj"	6    t r!  AzH! \r! 	!  \r   	A~j" 6   Au"\r6A!\n@@@@@@@@@@ Aq \r  B 7 (" Aj"	 ("K\r\r   Aj"\r6 ("  j-  !   Aj"6  \rj-  !\r   Aj" 6A~!\n   j-  sAÿqAÿG\r  	6   j-   \rsAÿG\r \rAt"\r r"  	j"	 K\r\r (  j!@ (E\r @  (M\r A!  E\r	 \rAj!@ AqE\r   ("	Aj6 	 (j-  !	  ("\rAj6 \r (j 	:    Aj!  A  kF\r	@  ("Aj6  (j-  !  ("Aj6  (j :    ("Aj6  (j-  !  ("Aj6  (j :    A~j" \r \n  	6  6A - ð \rA !A A  6À¤ A A 6¼¤ A A¤ 6È¤ A Aà£ 6Ä¤ @ AÀj Atj" A;  B 7  B 7 A!  A	j"AG\r @ AÀj  Atj"B¤À7 B¤À7   Aj" AG\r  B 7ø B 7ð BðÀ7è BðÀ7à BðÀ7Ø BðÀ7Ð BðÀ7È BðÀ7ÀA A 6² A A¼¤  AÀjA  A (² ! A A 6² A!@  E\r A (² "E\r     "E\r   !  AF\r	 A6ø BÐÀ7ð BÐÀ7è BÐÀ7à BÐÀ7Ø BÐÀ7Ð BÐÀ7È BÐÀ7ÀA A 6² A AÄ¤  AÀjA A (² ! A A 6² A!  E\rA (² "E\r    "\r\r  Aðj6  A°j6  Aj6  AÐj6@@ 	AM\r   ! (! (! (!\n@@  \nG\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r   !   Aj"	6  j-  !   Aj"6    t \rr!\r  A}H! 	! !  \r   A{j" 6   \rAu"	6@@ A	M\r   ! (! (! (!@@  G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r   !   Aj"6  j-  !   Aj"6    t 	r!	  A}H!\n ! !  \n\r   A{j" 6   	Au"6@@ AM\r   ! (! (! (!@@  G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r   !   Aj"\n6  j-  !   Aj"6    t r!  A|H! \n! !  \r   A|j"6   Au" 6A}!\n \rAq"AK\r 	Aq"	AK\r Aj! 	Aj! Aq"Aj!	A !\r (! (! (!\n@ \r!@@ AM\r  !\r@ \n G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r   !   \nAj"6 Ar!\r  \nj-   t  r!  !\n AÐj At.ðË Atj  Aq;   \rA}j"6    Au" 6 Aj"\r 	F\r    !  AG\r@ AK\r A ! @ Aq"AF\r @ AÐj 	At.ðË AtjA ;  	Aj!	   Aj" sAG\r  AtjAI\r @ AÐj 	At" .ðË AtjA ;  AÐj  .òË AtjA ;  AÐj  .ôË AtjA ;  AÐj  .öË AtjA ;  	Aj"	AG\r A A 6² A  Aj AÐjA !	A (² ! A A 6² A!@  E\r A (² "E\r     "E\r\n   !  AF\r@ 	E\r A|!\n  j!A ! (! (! (! ( ! (!@A!\rA !\nA !A ! !	 ! @@@ 	\r   ! \r! 	 \rj!   	Atj!@@ Au! \n Aqr"\n  . "k H\r \rAj!\r \nAt!\n  j!  Aj!   jAt! ! 	Aj"	\r  AG\rAv!\n  6   \rkAq"6  Aðj Atj \n kAtj. "\nA H\r@@ \nAK\r  AÐj Atj \n;  Aj! !@@@@ \nAÿÿqApj @ \r A{!\n\n AÐj AtjA~j/ ! @@ AM\r  ! !@  G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r   !   Aj"6 Ar!  j-   t r!  A~j"\n6   Au"6 AqAj!@@ AM\r  ! ! @  G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r   ! \r  Aj"6 Ar!   j-   t r!   A}j"\n6   Au"6 AqAj!A ! A ! @@ AG\r  !A !\n@  G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r   !   Aj"6 Aj!\n  j-   t r!  \n6   Au"6 Aÿ qAj!@  j L\r Az!\nA !	 !@ Aq"\rE\r @ AÐj Atj  ;  Aj! Aj! 	Aj"	 \rG\r @ AI\r @ AÐj Atj"	  ;  	Aj  ;  	Aj  ;  	Aj  ;  Aj! A|j"\r  ! \n!  H\r@ /Ð\r Aw!\nA A 6² A  Aj AÐj  !A (² ! A A 6² A!	@  E\r A (² "E\r     "	E\r\r   !  	AF\r@ E\r Ay!\n A H\r  .² .°jG\rA A 6² A  Aj AÐj Atj  !A (² ! A A 6² A!	@  E\r A (² "E\r     "	E\r\r   !  	AF\r@ E\r Ax!\n A H\r  .Ò .ÐjG\rA A 6² A  Aj Aj Aj !\nA (² ! A A 6² A!@  E\r A (² "E\r     "E\r\r   !  AF\r@  G\r A A 6² A  A A (² ! A A 6² @  E\r A (² "E\r     E\r\r   !   Aj" 6A k"A AH!	  j-  !  ! !\r !  A A: ð A A 6² A  AjA¼¤ AÄ¤  !\nA (² ! A A 6² A!@  E\r A (² "E\r     "E\r   !  AF\r \n\r AqE\r A !\nA! \nAN\r  (6   (6  \n! AÐj$       # A k!  ( "B 7 B 7 B 7 B 7 A !A !@ AH\r  Aq!A !A !@@ AI\r  Aüÿÿÿq!	A !A !\n@   Atj". Atj" / Aj;   .Atj" / Aj;   .Atj" / Aj;   .Atj" / Aj;  Aj! \nAj"\n 	G\r  E\r@   Atj. Atj" / Aj;  Aj! Aj" G\r  . !@  F\r A ."k! AJ\r  At ."k"A H\r  At ."k"A H\r  At ."\nk"A H\r  At .\n"k"A H\r  At ."k"A H\r  At ."	k"A H\r  At ."\rk"A H\r  At ."k"A H\r  At ."k"A H\r  At ."k"A H\r  At ."k"A H\r  At ."k"A H\r  At ."k"A H\r  At .k"A H\r A ! A ;  ;   j";   j";  \n j";\n   j";   j";  	 j";  \r j";   j";   j";   j";   j";   j";   j; AH\r @ AF\r  Aq! Aþÿÿÿq!A !A !@@  Atj. "E\r   (!  Atj" . "Aj;   Atj ; @  Ar"Atj. "E\r   (!\n  Atj" . "Aj;  \n Atj ;  Aj! Aj" G\r  E\r  Atj. "E\r   (!  Atj" . "Aj;   Atj ;  @@    "A H\r@@@@ AÿK\r @  ( "E\r @  ("  (G\r A  j :    (Aj! AF\r@ AM\r Av At"AîÅ j. !  (!@@@@  (" A®Æ j. "H\r  !	  (!  (!\n@  \nF\r   Aj"6  ( j-  !   Aj"	6  t r! ! 	! 	 H\r    	 k6    u6    "A H\r At".ðÊ !  (!@@  (" .°Ë "\rH\r  !	  (!  (!@  F\r   Aj"\n6  ( j-  !   Aj"	6  t r! \n! 	! 	 \rH\r    	 \rk6    \ru6@  (" A \rtAsq j"	O\r Au  A tAsq" j"j!  ( E\r@   (M\r A E\r Aj!@ AqE\r   ( " j   	kj-  :      (Aj"6 Aj! A  kF\r@  ( " j   	kj-  :      (Aj"6  ( " j   	kj-  :      (Aj"6 A~j"\r   A jA    A jA     6 AG\rA ! µ ( Aj!  (!A !A!A !A !  ("!	@@@ 	\r  !\n ! 	 j!  	Atj!\n@ Au!@ Aq r" . "k N\r    6    kAq6 ( Atj  kAtj.  Aj! At!  j! Aj!  jAt! ! 	Aj"	\r  AG\r Av@  ("  (F\r    Aj6A k"A AH!	  ( j-  ! ! \n!  A jA   AÌ¤     !    (  !@  -  Aq\r    Ä !  (8!@  (4"E\r   68@ E\r   64@ (   G\r   6 Å   (`û   û   r\r   ( AvAq@  \r A !@A (°« E\r A (°«  !@A (ª E\r A (ª   r!@Ä ( " E\r @@  (  (F\r     r!  (8" \r Å  @  (  (F\r   A A   ($    (\r A@  ("  ("F\r     k¬A  ((    A 6  B 7  B 7A     (H"Aj r6H@  (  (F\r   A A   ($    A 6  B 7@  ( "AqE\r    A r6 A    (,  (0j"6   6 AtAuX# Ak"$ A!@    \r    AjA  (   AG\r  - ! Aj$   A\n   ¤ c@@  (L"A H\r  E\r AÿÿÿÿqÊ (G\r@  ("  (F\r    Aj6 -    ¡   ¥ r@  AÌ j"¦ E\r   ¢ @@  ("  (F\r    Aj6 -  !   ¡ ! @ § AqE\r  ¨       ( "Aÿÿÿÿ 6    ( !  A 6  \r   A¿ }A!@  A+Ð \r   -  Aò G! Ar   Aø Ð "A r   Aå Ð " AÀ r  -  " Aò F"Ar   A÷ F"Ar   Aá Fò~@ E\r    :     j"Aj :   AI\r    :    :  A}j :   A~j :   AI\r    :  A|j :   A	I\r   A   kAq"j" AÿqAl"6    kA|q"j"A|j 6  A	I\r   6  6 Axj 6  Atj 6  AI\r   6  6  6  6 Apj 6  Alj 6  Ahj 6  Adj 6   AqAr"k"A I\r  ­B~!  j!@  7  7  7  7  A j! A`j"AK\r      (<  Â # A k"$    ("6  (!  6  6   k"6  j!@@@@@  (< AjAr Aj  F""AA " Aj ö E\r  !@  ("F\r@ AJ\r  ! AA   ("K"	j" (   A  	k"j6  AA 	j" (  k6   k! !  (<   	k" Aj ö E\r  AG\r    (,"6   6     (0j6 !A !  A 6  B 7    ( A r6  AF\r   (k! A j$  ö# A k"$   6A !    (0"A Gk6  (,!  6  6A !@@@  (< AjA Aj ö \r  ("A J\rA A !    (  r6  !  ("M\r     (,"6     kj6@  (0E\r    Aj6  jAj -  :   ! A j$        (<®  ö # A k"$ @@@@AÚ  ,  Ð \r  A6 A	ù "\rA ! A Aª @ A+Ð \r  AA -  Aò F6 @@ -  Aá F\r  ( !@  AA  "Aq\r   Ar6  A Aj   ( Ar"6  A6P A60   6<  Aj6,@ Aq\r   Aj6   A¨  \r  A\n6P A 6( A 6$ A 6  A 6@A - Ñ¤ \r  A6L Æ ! A j$  # Ak"$ @@@AÚ  ,  Ð \r  A6  © ! A¶6 A !A   Ar  â " A H\r   ° "\r   A ! Aj$  7# Ak"$   6    ó ! Aj$    @    ü\n    @ AI\r     ³    j!@@   sAq\r @@  Aq\r   !@ \r   !  !@  -  :   Aj! Aj"AqE\r  I\r  A|q!@ AÀ I\r   A@j"K\r @  ( 6   (6  (6  (6  (6  (6  (6  (6  ( 6   ($6$  ((6(  (,6,  (060  (464  (868  (<6< AÀ j! AÀ j" M\r   O\r@  ( 6  Aj! Aj" I\r @ AO\r   !@ AO\r   ! A|j!  !@  -  :    - :   - :   - :  Aj! Aj" M\r @  O\r @  -  :   Aj! Aj" G\r   Ç  (H"Aj r6H  l!@@ (" ("G\r  !     k"   I"´    j6  k!   j!  A  !@ E\r @@@   \r      (   "\r  k n   j!   k"\r  ±@@ AI\r  A6 @ AG\r   ("E\r     (k¬}!@  (  (F\r   A A   ($    (E\r  A 6  B 7      ((  B S\r   B 7    ( Aoq6 A A     ¶     ¬ · ~  ((!A!@  -  AqE\r AA  (  (F!@  B     "B S\r @@  ("E\r A!  ("E\rA!    j(  k¬|! \n   ¹ +~@  º "BS\r  A=6 A §\\    (H"Aj r6H@  ( "AqE\r    A r6 A  B 7    (,"6   6     (0j6A æ@@ ("\r A ! ¼ \r (!@   ("kM\r      ($  @@ (PA H\r  E\r  !@@   j"Aj-  A\nF\r Aj"E\r      ($  " I\r  k! (!  !A !   ´   ( j6  j! ,@    l" ½ " G\r  A    n A   K# Ak"$     Aÿq Aj ö ! )! Aj$ B  @@@ AI\r    rAq\r@  (  ( G\r Aj!  Aj!  A|j"AK\r  E\r@@  -  " -  "G\r Aj!  Aj!  Aj"E\r   kA  A¥ À A¥  A¥ Á 4  Ä "( "68@ E\r    64   6 Å   ;# Ak"$   6A ª    ó ! Aj$   A* È  A¥ NÉ ! A A 6À¥ A   6¨¥ A A A k6Ä¥ A A (© 6È¥ 	   9# Ak"$   6     ô ! Aj$   A  B     Ñ " A   -   AÿqF÷@@@@ Aÿq"E\r @  AqE\r @  -  "E\r  AÿqF\r  Aj" Aq\r A  ( "k rAxqAxG\r Al!@A  s"k rAxqAxG\r  (!  Aj"!  A krAxqAxF\r     Õ j  !@ " -  "E\r  Aj!  AÿqG\r   Y -  !@  -  "E\r   AÿqG\r @ - !  - "E\r Aj!  Aj!   AÿqF\r   AÿqkEA÷ !@  AK\r @@  \r A !   At/Ð " E\r  A j!      Ó   !@@  AqE\r @  -  \r     k  !@ Aj"AqE\r -  \r @ "Aj!A ( "k rAxqAxF\r @ "Aj! -  \r    k:@ E\r  Aÿq!@@   Aj"j"-   F\r E\r  A       Õ AjÖ é A G!@@@  AqE\r  E\r  Aÿq!@  -   F\r Aj"A G!  Aj" AqE\r \r  E\r@  -   AÿqF\r  AI\r  AÿqAl!@A  (  s"k rAxqAxG\r  Aj!  A|j"AK\r  E\r Aÿq!@@  -   G\r     Aj!  Aj"\r A @ ,  "\r   A !@   Ð " E\r @ - \r     - E\r @ - \r    Ú   - E\r @ - \r    Û   - E\r @ - \r    Ü    Ý ! w  - "A G!@ E\r   -  At r" -  At - r"F\r   Aj!@ " - "A G! E\r  Aj! AtAþq r" G\r   A    Aj!  - "A G!@@ E\r   - At  -  Atr Atr" - At -  Atr - Atr"F\r @ Aj! - " A G!  E\r !   rAt" G\r  ! A~jA     Aj!  - "A G!@@ E\r   - At  -  Atr  - Atr r" (  "   AxsAþxqAv  Axs"F\r @ Aj! - " A G!  E\r ! At  r" G\r  ! A}jA  # A k"$  B 7 B 7 B 7 B 7A !@@@@@@ -  "\r A!A!@   j-  E\r  AÿqAtj Aj"6  Aj AvAqj" ( A tr6   j-  "\r A!A! AK\rA!A!A ! A !	A!\nA!@@@  j j-  "  j-  "G\r @  \nG\r  \n 	j!	A! Aj!@  M\r   k!\nA! !	A! 	! 	Aj!	A!\n  	j" I\r A!A !A!	A!A!@@@  j j-  "  	j-  "G\r @  G\r   j!A! Aj!@  O\r  	 k!A! 	!A! ! Aj!A!  j"	 I\r  \n!@@     Aj AjK""\nj   "Aj"Ã E\r    Asj"  KAj!\nA !\r  \nk!\r A?r!A !  !@ !	@   "k O\r A !  A  Ø "  j ! E\r   k I\rA ! Aj  j" Aj-  "AvAqj(  vAqE\r @   Atj( "F\r    k" 	  	Kj! A !@   	  	K""j-  " E\r @@  Aÿq  j-  G\r  Aj"j-  " E\r    kj! A ! !@ E\r @@  Aj"j-    j-  G\r  	M\r   \nj!  \r! !  A j$   ×~# Ak"$ @@@@ A$J\r A !  -  "\r  ! A6 B !  !@@ Àß E\r - ! Aj"! \r  !@ Aÿq"AUj  AA  A-F! Aj!@@ ArAG\r  -  A0G\r A!	@ - AßqAØ G\r  Aj!A!\n Aj! A !\n A\n !\nA !	 \n­!A !B !@@@ -  "APj"AÿqA\nI\r @ AjAÿqAK\r  A©j! A¿jAÿqAK\r AIj! \n AÿqL\r  B  B  A!@ )B R\r   ~"\r ­Bÿ"BV\r  \r |!A!	 ! Aj! ! @ E\r      	6 @@@ E\r  AÄ 6  A  BP! !  T\r@ \r  §Aq\r  AÄ 6  B|!  X\r  AÄ 6   ¬" }! Aj$     A F  AwjAIr     BÿÿÿÿÞ §     BÞ §! @  A`I\r  A   k6 A!     A  Ø "  k  ~@  ½"B4§Aÿq"AÿF\r @ \r @@  D        b\r A !  D      ðC¢ ä !  ( A@j!  6     Axj6  BÿÿÿÿÿÿÿBð?¿!   ® @@ AH\r   D      à¢! @ AÿO\r  Axj!  D      à¢!  Aý AýIApj! AxJ\r   D      `¢! @ A¸pM\r  AÉj!  D      `¢!  Aðh AðhKAj!   Aÿj­B4¿¢æ# AÐk"$   6Ì A jA A(ü   (Ì6È@@A   AÈj AÐ j A j  ç A N\r A!     ( "A_q6 @@@@  (0\r   AÐ 60  A 6  B 7  (,!   6,A !  (\rA!  ¼ \r    AÈj AÐ j A j  ç ! A q!@ E\r   A A   ($    A 60   6,  A 6  (!  B 7 A !    ( " r6 A  A q!  AÐj$   ~# AÀ k"$   6< A)j! A\'j!	 A(j!\nA !A !@@@@@A !@  AÿÿÿÿsJ\r  j! (<"\r!@@@@@@ \r-  "E\r @@@@ Aÿq"\r  ! A%G\r !@@ - A%F\r  ! Aj! - ! Aj"! A%F\r   6<  \rk" Aÿÿÿÿs"J\r\n@  E\r    \r è  \r Aj!A!@ , APj"A	K\r  - A$G\r  Aj!A! !  6<A !@@ ,  "A`j"AM\r  !A ! !A t"AÑqE\r @  Aj"6<  r! , "A`j"A O\r !A t"AÑq\r @@ A*G\r @@ , APj"A	K\r  - A$G\r @@  \r   AtjA\n6 A !  Atj( ! Aj!A! \r Aj!@  \r   6<A !A !  ( "Aj6  ( !A !  6< AJ\rA  k! AÀ r! A<jé "A H\r (<!A !A!@@ -  A.F\r A !@ - A*G\r @@ , APj"A	K\r  - A$G\r @@  \r   AtjA\n6 A !  Atj( ! Aj! \r Aj!@  \r A !  ( "Aj6  ( !  6< AJ!  Aj6<A! A<jé ! (<!@ !A! ",  "AjAFI\r Aj! A:l jAß¤ j-  "AjAÿqAI\r   6<@@ AF\r  E\r\r@ A H\r @  \r   Atj 6 \r   Atj) 70  E\r	 A0j   ê  AJ\rA !  E\r	  -  A q\r Aÿÿ{q"  AÀ q!A !AÛ ! \n!@@@@@@@@@@@@@@@@@ -  "À"ASq  AqAF  "A¨j!	\n  \n!@ A¿j  AÓ F\rA !AÛ ! )0!A !@@@@@@@   (0 6  (0 6  (0 ¬7  (0 ;  (0 :   (0 6  (0 ¬7  A AK! Ar!Aø !A !AÛ ! )0" \n A që !\r P\r AqE\r AvAÛ j!A!A !AÛ ! )0" \nì !\r AqE\r   \rk"  J!@ )0"BU\r  B  }"70A!AÛ !@ AqE\r A!AÜ !AÝ AÛ  Aq"!  \ní !\r  A Hq\r Aÿÿ{q  !@ B R\r  \r  \n!\r \n!A !  \n \rk Pj"  J!\r - 0! (0"AÓ  !\r \r \r Aÿÿÿÿ AÿÿÿÿIã "j!@ AL\r  ! !\r ! ! -  \r )0"PE\rA !	@ E\r  (0!A !  A  A  î  A 6  >  Aj60 Aj!A!A !@@ ( "E\r Aj ø "A H\r   kK\r Aj!  j" I\r A=! A H\r\r  A    î @ \r A !A ! (0!@ ( "\rE\r Aj \rø "\r j" K\r   Aj \rè  Aj!  I\r   A    AÀ sî     J!	  A Hq\r\nA=!   +0        "A N\r - ! Aj!   \r\n E\rA!@@  Atj( "E\r  Atj   ê A! Aj"A\nG\r @ A\nI\r A!@  Atj( \rA! Aj"A\nF\r A!  : \'A! 	!\r \n! ! \n!   \rk"  J" AÿÿÿÿsJ\rA=!   j"  J" K\r  A    î     è   A0   Asî   A0  A î    \r è   A    AÀ sî A !A=!  6 A! AÀ j$   @  -  A q\r     ½ {A !@  ( ",  APj"A	M\r A @A!@ AÌ³æ K\r A  A\nl"j  AÿÿÿÿsK!   Aj"6  , ! ! ! APj"A\nI\r  ¾ @@@@@@@@@@@@@@@@@@@ Awj 	\n\r  ( "Aj6    ( 6   ( "Aj6    4 7   ( "Aj6    5 7   ( "Aj6    4 7   ( "Aj6    5 7   ( AjAxq"Aj6    ) 7   ( "Aj6    2 7   ( "Aj6    3 7   ( "Aj6    0  7   ( "Aj6    1  7   ( AjAxq"Aj6    ) 7   ( "Aj6    5 7   ( AjAxq"Aj6    ) 7   ( AjAxq"Aj6    ) 7   ( "Aj6    4 7   ( "Aj6    5 7   ( AjAxq"Aj6    + 9       5 @  P\r @ Aj"  §Aq- ð¨  r:    B" B R\r  . @  P\r @ Aj"  §AqA0r:    B" B R\r  ~@  BT\r @ Aj"  " B\n" B\n~}§A0r:   BÿÿÿÿV\r   §!@  B\nT\r @ Aj" " A\nn"A\nlkA0r:   Aã K\r @ E\r  Aj" A0r:   # Ak"$ @  L\r  AÀq\r     k"A AI"ª @ \r @   Aè  A~j"AÿK\r     è  Aj$      A A æ È~~|# A°k"$ A ! A 6¬@@ ò "	BU\r A!\nAå ! "ò !	@ AqE\r A!\nAè !Aë Aæ  Aq"\n! \nE!@@ 	Bøÿ Bøÿ R\r   A   \nAj" Aÿÿ{qî     \nè   A¸ Aã  A q"\rAá Aó  \r  bAè   A    AÀ sî     J! Aj!@@@@  A¬jä "  "D        a\r   (¬"Aj6¬ A r"Aá G\r A r"Aá F\rA  A H! (¬!  Acj"6¬A  A H! D      °A¢! A Aè A Hj"!\r@ \r ü"6  \rAj!\r  ¸¡D    eÍÍA¢"D        b\r @@ AN\r  ! ! \r! ! !@ A AI!@ \rA|j" I\r  ­!B !	@  5   	|" BëÜ"	BëÜ~}>  A|j" O\r  BëÜT\r  A|j" 	> @@ \r" M\r A|j"\r( E\r   (¬ k"6¬ !\r A J\r @ AJ\r  AjA	nAj! Aæ F!@A  k"\rA	 \rA	I!@@  I\r A A ( !\rAëÜ v!A tAs!A ! !\r@ \r \r( " v j6   q l! \rAj"\r I\r A A ( !\r E\r   6  Aj!  (¬ j"6¬   \rj" "\r Atj   \rkAu J! A H\r A !@  O\r   kAuA	l!A\n!\r ( "A\nI\r @ Aj!  \rA\nl"\rO\r @ A   Aæ Fk A G Aç Fqk"\r  kAuA	lAwjN\r  A`Aìc A Hj \rAÈ j"A	m"Atj!A\n!\r@  A	lk"AJ\r @ \rA\nl!\r Aj"AG\r  Aj!@@ ( "  \rn" \rlk"\r   F\r@@ Aq\r D      @C! \rAëÜG\r  M\r A|j-  AqE\rD     @C!D      à?D      ð?D      ø?  FD      ø?  \rAv"F  I!@ \r  -  A-G\r  ! !   k"6     a\r    \rj"\r6 @ \rAëÜI\r @ A 6 @ A|j" O\r  A|j"A 6   ( Aj"\r6  \rAÿëÜK\r   kAuA	l!A\n!\r ( "A\nI\r @ Aj!  \rA\nl"\rO\r  Aj"\r   \rK!@@ "\r M"\r \rA|j"( E\r @@ Aç F\r  Aq! AsA A " J A{Jq" j!AA~  j! Aq"\r Aw!@ \r  \rA|j( "E\r A\n!A ! A\np\r @ "Aj!  A\nl"pE\r  As! \r kAuA	l!@ A_qAÆ G\r A !   jAwj"A  A J"  H!A !   j jAwj"A  A J"  H!A! AýÿÿÿAþÿÿÿ  r"J\r  A GjAj!@@ A_q"AÆ G\r   AÿÿÿÿsJ\r A  A J!@   Au"s k­ í "kAJ\r @ Aj"A0:    kAH\r  A~j" :  A! AjA-A+ A H:    k" AÿÿÿÿsJ\rA!  j" \nAÿÿÿÿsJ\r  A    \nj" î     \nè   A0   Asî @@@@ AÆ G\r  AjA	r!    K"!@ 5  í !@@  F\r   AjM\r@ Aj"A0:    AjK\r   G\r  Aj"A0:       kè  Aj" M\r @ E\r   AÑ Aè   \rO\r AH\r@@ 5  í " AjM\r @ Aj"A0:    AjK\r     A	 A	Hè  Awj! Aj" \rO\r A	J! ! \r @ A H\r  \r Aj \r K! AjA	r! !\r@@ \r5  í " G\r  Aj"A0:  @@ \r F\r   AjM\r@ Aj"A0:    AjK\r    Aè  Aj!  rE\r   AÑ Aè      k"   Jè   k! \rAj"\r O\r AJ\r   A0 AjAA î      kè  !  A0 A	jA	A î   A    AÀ sî     J!  AtAuA	qj!@ AK\r  -  !D      ð?A4 Atkå !@ A-G\r    ¡ !    ¡!@ (¬"\r \rAu"s k­ í " G\r  Aj"A0:   (¬!\r \nAr! A q! A~j" Aj:   AjA-A+ \rA H:   AH AqEq! Aj!\r@ \r" ü"\rAð¨ j-   r:    \r·¡D      0@¢!@ Aj"\r AjkAG\r  D        a q\r  A.:  Aj!\r D        b\r A! Aûÿÿÿ \n  k"jkJ\r   A    j Aj \r Ajk" A~j H  "j"\r î     è   A0  \r Asî    Aj è   A0  kA A î     è   A   \r AÀ sî   \r  \rJ! A°j$  .  ( AjAxq"Aj6    )  ) 9    ½     A A æ # A k"$     Aj " 6   A Gk6 A Aü  A6L A 6$ A6P  Aj6,  Aj6T  A :     ï ! A j$  ¶  (T"( !@ ("  (  ("k"  I"E\r    ´   (  j"6   ( k"6@    I"E\r    ´   (  j"6   ( k6 A :      (,"6   6  @  \r A    6 A¬A!@@  E\r  Aÿ M\r@@A (´« ( \r  AqA¿F\r A6 @ AÿK\r    A?qAr:    AvAÀr:  A@@ A°I\r  A@qAÀG\r   A?qAr:    AvAàr:     AvA?qAr: A@ A|jAÿÿ?K\r    A?qAr:    AvAðr:     AvA?qAr:    AvA?qAr: A A6 A!    :  A @  \r A    A ÷ ÿ&# Ak"$ @@@@@  AôK\r @A (® "A  AjAøq  AI"Av"v" AqE\r @@  AsAq j"At"AÀ® j" (È® "(" G\r A  A~ wq6®   A (¨® I\r  ( G\r   6   6 Aj!   Ar6  j" (Ar6 A ( ® "M\r@  E\r @@   tA t" A   krqh"At"AÀ® j" (È® " ("G\r A  A~ wq"6®  A (¨® I\r (  G\r  6  6   Ar6   j"  k"Ar6   j 6 @ E\r  AxqAÀ® j!A (¬® !@@ A Avt"q\r A   r6®  ! ("A (¨® I\r  6  6  6  6  Aj! A  6¬® A  6 ® A (® "	E\r 	hAt(È° "(Axq k! !@@@ (" \r  (" E\r  (Axq k"   I"!    !  !  A (¨® "\nI\r (!@@ ("  F\r  (" \nI\r ( G\r  ( G\r   6   6@@@ ("E\r  Aj! ("E\r Aj!@ ! " Aj!  ("\r   Aj!  ("\r   \nI\r A 6 A ! @ E\r @@  ("At"(È° G\r  AÈ° j  6   \rA  	A~ wq6®   \nI\r@@ ( G\r    6   6  E\r   \nI\r   6@ ("E\r   \nI\r   6   6 ("E\r   \nI\r   6   6@@ AK\r    j" Ar6   j"   (Ar6  Ar6  j" Ar6  j 6 @ E\r  AxqAÀ® j!A (¬® ! @@A Avt" q\r A   r6®  ! (" \nI\r   6   6   6   6A  6¬® A  6 ®  Aj! A!  A¿K\r   Aj"Axq!A (® "E\r A!@  AôÿÿK\r  A& Avg" kvAq  AtkA>j!A  k!@@@@ At(È° "\r A ! A !A !  A A Avk AFt!A !@@ (Axq k" O\r  ! ! \r A ! ! !    ("   AvAqj("F   !  At! ! \r @   r\r A !A t" A   kr q" E\r  hAt(È° !   E\r@  (Axq k" I!@  ("\r   (!   !    ! !  \r  E\r  A ( ®  kO\r  A (¨® "I\r (!@@ ("  F\r  (" I\r ( G\r  ( G\r   6   6@@@ ("E\r  Aj! ("E\r Aj!@ ! " Aj!  ("\r   Aj!  ("\r   I\r A 6 A ! @ E\r @@  ("At"(È° G\r  AÈ° j  6   \rA  A~ wq"6®   I\r@@ ( G\r    6   6  E\r   I\r   6@ ("E\r   I\r   6   6 ("E\r   I\r   6   6@@ AK\r    j" Ar6   j"   (Ar6  Ar6  j" Ar6  j 6 @ AÿK\r  AøqAÀ® j! @@A (® "A Avt"q\r A   r6®   !  (" I\r   6  6   6  6A! @ AÿÿÿK\r  A& Avg" kvAq  AtrA>s!    6 B 7  AtAÈ° j!@@@ A  t"q\r A   r6®   6   6 A A  Avk  AFt!  ( !@ "(Axq F\r  Av!  At!   Aqj"("\r  Aj"  I\r   6   6  6  6  I\r ("  I\r   6  6 A 6  6   6 Aj! @A ( ® "  I\r A (¬® !@@   k"AI\r   j" Ar6   j 6   Ar6   Ar6   j"   (Ar6A !A !A  6 ® A  6¬®  Aj! @A (¤® " M\r A   k"6¤® A A (°® "  j"6°®   Ar6   Ar6  Aj! @@A (ð± E\r A (ø± !A B7ü± A B 7ô± A  AjApqAØªÕªs6ð± A A 6² A A 6Ô± A !A !   A/j"j"A  k"q" M\rA ! @A (Ð± "E\r A (È± " j" M\r  K\r@@@A - Ô± Aq\r @@@@@A (°® "E\r AØ± ! @@   ( "I\r     (jI\r  (" \r A  "AF\r !@A (ô± " Aj" qE\r   k  jA   kqj!  M\r@A (Ð± " E\r A (È± " j" M\r   K\r  "  G\r  k q" "  (   (jF\r ! @  AF\r   A0jO\r   kA (ø± "jA  kq" AF\r  j!  !  !  AG\r AG\rA A (Ô± Ar6Ô±   !A  !  AF\r  AF\r   O\r   k" A(jM\rA A (È±  j" 6È± @  A (Ì± M\r A   6Ì± @@@@A (°® "E\r AØ± ! @   ( "  ("jF\r  (" \r @@A (¨® " E\r    O\rA  6¨® A ! A  6Ü± A  6Ø± A A6¸® A A (ð± 6¼® A A 6ä± @  At" AÀ® j"6È®   6Ì®   Aj" A G\r A  AXj" Ax kAq"k"6¤® A   j"6°®   Ar6   jA(6A A (² 6´®   O\r   I\r   (Aq\r     j6A  Ax kAq" j"6°® A A (¤®  j"  k" 6¤®    Ar6  jA(6A A (² 6´® @ A (¨® O\r A  6¨®   j!AØ± ! @@@  ( " F\r  (" \r   - AqE\rAØ± ! @@@   ( "I\r     (j"I\r  (!  A  AXj" Ax kAq"k"6¤® A   j"6°®   Ar6   jA(6A A (² 6´®   A\' kAqjAQj"    AjI"A6 A )à± 7 A )Ø± 7A  Aj6à± A  6Ü± A  6Ø± A A 6ä±  Aj! @  A6  Aj!  Aj!   I\r   F\r   (A~q6   k"Ar6  6 @@ AÿK\r  AøqAÀ® j! @@A (® "A Avt"q\r A   r6®   !  ("A (¨® I\r   6  6A!A!A! @ AÿÿÿK\r  A& Avg" kvAq  AtrA>s!    6 B 7  AtAÈ° j!@@@A (® "A  t"q\r A   r6®   6   6 A A  Avk  AFt!  ( !@ "(Axq F\r  Av!  At!   Aqj"("\r  Aj" A (¨® I\r   6   6A!A! ! !  A (¨® "I\r ("  I\r   6  6   6A ! A!A!  j 6   j  6 A (¤® "  M\r A    k"6¤® A A (°® "  j"6°®   Ar6   Ar6  Aj!  A06 A ! Ì     6     ( j6   ú !  Aj$   \n  Ax  kAqj" Ar6 Ax kAqj"  j"k! @@@ A (°® G\r A  6°® A A (¤®   j"6¤®   Ar6@ A (¬® G\r A  6¬® A A ( ®   j"6 ®   Ar6  j 6 @ ("AqAG\r  (!@@ AÿK\r @ (" AøqAÀ® j"F\r  A (¨® I\r ( G\r@  G\r A A (® A~ Avwq6® @  F\r  A (¨® I\r ( G\r  6  6 (!@@  F\r  ("A (¨® I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ !	 "Aj! ("\r  Aj! ("\r  	A (¨® I\r 	A 6 A ! E\r @@  ("At"(È° G\r  AÈ° j 6  \rA A (® A~ wq6®  A (¨® I\r@@ ( G\r   6  6 E\r A (¨® "I\r  6@ ("E\r   I\r  6  6 ("E\r   I\r  6  6 Axq"  j!   j"(!  A~q6   Ar6   j  6 @  AÿK\r   AøqAÀ® j!@@A (® "A  Avt" q\r A    r6®  !  (" A (¨® I\r  6   6  6   6A!@  AÿÿÿK\r   A&  Avg"kvAq AtrA>s!  6 B 7 AtAÈ° j!@@@A (® "A t"q\r A   r6®   6   6  A A Avk AFt! ( !@ "(Axq  F\r Av! At!  Aqj"("\r  Aj"A (¨® I\r  6   6  6  6 A (¨® " I\r ("  I\r  6  6 A 6  6  6 AjÌ  Ä\n@@  E\r   Axj"A (¨® "I\r  A|j( "AqAF\r  Axq" j!@ Aq\r  AqE\r  ( "k" I\r   j! @ A (¬® F\r  (!@ AÿK\r @ (" AøqAÀ® j"F\r   I\r ( G\r@  G\r A A (® A~ Avwq6® @  F\r   I\r ( G\r  6  6 (!@@  F\r  (" I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! E\r@@  ("At"(È° G\r  AÈ° j 6  \rA A (® A~ wq6®   I\r@@ ( G\r   6  6 E\r  I\r  6@ ("E\r   I\r  6  6 ("E\r  I\r  6  6 ("AqAG\r A   6 ®   A~q6   Ar6   6   O\r ("AqE\r@@ Aq\r @ A (°® G\r A  6°® A A (¤®   j" 6¤®    Ar6 A (¬® G\rA A 6 ® A A 6¬® @ A (¬® "	G\r A  6¬® A A ( ®   j" 6 ®    Ar6   j  6  (!@@ AÿK\r @ (" AøqAÀ® j"F\r   I\r ( G\r@  G\r A A (® A~ Avwq6® @  F\r   I\r ( G\r  6  6 (!\n@@  F\r  (" I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! \nE\r @@  ("At"(È° G\r  AÈ° j 6  \rA A (® A~ wq6®  \n I\r@@ \n( G\r  \n 6 \n 6 E\r  I\r  \n6@ ("E\r   I\r  6  6 ("E\r   I\r  6  6  Axq  j" Ar6   j  6   	G\rA   6 ®   A~q6   Ar6   j  6 @  AÿK\r   AøqAÀ® j!@@A (® "A  Avt" q\r A    r6®  !  ("  I\r  6   6  6   6A!@  AÿÿÿK\r   A&  Avg"kvAq AtrA>s!  6 B 7 AtAÈ° j!@@@@A (® "A t"q\r A   r6®   6 A! A!  A A Avk AFt! ( !@ "(Axq  F\r Av! At!  Aqj"("\r  Aj"  I\r   6 A! A! ! ! !  I\r (" I\r  6  6A !A! A!  j 6   6   j 6 A A (¸® Aj"A 6¸® Ì  k~@@  \r A !  ­ ­~"§!   rAI\r A  B §A G!@ ù " E\r   A|j-  AqE\r   A  ª   @  \r  ù @ A@I\r  A06 A @  AxjA AjAxq AIþ "E\r  Aj@ ù "\r A    A|Ax  A|j( "Aq Axqj"   I´   û  		@@  A (¨® "I\r   ("Aq"AF\r  Axq"E\r    j"("AqE\r @ \r A ! AI\r@  AjI\r   !  kA (ø± AtM\rA !@  I\r @  k"AI\r     AqrAr6   j" Ar6  (Ar6     A !@ A (°® G\r A (¤®  j" M\r    AqrAr6   j"  k"Ar6A  6¤® A  6°®   @ A (¬® G\r A !A ( ®  j" I\r@@  k"AI\r     AqrAr6   j" Ar6   j" 6   (A~q6   Aq rAr6   j" (Ar6A !A !A  6¬® A  6 ®   A ! Aq\r Axq j" I\r (!@@ AÿK\r @ (" AøqAÀ® j"	F\r   I\r ( G\r@  G\r A A (® A~ Avwq6® @  	F\r   I\r ( G\r  6  6 (!\n@@  F\r  (" I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ !	 "Aj! ("\r  Aj! ("\r  	 I\r 	A 6 A ! \nE\r @@  ("At"(È° G\r  AÈ° j 6  \rA A (® A~ wq6®  \n I\r@@ \n( G\r  \n 6 \n 6 E\r  I\r  \n6@ ("E\r   I\r  6  6 ("E\r   I\r  6  6@  k"AK\r    Aq rAr6   j" (Ar6      AqrAr6   j" Ar6   j" (Ar6     Ì    @  AK\r  ù     ±A!@@  A  AK" Ajq\r  ! @ " At!   I\r @ A@  kI\r  A06 A @A AjAxq AI"  jAjù "\r A  Axj!@@  Aj q\r  !  A|j"( "Axq   jAjA   kqAxj"A     kAKj"  k"k!@ Aq\r  ( !   6    j6      (AqrAr6   j" (Ar6   ( AqrAr6   j" (Ar6   @  ("AqE\r  Axq" AjM\r     AqrAr6   j"  k"Ar6   j" (Ar6     Ajø	   j!@@@@  ("AqE\r A (¨® ! AqE\r    ( "k" A (¨® "I\r  j!@  A (¬® F\r   (!@ AÿK\r @  (" AøqAÀ® j"F\r   I\r (  G\r@  G\r A A (® A~ Avwq6® @  F\r   I\r (  G\r  6  6  (!@@   F\r   (" I\r (  G\r (  G\r  6  6@@@  ("E\r   Aj!  ("E\r  Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! E\r@@    ("At"(È° G\r  AÈ° j 6  \rA A (® A~ wq6®   I\r@@ (  G\r   6  6 E\r  I\r  6@  ("E\r   I\r  6  6  ("E\r  I\r  6  6 ("AqAG\r A  6 ®   A~q6   Ar6  6   I\r@@ ("Aq\r @ A (°® G\r A   6°® A A (¤®  j"6¤®    Ar6  A (¬® G\rA A 6 ® A A 6¬® @ A (¬® "	G\r A   6¬® A A ( ®  j"6 ®    Ar6   j 6  (!@@ AÿK\r @ (" AøqAÀ® j"F\r   I\r ( G\r@  G\r A A (® A~ Avwq6® @  F\r   I\r ( G\r  6  6 (!\n@@  F\r  (" I\r ( G\r ( G\r  6  6@@@ ("E\r  Aj! ("E\r Aj!@ ! "Aj! ("\r  Aj! ("\r   I\r A 6 A ! \nE\r @@  ("At"(È° G\r  AÈ° j 6  \rA A (® A~ wq6®  \n I\r@@ \n( G\r  \n 6 \n 6 E\r  I\r  \n6@ ("E\r   I\r  6  6 ("E\r   I\r  6  6   Axq j"Ar6   j 6    	G\rA  6 ®   A~q6   Ar6   j 6 @ AÿK\r  AøqAÀ® j!@@A (® "A Avt"q\r A   r6®  ! (" I\r   6   6   6   6A!@ AÿÿÿK\r  A& Avg"kvAq AtrA>s!   6  B 7 AtAÈ° j!@@@A (® "A t"q\r A   r6®    6    6 A A Avk AFt! ( !@ "(Axq F\r Av! At!  Aqj"("\r  Aj" I\r   6    6    6    6  I\r (" I\r   6   6  A 6   6   6Ì   ? Atd~@@  ­B|BøÿÿÿA (¸« " ­|"BÿÿÿÿV\r   §"O\r  \r A06 AA  6¸«   & @A (² \r A  6² A   6²     6   6 A !@  (  G\r   (!     A AK  \n   $  # u~    ~  ~| B " B "~| Bÿÿÿÿ" Bÿÿÿÿ"~"B   ~|"B | Bÿÿÿÿ  ~|"B |7   B  Bÿÿÿÿ7   A $ A AjApq$  # # k #  # S~@@ AÀ qE\r   A@j­!B ! E\r  AÀ  k­  ­"!  !   7    7S~@@ AÀ qE\r   A@j­!B ! E\r  AÀ  k­  ­"!  !   7    7©~# A k"$  Bÿÿÿÿÿÿ?!@@ B0Bÿÿ"§"AÿjAýK\r   B< B! Aj­!@@  Bÿÿÿÿÿÿÿÿ" BT\r  B|!  BR\r  B |!B   BÿÿÿÿÿÿÿV"!  ­ |!@   P\r  BÿÿR\r   B< BB! Bÿ!@ AþM\r B ! Bÿ!@Aø Aø  P"" k"Að L\r B !B !   BÀ  !A !@  F\r  Aj   A k  ) )B R!       ) "B< )B! @@ Bÿÿÿÿÿÿÿÿ ­"BT\r   B|!  BR\r   B  |!   B    BÿÿÿÿÿÿÿV"!  ­! A j$  B4 B  ¿\n   $ #   kApq"$   # Î« A©carry shim_revfx shim_delfx shim_modfx osc_bl_saw_idx osc_bl_sqr_idx osc_bl_par_idx 0x%08x -+   0X0x -0X+0X 0X-0x+0x 0x --out a relocation names a symbol that does not exist a symbol or relocation names a blob that does not exist a reference names a symbol the NTS-1 mkII does not export cannot descent a constant not a unit a v2 ELF unit unit_init there is no unit header to emit the symbol name table does not fit unit_reset ambiguous the layout does not fit in 32 bits too many relocations   <- the mkII does not export this wt_saw_notes wt_sqr_notes wt_par_notes names more parameters than the destination holds too many blobs Unknown error a reference points into the v1 API at an address this tree has no name for, so there is nothing to ask the destination for the scan could not walk the unit\'s code, so no instruction in it was accounted for other unit_render unit_header no room for the destination header --help ShftShp unit_set_tempo who unknown unit_teardown manifest.json a function unsupported conversion k_fx_api_version k_osc_api_version unit_note_on payload.bin nan --plan scan k_fx_api_platform k_osc_api_platform fx_get_bpm sdram ok a wave bank unit_tempo_4ppqn_tick --check api SftDepth fx_mcu_hash osc_mcu_hash unit_aftertouch inf fx_get_bpmf elf unit_note_off unit_all_note_off midi_to_hz_lut_f wt_saw_lut_f cubicsat_lut_f bitres_lut_f wt_sqr_lut_f wt_par_lut_f schetzen_lut_f tanpi_lut_f sqrtm2log_lut_f wt_sine_lut_f pow2_lut_f unit_get_param_str_value unit_set_param_value unit_get_param_value wrote a reference could not be proved to be data, and a word this cannot prove is a word this will not rewrite fx_white osc_white more absolute references than the scan can hold, so the list below is incomplete unit_channel_pressure Shape unit_resume Time a reference points at an absolute address outside every region a v1 unit may name the destination has no such module a lookup table not in the v1 table too many symbols, or a name that is not usable --coverage more than one gap of address space that the file does not store, or a gap on a blob that is not the unit\'s own image the unit uses its module\'s .sdram, which is an address above 0xC0000000 that the NTS-1 mkII has no way to place unit_suspend unit_pitch_bend fx_rand osc_rand --dev-id --unit-id Reserved a relocation target is not 4-byte aligned shim_osc wb rb a target or a symbol extent is outside its blob rwa UREV NAN UDEL wavesF INF wavesE wavesD UMOD wavesC UOSC wavesB wavesA ? a relocation is neither RELATIVE nor ABS32 . (null) (no name)   <- the unit brings this one (src/runtime/sdk_luts.c) "params" 0x%08x "%s" "name"   covered 0x%zx 0x%zx\n base 0x%08x\n payload %zu\n logue v1: bad central directory entry %u\n cut %u\n logue v1: unsupported zip method %u\n   %-6s %s, %d parameter%s in its manifest\n   %-6s %zu word%s are the unit\'s own image (the first at 0x%zx); these move with it\n   %-6s %zu word%s: %zu api, %zu image, %zu sdram, %zu other, %zu float, %zu code, %zu ambiguous\n   %-6s a v1 %s unit (%s); the payload is %zu bytes\n logue v1: inflate failed (%d) on %s -- %lu of %lu bytes\n     %-20s %-15s %zu reference%s, the first at 0x%zx%s\n   %-6s target 0x%04x, %u symbol%s, %zu relocation%s\n \n  %-6s %s\n logue v1: bad local header for %s\n plconv: unknown option %s\n logue v1: short read on %s\n logue v1: no %s in %s\n   %-6s dev_id %s, unit_id %s\n plconv: %s: the container would not lay out: %s\n logue v1: cannot open %s: %s\n plconv: %s: %s\n plconv: %s: the container would not write: %s\n plconv: %s: the mkII header would not encode: %s\n   %-6s %s, and --check means nothing was written\n   %-6s linked to run at 0x%08x + %u, which the mkII does not have\n   %-6s every reference is either the unit\'s own image or a name the\n         conversion can place -- the mkII\'s loader for the ones it\n         exports, the unit\'s own tables where the report says so --\n         so the conversion is the 43-symbol table and nothing else\n plconv: one unit at a time\n logue v1: %s runs past end of file\n   %-6s %zu bytes of code proved to be instruction; %zu image word%s inferred\n   %-6s %s: %zu bytes of file for %zu of image: %zu payload, %u shim, %zu carried, %zu of window not stored\n plconv: %s: the zip or its payload would not read\n     0x%04x  %-8s 0x%08x  %s%s%+d\n   %-6s %zu name%s the destination has to supply:\n   %-6s every word the conversion would touch:\n plconv: %s: %s has no .dynsym entry.\n plconv: %s: the descent could not be started, so nothing was\n  proved to be an instruction. That is this machine running out of\n  memory, not a fact about the unit.\n plconv: %s: the payload\'s module magic is not one of UOSC, UMOD,\n  UDEL or UREV, so nothing here can say what its hook table is.\n usage: plconv <unit> [--plan] [--coverage] [--check]\n              [--dev-id <id>] [--unit-id <id>] [-o <out>]\n\nCarry a v1 logue unit onto the NTS-1 mkII by relocation: find the\nabsolute addresses the unit was linked with, and point them at the\ndestination\'s own symbols. This is not hosting -- the mkII already\nanswers to 33 of the 43 entries (every lookup table and every\nfunction), so nothing has to travel with the unit except the unit.\n\n  <unit>      a .prlgunit, .ntkdigunit or .mnlgxdunit\n  --plan      list every word the conversion would move, not just\n              the totals\n  --coverage  print the byte spans the descent proved to be code, for\n              plcov to diff against the unit\'s own ELF. The\n              measurement that says whether the walk understood a\n              payload; see tools/plconv/README.md\n  --check     analyse and write nothing. That is what a run without\n              -o already does; with -o it is how a caller asks the\n              question without the file\n  --dev-id    the developer the converted unit declares, as four\n              characters ("rgrv") or as a number (0x72677276).\n              Defaults to this tool\'s own; a header with no developer\n              in it is one the SDK reserves, and a device refuses\n  --unit-id   the unit\'s id within that developer, same two shapes.\n              Defaults to 0, which is what several shipped units\n              under this id declare\n  -o <out>    write the converted .nts1mkiiunit. Refused, with the\n              reason, when the unit cannot be carried -- a unit that\n              loads and plays silence is worse than one that does not\n              load\n\nExit 0 when the unit can be carried, 1 when it cannot and the reason\nis printed, 2 on a usage error.\n plconv: %s is not a v1 unit (%s).\n  A v1 unit is a zip of manifest.json and payload.bin -- a\n  .prlgunit, .ntkdigunit or .mnlgxdunit. A v2 ELF is what ntconv\n  and kpconv retarget between the NTS families; a drumlogue unit\n  is a different header and a different ISA again.\n plconv: %s: the payload is %zu bytes and the %s image window is %u.\n  A unit larger than the window it was linked for is not one this can\n  lay out. Nothing is written.\n plconv: %s: no shim is built for a v1 %s unit, and a v1 unit cannot\n  be called the way the mkII calls one without it. Nothing is written.\n plconv: %s: the shim for a v1 %s unit has no %s, and the loader\n  requires it. Nothing is written.\n plconv: %s: more than %u relocations. Nothing is written.\n plconv: %s: more than %u symbols. Nothing is written.\n plconv: %s: the payload has more than %u candidate words, and a\n  scan that stopped counting would understate what the unit needs\n  without saying so. Nothing is written.\n plconv: %s: the tables this unit carries (%s and the\n  rest) come to more than the %zu bytes set aside for\n  them. Nothing is written.\n plconv: %s: at 0x%x the unit names %s with an addend of %+d.\n  An mkII pointer is the symbol and nothing else: the loader sets\n  the word to the resolved address and adds no addend, so a\n  reference like this one would come out pointing at the wrong\n  place. Nothing is written.\n plconv: %s: the shim\'s reloc list names a word at %u, which is not a\n  word inside a %u-byte blob. Nothing is written.\n plconv: %s: the shim has no %s shape -- its entry points are all zero.\n  A blob without them would load as a unit nothing can start.\n  Nothing is written.\n plconv: %s: the shim has a reference this tool cannot place (%u).\n  Nothing is written.\n plconv: %s: the descent proved no instruction at all. That is\n  not a fact about a v1 unit -- every one of them has code -- so\n  nothing derived from this walk is worth reading.\n logue v1: %s is not a zip (no end-of-central-directory)\n plconv: %s wants four characters ("rgrv") or a number (0x72677276)\n           ð \r    ð Z     ñ      `ó      d÷ x     hû      lÿ B     p\\     *     O     °     ¸&     Ô+     Ü+     à-i     ä/3     è1	    lT	    ìt	    \\~	    Ä«w	    <Êl	    ¼êÄ    Èê\'     °ë6     ìE     íÌ    ¸íh     °ü    °H     ±     µx     ¹     ½B     ¿     Ái     Ã3     Å¢      É¸    ,ÉÄ    dÉ_    Êm    Êå    Ù      ë     ÿ  F! ²     ÿ  F! ë     ÿ  F! ²     ÿ  F! è     ÿ  F! ¯     ÿ  F! ¢  =    °A    ÀE                .hash .dynsym .dynstr .rel.dyn .text .shim .rodata .unit_header .dynamic .bss .shstrtab       0 0     &   &   @À  BÀ  BÀ   à þß pþß pþß« 1 x S      x      	 !      m   ~ h  Ø } ~  ®  ñ *	 ¦	 ] Â µ           	 \n  \r       # + 3 ; C S c s  £ Ã ã                                                         	 \r   ! 1 A a  Á  0@`                            	 	 \n \n     \r \r            	  \n      \r               µKJhBÐOðÿ0½	Ji`i *öÐzYh @ð G  ðç ¿    UOSC    -éøCKFF-íÓø¸ñ "Ñ½ì½èø/IÙø  ·õ(¿Oôw:FÀGJë<DëBÑ¬BêÓåçòìzøîçzgîzãìzñç $ßøííç ¿    0      0    K\n(j¿KëY`±GpG ¿        IFJhi±±GpG ¿        KÛi±JhGpG ¿        K-éóGÓø FFFºñ ÐO $ (¿=Fõ g´BÓ°½èð¦ë	ëÄëÄ ;F¸õJ(¿OôxÍø DDÐGèç ¿    0   µ	K	JhB	Ñi:±zYh @ð G  ½Oðÿ0ûç ¿    UMODK\n(j¿KëY`"±ó\nKYCGpG ¿          Ki±GpG ¿    KÛi±GpG ¿    µ	K	JhB	Ñi:±zYh @ð G  ½Oðÿ0ûç ¿    UDEL-éøCKFFFÓø¹ñ Ñ½èø5ã ëÄ µõ(¿OôuO±;DF ëÅSøËBøËBùÑ,D)FÈG¦BæØãç $úç ¿    K\n(j¿KëY`"±ó\nKYCGpG ¿          Ki±GpG ¿    KÛi±GpG ¿    µ	K	JhB	Ñi:±zYh @ð G  ½Oðÿ0ûç ¿    UREV-éøCKFFFÓø¹ñ Ñ½èø5ã ëÄ µõ(¿OôuO±;DF ëÅSøËBøËBùÑ,D)FÈG¦BæØãç $úç ¿    K\n(j¿KëY`"±ó\nKYCGpG ¿          Ki±GpG ¿    KÛi±GpG ¿    pGpGpGpGKÛi±JhGpG ¿        \n(¿KëXh  pG      pGpGpGpGpGpGpGpGpGpGpG\n(¿KëXh  pG      pGpGpGpGpGpGpGpGpGpGpG\n(¿KëXh  pG      pGpGpGpGpGpGpGpGpGpGpG\n(¿KëXh  pG      pGpGpGpGpGpG ¿                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       	 	    =   ¹       Ù   ù         ±  Å  É  Ë  Í  Ï  Ñ  !    m      É  Ù  ×  Ù  Õ  Ó  Û  Ý  ñ  õ  ÷  ù  û  ý      é    q    ­        ÿ    	    !  #  %  \'  )      ½  í  E  q    /  1  -  +  3  5  I  M  O  Q  S  U  0          8       X  ¨          ¬         ´       X  Ð          Ô       X  ð       X  ô                         X  d         h                 ¼         À      X  Ô         ä                  l                        X  ¨         ¸         ä         @         d         h      X  |                  ¨         ¬      X  À      X  ì      X        X  D      X  $                 ?N?Î?+?}>?¬S?\'k?ä?õ ?Y¿?à?6?®(?P?åz?¤§?ØÖ??À<?us?Á¬?è?\'?\nh?°«?þñ?ó:?¡?Õ ?$&¢?z£?³Ð¤?,*¦?§?£å¨?ªGª?¬«?n­?=®?í¯?Ä]±?Ñ²?bH´?LÂµ?B?·?f¿¸?¦Bº?É»?±R½?ß¾?¤oÀ?Â?ªÃ?±3Å?ÑÆ?ÅqÈ?ôÊ?½Ë?hÍ?/Ï?CÉÐ?é~Ò?"8Ô?õôÕ?tµ×?yÙ?tAÛ?\rÝ?fÜÞ?¯à?â?[aä?@æ?´"è?F	ê?Øóë?qâí?Õï?ÍËñ? Æó?Åõ?ÉÈ÷?1Ðù?ÓÛû?Àëý?   @N@Î@+@y>@¬S@\'k@è@ù @]¿	@à\n@2@®(\r@P@áz@¤§@ØÖ@@À<@ys@½¬@è@þ&@h@°«@þñ@÷:@¥@Õ @$&"@z#@³Ð$@,*&@{\'@£å(@ªG*@¬+@r-@=.@í/@È]1@Ñ2@bH4@HÂ5@F?7@b¿8@¢B:@É;@±R=@ß>@ o@@ B@¯C@­3E@ÑF@ÉqH@ðJ@½K@hM@+O@CÉP@é~R@"8T@ùôU@tµW@yY@tA[@\r]@fÜ^@¯`@b@Vad@@f@´"h@J	j@Üók@qâm@Õo@ÍËq@¤Æs@ Åu@ÉÈw@-Ðy@ÓÛ{@Àë}@  @N@Î@+@y>@¬S@%k@æ@ù @[¿@à@2@®(@P@áz@¢§@ÚÖ@@À<@ys@¿¬@è@þ&@h@®«@üñ@÷:@£@Õ @&&¢@	z£@³Ð¤@.*¦@{§@£å¨@ªGª@¬«@r­@?®@í¯@Æ]±@Ñ²@bH´@HÂµ@F?·@b¿¸@¤Bº@É»@±R½@ß¾@¢oÀ@ Â@¬Ã@­3Å@	ÑÆ@ÉqÈ@òÊ@½Ë@hÍ@-Ï@CÉÐ@ç~Ò@"8Ô@÷ôÕ@tµ×@yÙ@vAÛ@\r\rÝ@hÜÞ@¯à@â@Xaä@@æ@±"è@H	ê@Úóë@qâí@Õï@ÍËñ@¢Æó@Åõ@ÉÈ÷@-Ðù@ÑÛû@Àëý@   A   A            ñ48Á@=±ÀiÀS#À_ðÀØ{ÀñoÀwfÀn]ÀC VÀ|BOÀN)IÀCÀâx>Àíº9À¾P5À/1ÀfN-À\r¦)ÀU0&Àè"ÀÉÈÀ¯ÎÀwöÀ>=À À÷À¯³Àå_\rÀ!ÀõÀnÜÀNÔÀ/ÜÀó Àn0þ¿dú¿¥÷¿Ò©ó¿½Vð¿&í¿ðé¿Úæ¿×ã¿:æà¿ÞÞ¿¹5Û¿uØ¿/ÃÕ¿Ó¿ Ð¿Á Î¿Ë¿^É¿Þ¯Æ¿£VÄ¿:Â¿LÄ¿¿n½¿KZ»¿3¹¿ù·¿*µ¿àô²¿áð°¿Øô®¿ ­¿×«¿b.©¿	P§¿x¥¿Ê§£¿Ý¡¿ ¿¸[¿ß£¿åñ¿E¿¿¿Pý¿(a¿Ê¿\r8¿Þª¿p"¿ª¿q¿¤¿#.¿ä»¿ÆM¿°ã¿}¿X¿Èy¿HÄ|¿z¿çnw¿ÄÎt¿r5r¿Ï¢o¿¹m¿j¿²h¿|e¿_%c¿(¸`¿×P^¿9ï[¿-Y¿´<W¿ëT¿àR¿SYP¿ôN¿ÛK¿\'¤I¿¨qG¿áCE¿ãC¿{ö@¿Ö>¿=»<¿3¤:¿8¿,6¿ûx4¿ër2¿ëp0¿ër.¿Ùx,¿¶*¿O(¿¶¡&¿Ø¶$¿Ï"¿îë ¿Ð¿+/¿ V¿=¿Ñ­¿­Þ¿¾¿J¿¿Â¿Í\r¿xF¿&	¿ÇÖ¿[#¿Ár¿	Å¿¿Öãþ¾éû¾]Sø¾0õ¾AØñ¾¢î¾Úqë¾AFè¾Åå¾"þá¾XáÞ¾GÉÛ¾¶Ø¾§Õ¾ÇÒ¾tÏ¾·Ì¾oÉ¾£Æ¾>°Ã¾ÁÀ¾9Ö½¾ïº¾=\r¸¾Ø.µ¾ÅT²¾~¯¾m¬¬¾\'Þ©¾ð§¾M¤¾ì¡¾Ì¾¾ÅY¾¦¾ö¾¥I¾º ¾Yû¾Y¾»¾ ¾n¾-è}¾\rÆx¾½ªs¾¸n¾@i¾d¾1}_¾Z¾	U¾ÃP¾³K¾NÐF¾ÜòA¾q=¾ËI8¾,~3¾¸.¾s÷)¾<%¾ ¾²×¾^-¾¾:é\r¾äN	¾º¾x* ¾¸?÷½ü4î½½4å½î=Ü½QÓ½?oÊ½SÁ½\\Ç¸½\\°½EF§½%½të½­K½Wµ½ßPx½äHg½½RV½voE½õ4½HÜ#½o-½\\½:ä¼0\rÃ¼Î7¢¼ù¼eãA¼ó¼×¾»                    øUP@«D@Nò<@Î7@ÎT2@M.@ÑË*@y®\'@ß$@µO"@®ó@Ã@c·@Ë@Yû@C@Q¡@Z@¸@»&@óÆ@%t\r@<-@Añ\n@Y¿	@Ì@îv@)_@ìN@¿E@1C@áF@jP@|_ @çþ?	ý?çUû?¦ù?Úç÷?=ö?úô?7þò?fiñ?DÛï?Sî?ÙÑì?Vë?ãßé?oè?}ç?Øå?;ä?ÆÝâ?ýá?w0à?àÞ?«Ý?KÜ?>Û?üÄÙ?3Ø?ÂL×?Ö?áÔ?°Ó?{Ò?OWÑ?ä.Ð?)	Ï?æÍ?mÅÌ?L§Ë?Ê?rÉ?îZÈ?ñEÇ?\r3Æ?B"Å?wÄ?Ã?­ûÁ?òÀ?Bë¿?´å¾?Úá½?­ß¼?ß»?àº?â¹?æ¸?ì·?ñò¶?/ûµ?Åµ?ª´?Î³?0)²?Ê7±?G°?uX¯?j®?}­?Á¬?ð¦«?½ª?AÔ©?[ì¨?W¨??§?:¦?¤U¥?r¤?P£?X­¢?Ì¡?ë ?Ì ?®,?8N?rp?B?ª¶?²Ú??ÿ?d$?J?.p?Õ?ñ½?yå?\r?ã5?³^?ß?p±?UÛ??0?êZ?ý?[±?ôÜ?È?Î4?a?i?õ¹?¬æ?{?d@?em?x?Ç?Çô?û!?M~?¶ø|?üR{?2­y?5x?av?Çºt?4s?]mq?2Æo?£n?Àvl?WÎj?%i?5|g?JÒe?È\'d?|b?»Ð`?1$_?Þv]?°È[?¨Z?¶iX?Ø¸V?ÝU?çSS?ÓQ?êO?4N?B|L?"ÃJ?¢I?¡LG?E?ÐC?=B?¾L@?j>?@Â<?ú:?õ/9?¢c7?%5?]Ä3?(ñ1?v0?5C.?4h,?r*?½©(?ôÅ&?ß$?¿ô"?!?Æ?À ?»\'?·*?N)?#?ü?	?õ?\'Û?»\n??3j?ç7?þ?á{ÿ>>ëú>Jö>¢ñ>³Òì>úç>ªã>¯Þ>ÙìØ>·Ó>eÎ>\'öÈ>fÃ>p²½>ä×·>Ò±>«>½4¥>6>µ¨>t>yç>õñ>Hþp>âä^>®EK>Ë¡5>$>#. >±µ=        T  U        N ë§~ uú ¹,ý·z¼ ú¢ =I×  *_·úXÙ+Ê½áÍÜ@x }gaì å\nÔ Ì>Ov¯  D ® ®` úw!ë+ `A ©£nN                                                        *                    \'9H                                  8R`S  Ê»  Ò  é	>Yi~Success Illegal byte sequence Domain error Result not representable Not a tty Permission denied Operation not permitted No such file or directory No such process File exists Value too large for defined data type No space left on device Out of memory Resource busy Interrupted system call Resource temporarily unavailable Invalid seek Cross-device link Read-only file system Directory not empty Connection reset by peer Operation timed out Connection refused Host is down Host is unreachable Address in use Broken pipe I/O error No such device or address Block device required No such device Not a directory Is a directory Text file busy Exec format error Invalid argument Argument list too long Symbolic link loop Filename too long Too many open files in system No file descriptors available Bad file descriptor No child process Bad address File too large Too many links No locks available Resource deadlock would occur State not recoverable Owner died Operation canceled Function not implemented No message of desired type Identifier removed Device not a stream No data available Device timeout Out of streams resources Link has been severed Protocol error Bad message File descriptor in bad state Not a socket Destination address required Message too large Protocol wrong type for socket Protocol not available Protocol not supported Socket type not supported Not supported Protocol family not supported Address family not supported by protocol Address not available Network is down Network unreachable Connection reset by network Connection aborted No buffer space available Socket is connected Socket not connected Cannot send after socket shutdown Operation already in progress Operation in progress Stale file handle Data consistency error Resource not available Remote I/O error Quota exceeded No medium found Wrong medium type Multihop attempted Required key not available Key has expired Key has been revoked Key was rejected by service               	             \n\n\n  	  	                               \r \r   	   	                                               	                                                  	                                                   	                                              	                                                      	                                                   	         0123456789ABCDEF A©¼                                                Ó                            ÿÿÿÿÿÿÿÿ                                                            T                                          	   Ó                           ÿÿÿÿ\n                                                                U pÒ Ù  target_features+bulk-memory+bulk-memory-opt+call-indirect-overlong+\nmultivalue+mutable-globals+nontrapping-fptoint+reference-types+sign-ext');
}

function getBinarySync(file) {
  return file;
}

async function getWasmBinary(binaryFile) {

  // Otherwise, getBinarySync should be able to get it synchronously
  return getBinarySync(binaryFile);
}

async function instantiateArrayBuffer(binaryFile, imports) {
  try {
    var binary = await getWasmBinary(binaryFile);
    var instance = await WebAssembly.instantiate(binary, imports);
    return instance;
  } catch (reason) {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    abort(reason);
  }
}

async function instantiateAsync(binary, binaryFile, imports) {
  return instantiateArrayBuffer(binaryFile, imports);
}

function getWasmImports() {
  // prepare imports
  var imports = {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  };
  return imports;
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
async function createWasm() {
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  function receiveInstance(instance) {
    wasmExports = instance.exports;

    assignWasmExports(wasmExports);

    updateMemoryViews();

    return wasmExports;
  }

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    return receiveInstance(result['instance']);
  }

  var info = getWasmImports();

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  var instantiateWasm = Module['instantiateWasm'];
  if (instantiateWasm) {
    return new Promise((resolve) => {
      try {
        instantiateWasm(info, (inst) => resolve(receiveInstance(inst)));
      } catch(e) {
        err(`Module.instantiateWasm callback failed with error: ${e}`);
        throw e;
      }
    });
  }

  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  var exports = receiveInstantiationResult(result);
  return exports;
}

// end include: preamble.js

// Begin JS library code


  class ExitStatus {
      name = 'ExitStatus';
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }

  /** @type {!Int32Array} */
  var HEAP32;

  /** @type {!Int8Array} */
  var HEAP8;

  /** @type {!Uint32Array} */
  var HEAPU32;

  var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module);
      }
    };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);

  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);


  var noExitRuntime = true;

  function ptrToString(ptr) {
      assert(typeof ptr === 'number', `ptrToString expects a number, got ${typeof ptr}`);
      // Convert to 32-bit unsigned value
      ptr >>>= 0;
      return '0x' + ptr.toString(16).padStart(8, '0');
    }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
        err(text);
      }
    };

  

  var syscallGetVarargI = () => {
      assert(SYSCALLS.varargs != undefined);
      // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
      var ret = HEAP32[((+SYSCALLS.varargs)>>2)];
      SYSCALLS.varargs += 4;
      return ret;
    };
  var syscallGetVarargP = syscallGetVarargI;
  
  
  var PATH = {
  isAbs:(path) => path.charAt(0) === '/',
  splitPath:(filename) => {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
  normalizeArray:(parts, allowAboveRoot) => {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },
  normalize:(path) => {
        var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.slice(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter((p) => !!p), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },
  dirname:(path) => {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.slice(0, -1);
        }
        return root + dir;
      },
  basename:(path) => path && path.match(/([^\/]+|\/)\/*$/)[1],
join:(...paths) => PATH.normalize(paths.join('/')),
join2:(l, r) => PATH.normalize(l + '/' + r),
};

var initRandomFill = () => {
    // This block is not needed on v19+ since crypto.getRandomValues is builtin
    if (ENVIRONMENT_IS_NODE) {
      var nodeCrypto = require('node:crypto');
      return (view) => (nodeCrypto.randomFillSync(view), 0);
    }

    return (view) => (crypto.getRandomValues(view), 0);
  };
var randomFill = (view) => (randomFill = initRandomFill())(view);



var PATH_FS = {
resolve:(...args) => {
      var resolvedPath = '',
        resolvedAbsolute = false;
      for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        var path = (i >= 0) ? args[i] : FS.cwd();
        // Skip empty and invalid entries
        if (typeof path != 'string') {
          throw new TypeError('Arguments to path.resolve must be strings');
        } else if (!path) {
          return ''; // an invalid portion invalidates the whole thing
        }
        resolvedPath = path + '/' + resolvedPath;
        resolvedAbsolute = PATH.isAbs(path);
      }
      // At this point the path should be resolved to a full absolute path, but
      // handle relative paths to be safe (might happen when process.cwd() fails)
      resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter((p) => !!p), !resolvedAbsolute).join('/');
      return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
    },
relative:(from, to) => {
      from = PATH_FS.resolve(from).slice(1);
      to = PATH_FS.resolve(to).slice(1);
      function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
          if (arr[start] !== '') break;
        }
        var end = arr.length - 1;
        for (; end >= 0; end--) {
          if (arr[end] !== '') break;
        }
        if (start > end) return [];
        return arr.slice(start, end - start + 1);
      }
      var fromParts = trim(from.split('/'));
      var toParts = trim(to.split('/'));
      var length = Math.min(fromParts.length, toParts.length);
      var samePartsLength = length;
      for (var i = 0; i < length; i++) {
        if (fromParts[i] !== toParts[i]) {
          samePartsLength = i;
          break;
        }
      }
      var outputParts = [];
      for (var i = samePartsLength; i < fromParts.length; i++) {
        outputParts.push('..');
      }
      outputParts = outputParts.concat(toParts.slice(samePartsLength));
      return outputParts.join('/');
    },
};


var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();


  /**
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul
   * @return {number}
   */
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
      var maxIdx = idx + maxBytesToRead;
      if (ignoreNul) return maxIdx;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.
      // As a tiny code save trick, compare idx against maxIdx using a negation,
      // so that maxBytesToRead=undefined/NaN means Infinity.
      while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
      return idx;
    };
  
  
    /**
   * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
   * array that contains uint8 values, returns a copy of that string as a
   * Javascript String object.
   * heapOrArray is either a regular array, or a JavaScript typed array view.
   * @param {number=} idx
   * @param {number=} maxBytesToRead
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
  
      var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
  
      // When using conditional TextDecoder, skip it for short strings as the overhead of the native call is not worth it.
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = '';
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++];
        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          if ((u0 & 0xF8) != 0xF0) warnOnce(`Invalid UTF-8 leading byte ${ptrToString(u0)} encountered when deserializing a UTF-8 string in wasm memory to a JS string!`);
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
        }
  
        if (u0 < 0x10000) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 0x10000;
          str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
      }
      return str;
    };
  
  var FS_stdin_getChar_buffer = [];
  
  var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var c = str.charCodeAt(i); // possibly a lead surrogate
        if (c <= 0x7F) {
          len++;
        } else if (c <= 0x7FF) {
          len += 2;
        } else if (c >= 0xD800 && c <= 0xDFFF) {
          len += 4; ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
  
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`);
      // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
      // undefined and false each don't write out any bytes.
      if (!(maxBytesToWrite > 0))
        return 0;
  
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
      for (var i = 0; i < str.length; ++i) {
        // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
        // and https://www.ietf.org/rfc/rfc2279.txt
        // and https://tools.ietf.org/html/rfc3629
        var u = str.codePointAt(i);
        if (u <= 0x7F) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 0x7FF) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 0xC0 | (u >> 6);
          heap[outIdx++] = 0x80 | (u & 63);
        } else if (u <= 0xFFFF) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 0xE0 | (u >> 12);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          if (u > 0x10FFFF) warnOnce(`Invalid Unicode code point ${ptrToString(u)} encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).`);
          heap[outIdx++] = 0xF0 | (u >> 18);
          heap[outIdx++] = 0x80 | ((u >> 12) & 63);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
          // Gotcha: if codePoint is over 0xFFFF, it is represented as a surrogate pair in UTF-16.
          // We need to manually skip over the second code unit for correct iteration.
          i++;
        }
      }
      // Null-terminate the pointer to the buffer.
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
  /** @type {function(string, boolean=, number=)} */
  var intArrayFromString = (stringy, dontAddNull, length) => {
      var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
      if (dontAddNull) u8array.length = numBytesWritten;
      return u8array;
    };
  var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
  
          // For some reason we must suppress a closure warning here, even though
          // fd definitely exists on process.stdin, and is even the proper way to
          // get the fd of stdin,
          // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
          // This started to happen after moving this logic out of library_tty.js,
          // so it is related to the surrounding code in some unclear manner.
          /** @suppress {missingProperties} */
          var fd = process.stdin.fd;
  
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch(e) {
            // Cross-platform differences: on Windows, reading EOF throws an
            // exception, but on other OSes, reading EOF returns 0. Uniformize
            // behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }
  
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          }
        } else
        if (globalThis.window?.prompt) {
          // Browser.
          result = window.prompt('Input: ');  // returns null on cancel
          if (result !== null) {
            result += '\n';
          }
        } else
        {}
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
  var TTY = {
  ttys:[],
  init() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process.stdin.setEncoding('utf8');
        // }
      },
  shutdown() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process.stdin.pause();
        // }
      },
  register(dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },
  stream_ops:{
  open(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        },
  close(stream) {
          // flush any pending line data
          stream.tty.ops.fsync(stream.tty);
        },
  fsync(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
  read(stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === undefined && !bytesRead) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
            // We currently only support canonical mode (ICANON), where
            // read(2) returns as soon as a line delimiter is read.
            if (result === 10) break;
          }
          if (bytesRead) {
            stream.node.atime = Date.now();
          }
          return bytesRead;
        },
  write(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.mtime = stream.node.ctime = Date.now();
          }
          return i;
        },
  },
  default_tty_ops:{
  get_char(tty) {
          return FS_stdin_getChar();
        },
  put_char(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },
  fsync(tty) {
          if (tty.output?.length > 0) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  ioctl_tcgets(tty) {
          // typical setting
          return {
            c_iflag: 25856,
            c_oflag: 5,
            c_cflag: 191,
            c_lflag: 35387,
            c_cc: [
              0x03, 0x1c, 0x7f, 0x15, 0x04, 0x00, 0x01, 0x00, 0x11, 0x13, 0x1a, 0x00,
              0x12, 0x0f, 0x17, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]
          };
        },
  ioctl_tcsets(tty, optional_actions, data) {
          // currently just ignore
          return 0;
        },
  ioctl_tiocgwinsz(tty) {
          return [24, 80];
        },
  },
  default_tty1_ops:{
  put_char(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
  fsync(tty) {
          if (tty.output?.length > 0) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  },
  };
  
  
  /** @type {!Uint8Array} */
  var HEAPU8;
  var zeroMemory = (ptr, size) => HEAPU8.fill(0, ptr, ptr + size);
  
  var alignMemory = (size, alignment) => {
      assert(alignment, 'alignment argument is required');
      return Math.ceil(size / alignment) * alignment;
    };
  var mmapAlloc = (size) => {
      size = alignMemory(size, 65536);
      var ptr = _emscripten_builtin_memalign(65536, size);
      if (ptr) zeroMemory(ptr, size);
      return ptr;
    };
  
  var MEMFS = {
  ops_table:null,
  mount(mount) {
        return MEMFS.createNode(null, '/', 16895, 0);
      },
  createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // not supported
          throw new FS.ErrnoError(63);
        }
        MEMFS.ops_table ||= {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek
            }
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync
            }
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink
            },
            stream: {}
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: FS.chrdev_stream_ops
          }
        };
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          // The actual number of bytes used in the typed array, as opposed to
          // contents.length which gives the whole capacity.
          node.usedBytes = 0;
          // The byte data of the file is stored in a typed array.
          // Note: typed arrays are not resizable like normal JS arrays are, so
          // there is a small penalty involved for appending file writes that
          // continuously grow a file similar to std::vector capacity vs used.
          node.contents = MEMFS.emptyFileContents ??= new Uint8Array(0);
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.atime = node.mtime = node.ctime = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
          parent.atime = parent.mtime = parent.ctime = node.atime;
        }
        return node;
      },
  getFileDataAsTypedArray(node) {
        assert(FS.isFile(node.mode), 'getFileDataAsTypedArray called on non-file');
        return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
      },
  expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents.length;
        if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
        // Don't expand strictly to the given requested limit if it's only a very
        // small increase, but instead geometrically grow capacity.
        // For small filesizes (<1MB), perform size*2 geometric increase, but for
        // large sizes, do a much more conservative size*1.125 increase to avoid
        // overshooting the allocation cap by a very large margin.
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>> 0);
        if (prevCapacity) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
        var oldContents = MEMFS.getFileDataAsTypedArray(node);
        node.contents = new Uint8Array(newCapacity); // Allocate new storage.
        node.contents.set(oldContents);
      },
  resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        var oldContents = node.contents;
        node.contents = new Uint8Array(newSize); // Allocate new storage.
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
        node.usedBytes = newSize;
      },
  node_ops:{
  getattr(node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.atime);
          attr.mtime = new Date(node.mtime);
          attr.ctime = new Date(node.ctime);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },
  setattr(node, attr) {
          for (const key of ['mode', 'atime', 'mtime', 'ctime']) {
            if (attr[key] != null) {
              node[key] = attr[key];
            }
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },
  lookup(parent, name) {
          throw new FS.ErrnoError(44);
        },
  mknod(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },
  rename(old_node, new_dir, new_name) {
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {}
          if (new_node) {
            if (FS.isDir(old_node.mode)) {
              // if we're overwriting a directory at new_name, make sure it's empty.
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
            FS.hashRemoveNode(new_node);
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          new_dir.contents[new_name] = old_node;
          old_node.name = new_name;
          new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now();
        },
  unlink(parent, name) {
          delete parent.contents[name];
          parent.ctime = parent.mtime = Date.now();
        },
  rmdir(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.ctime = parent.mtime = Date.now();
        },
  readdir(node) {
          return ['.', '..', ...Object.keys(node.contents)];
        },
  symlink(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 0o777 | 40960, 0);
          node.link = oldpath;
          return node;
        },
  readlink(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        },
  },
  stream_ops:{
  read(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          buffer.set(contents.subarray(position, position + size), offset);
          return size;
        },
  write(stream, buffer, offset, length, position, canOwn) {
          assert(buffer.subarray, 'FS.write expects a TypedArray');
          // If the buffer is located in main memory (HEAP), and if
          // memory can grow, we can't hold on to references of the
          // memory buffer, as they may get invalidated. That means we
          // need to copy its contents.
          if (buffer.buffer === HEAP8.buffer) {
            canOwn = false;
          }
  
          if (!length) return 0;
          var node = stream.node;
          node.mtime = node.ctime = Date.now();
  
          if (canOwn) {
            assert(!position, 'canOwn must imply no weird position inside the file');
            node.contents = buffer.subarray(offset, offset + length);
            node.usedBytes = length;
          } else if (!node.usedBytes && !position) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
            node.contents = buffer.slice(offset, offset + length);
            node.usedBytes = length;
          } else {
            MEMFS.expandFileStorage(node, position+length);
            // Use typed array write which is available.
            node.contents.set(buffer.subarray(offset, offset + length), position);
            node.usedBytes = Math.max(node.usedBytes, position + length);
          }
          return length;
        },
  llseek(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        },
  mmap(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
            // We can't emulate MAP_SHARED when the file is not backed by the
            // buffer we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            if (contents) {
              // Try to avoid unnecessary slices.
              if (position > 0 || position + length < contents.length) {
                if (contents.subarray) {
                  contents = contents.subarray(position, position + length);
                } else {
                  contents = Array.prototype.slice.call(contents, position, position + length);
                }
              }
              HEAP8.set(contents, ptr);
            }
          }
          return { ptr, allocated };
        },
  msync(stream, buffer, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        },
  },
  };
  
  var FS_modeStringToFlags = (str) => {
      if (typeof str != 'string') return str;
      var flagModes = {
        'r': 0,
        'r+': 2,
        'w': 512 | 64 | 1,
        'w+': 512 | 64 | 2,
        'a': 1024 | 64 | 1,
        'a+': 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == 'undefined') {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
  
  var FS_fileDataToTypedArray = (data) => {
      if (typeof data == 'string') {
        data = intArrayFromString(data, true);
      }
      if (!data.subarray) {
        data = new Uint8Array(data);
      }
      return data;
    };
  
  var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
  
  
  
  
  
    /**
   * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
   * emscripten HEAP, returns a copy of that string as a Javascript String object.
   *
   * @param {number} ptr
   * @param {number=} maxBytesToRead - An optional length that specifies the
   *   maximum number of bytes to read. You can omit this parameter to scan the
   *   string until the first 0 byte. If maxBytesToRead is passed, and the string
   *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
   *   string will cut short at that byte index.
   * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
   * @return {string}
   */
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : '';
    };
  
  var strError = (errno) => UTF8ToString(_strerror(errno));
  
  var ERRNO_CODES = {
      'EPERM': 63,
      'ENOENT': 44,
      'ESRCH': 71,
      'EINTR': 27,
      'EIO': 29,
      'ENXIO': 60,
      'E2BIG': 1,
      'ENOEXEC': 45,
      'EBADF': 8,
      'ECHILD': 12,
      'EAGAIN': 6,
      'EWOULDBLOCK': 6,
      'ENOMEM': 48,
      'EACCES': 2,
      'EFAULT': 21,
      'ENOTBLK': 105,
      'EBUSY': 10,
      'EEXIST': 20,
      'EXDEV': 75,
      'ENODEV': 43,
      'ENOTDIR': 54,
      'EISDIR': 31,
      'EINVAL': 28,
      'ENFILE': 41,
      'EMFILE': 33,
      'ENOTTY': 59,
      'ETXTBSY': 74,
      'EFBIG': 22,
      'ENOSPC': 51,
      'ESPIPE': 70,
      'EROFS': 69,
      'EMLINK': 34,
      'EPIPE': 64,
      'EDOM': 18,
      'ERANGE': 68,
      'ENOMSG': 49,
      'EIDRM': 24,
      'ECHRNG': 106,
      'EL2NSYNC': 156,
      'EL3HLT': 107,
      'EL3RST': 108,
      'ELNRNG': 109,
      'EUNATCH': 110,
      'ENOCSI': 111,
      'EL2HLT': 112,
      'EDEADLK': 16,
      'ENOLCK': 46,
      'EBADE': 113,
      'EBADR': 114,
      'EXFULL': 115,
      'ENOANO': 104,
      'EBADRQC': 103,
      'EBADSLT': 102,
      'EDEADLOCK': 16,
      'EBFONT': 101,
      'ENOSTR': 100,
      'ENODATA': 116,
      'ETIME': 117,
      'ENOSR': 118,
      'ENONET': 119,
      'ENOPKG': 120,
      'EREMOTE': 121,
      'ENOLINK': 47,
      'EADV': 122,
      'ESRMNT': 123,
      'ECOMM': 124,
      'EPROTO': 65,
      'EMULTIHOP': 36,
      'EDOTDOT': 125,
      'EBADMSG': 9,
      'ENOTUNIQ': 126,
      'EBADFD': 127,
      'EREMCHG': 128,
      'ELIBACC': 129,
      'ELIBBAD': 130,
      'ELIBSCN': 131,
      'ELIBMAX': 132,
      'ELIBEXEC': 133,
      'ENOSYS': 52,
      'ENOTEMPTY': 55,
      'ENAMETOOLONG': 37,
      'ELOOP': 32,
      'EOPNOTSUPP': 138,
      'EPFNOSUPPORT': 139,
      'ECONNRESET': 15,
      'ENOBUFS': 42,
      'EAFNOSUPPORT': 5,
      'EPROTOTYPE': 67,
      'ENOTSOCK': 57,
      'ENOPROTOOPT': 50,
      'ESHUTDOWN': 140,
      'ECONNREFUSED': 14,
      'EADDRINUSE': 3,
      'ECONNABORTED': 13,
      'ENETUNREACH': 40,
      'ENETDOWN': 38,
      'ETIMEDOUT': 73,
      'EHOSTDOWN': 142,
      'EHOSTUNREACH': 23,
      'EINPROGRESS': 26,
      'EALREADY': 7,
      'EDESTADDRREQ': 17,
      'EMSGSIZE': 35,
      'EPROTONOSUPPORT': 66,
      'ESOCKTNOSUPPORT': 137,
      'EADDRNOTAVAIL': 4,
      'ENETRESET': 39,
      'EISCONN': 30,
      'ENOTCONN': 53,
      'ETOOMANYREFS': 141,
      'EUSERS': 136,
      'EDQUOT': 19,
      'ESTALE': 72,
      'ENOTSUP': 138,
      'ENOMEDIUM': 148,
      'EILSEQ': 25,
      'EOVERFLOW': 61,
      'ECANCELED': 11,
      'ENOTRECOVERABLE': 56,
      'EOWNERDEAD': 62,
      'ESTRPIPE': 135,
    };
  
  var asyncLoad = async (url) => {
      var arrayBuffer = await readAsync(url);
      assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
      return new Uint8Array(arrayBuffer);
    };
  
  
  var FS_createDataFile = (...args) => FS.createDataFile(...args);
  
  var getUniqueRunDependency = (id) => {
      var orig = id;
      while (1) {
        if (!runDependencyTracking[id]) return id;
        id = orig + Math.random();
      }
    };
  
  var dependenciesPromise = null;
  var resolveRunDependencies = async () => dependenciesPromise;
  var runDependencies = 0;
  
  
  var dependenciesPromiseResolve = null;
  
  var runDependencyTracking = {
  };
  
  var runDependencyWatcher = null;
  var removeRunDependency = (id) => {
      runDependencies--;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
      assert(id, 'removeRunDependency requires an ID');
      assert(runDependencyTracking[id]);
      delete runDependencyTracking[id];
      if (!runDependencies) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        dependenciesPromiseResolve();
      }
    };
  
  
  
  
  var addRunDependency = (id) => {
      if (!runDependencies) {
        dependenciesPromise = new Promise((resolve) => dependenciesPromiseResolve = resolve);
      }
      runDependencies++;
  
      Module['monitorRunDependencies']?.(runDependencies);
  
      assert(id, 'addRunDependency requires an ID')
      assert(!runDependencyTracking[id]);
      runDependencyTracking[id] = 1;
      if (!runDependencyWatcher && globalThis.setInterval) {
        // Check for missing dependencies every few seconds
        runDependencyWatcher = setInterval(() => {
          if (ABORT) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
            return;
          }
          var shown = false;
          for (var dep in runDependencyTracking) {
            if (!shown) {
              shown = true;
              err('still waiting on run dependencies:');
            }
            err(`dependency: ${dep}`);
          }
          if (shown) {
            err('(end of list)');
          }
        }, 10000);
        // Prevent this timer from keeping the runtime alive if nothing
        // else is.
        runDependencyWatcher.unref?.()
      }
    };
  
  
  var preloadPlugins = [];
  var FS_handledByPreloadPlugin = async (byteArray, fullname) => {
      // Ensure plugins are ready.
      if (typeof Browser != 'undefined') Browser.init();
  
      for (var plugin of preloadPlugins) {
        if (plugin['canHandle'](fullname)) {
          assert(plugin['handle'].constructor.name === 'AsyncFunction', 'Filesystem plugin handlers must be async functions (See #24914)')
          return plugin['handle'](byteArray, fullname);
        }
      }
      // If no plugin handled this file then return the original/unmodified
      // byteArray.
      return byteArray;
    };
  var FS_preloadFile = async (parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish) => {
      // TODO we should allow people to just pass in a complete filename instead
      // of parent and name being that we just join them anyways
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
      addRunDependency(dep);
  
      try {
        var byteArray = url;
        if (typeof url == 'string') {
          byteArray = await asyncLoad(url);
        }
  
        byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);
        preFinish?.();
        if (!dontCreateFile) {
          FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
        }
      } finally {
        removeRunDependency(dep);
      }
    };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
      FS_preloadFile(parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish).then(onload).catch(onerror);
    };
  
  var FS = {
  root:null,
  mounts:[],
  devices:{
  },
  streams:[],
  nextInode:1,
  nameTable:null,
  currentPath:"/",
  initialized:false,
  ignorePermissions:true,
  filesystems:null,
  syncFSRequests:0,
  ErrnoError:class extends Error {
        name = 'ErrnoError';
        // We set the `name` property to be able to identify `FS.ErrnoError`
        // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
        // - when using PROXYFS, an error can come from an underlying FS
        // as different FS objects have their own FS.ErrnoError each,
        // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
        // we'll use the reliable test `err.name == "ErrnoError"` instead
        constructor(errno) {
          super(runtimeInitialized ? strError(errno) : '');
          this.errno = errno;
          for (var key in ERRNO_CODES) {
            if (ERRNO_CODES[key] === errno) {
              this.code = key;
              break;
            }
          }
        }
      },
  FSStream:class {
        shared = {};
        get object() {
          return this.node;
        }
        set object(val) {
          this.node = val;
        }
        get isRead() {
          return (this.flags & 2097155) !== 1;
        }
        get isWrite() {
          return (this.flags & 2097155) !== 0;
        }
        get isAppend() {
          return (this.flags & 1024);
        }
        get flags() {
          return this.shared.flags;
        }
        set flags(val) {
          this.shared.flags = val;
        }
        get position() {
          return this.shared.position;
        }
        set position(val) {
          this.shared.position = val;
        }
      },
  FSNode:class {
        node_ops = {};
        stream_ops = {};
        readMode = 292 | 73;
        writeMode = 146;
        mounted = null;
        constructor(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;  // root node sets parent to itself
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.rdev = rdev;
          this.atime = this.mtime = this.ctime = Date.now();
        }
        get read() {
          return (this.mode & this.readMode) === this.readMode;
        }
        set read(val) {
          val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
        }
        get write() {
          return (this.mode & this.writeMode) === this.writeMode;
        }
        set write(val) {
          val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
        }
        get isFolder() {
          return FS.isDir(this.mode);
        }
        get isDevice() {
          return FS.isChrdev(this.mode);
        }
        // The per-inode readiness wait-queue. The node carries a Set of listener
        // entries {cb}; producers (SOCKFS, PIPEFS) call notifyListeners on a
        // readiness transition, and poll()/epoll consume it. It lives on the node
        // (not the fd) so dup'd fds share one queue. Only nodes that derive real
        // readiness (sockets, pipes, and an epoll's own node) ever use this -
        // always-ready types (regular files, ttys) never register or notify.
        addListener(cb, exclusive = false) {
          var entry = {cb, exclusive};
          var listeners = (this.listeners ??= new Set());
          listeners.add(entry);
          return {listeners, entry};
        }
        notifyListeners(flags) {
          // Iterates the set without copying, which is safe ONLY under a
          // load-bearing contract that every internal listener must honour:
          //   1. A listener must not run user code synchronously (a poll waiter only
          //      resolves a Promise; an epoll registration only re-lists +
          //      re-notifies; the epoll callback only schedules a tick). User code
          //      runs on a later tick, never inside this loop.
          //   2. A listener may delete entries only from ITS OWN waiter, never from
          //      a sibling node's set that may be mid-iteration. (Deleting an entry
          //      of the set being iterated here is fine - a Set tolerates removal of
          //      a not-yet-visited entry mid-iteration; mutating a *different* node's
          //      set is fine because that set is not being iterated.)
          // Violating either gives silently skipped wakeups that are near-impossible
          // to reproduce. Any new producer/listener must preserve it.
          if (!this.listeners) return;
          // Fire every non-exclusive listener. Among EPOLLEXCLUSIVE registrations
          // (one fd watched by several epolls) wake only one, rotating round-robin
          // per node, to avoid a thundering herd. (Only epoll registrations are ever
          // exclusive; poll waiters and a node's own consumers are not.)
          var excl;
          for (var entry of this.listeners) {
            if (entry.exclusive) (excl ||= []).push(entry);
            else entry.cb(flags);
          }
          if (excl) {
            var i = (this.exclTurn || 0) % excl.length;
            this.exclTurn = i + 1;
            excl[i].cb(flags);
          }
        }
      },
  lookupPath(path, opts = {}) {
        if (!path) {
          throw new FS.ErrnoError(44);
        }
        opts.follow_mount ??= true
  
        if (!PATH.isAbs(path)) {
          path = FS.cwd() + '/' + path;
        }
  
        // limit max consecutive symlinks to SYMLOOP_MAX.
        linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
          // split the absolute path
          var parts = path.split('/').filter((p) => !!p);
  
          // start at the root
          var current = FS.root;
          var current_path = '/';
  
          for (var i = 0; i < parts.length; i++) {
            var islast = (i === parts.length-1);
            if (islast && opts.parent) {
              // stop resolving
              break;
            }
  
            if (parts[i] === '.') {
              continue;
            }
  
            if (parts[i] === '..') {
              current_path = PATH.dirname(current_path);
              if (FS.isRoot(current)) {
                path = current_path + '/' + parts.slice(i + 1).join('/');
                // We're making progress here, don't let many consecutive ..'s
                // lead to ELOOP
                nlinks--;
                continue linkloop;
              } else {
                current = current.parent;
              }
              continue;
            }
  
            current_path = PATH.join2(current_path, parts[i]);
            try {
              current = FS.lookupNode(current, parts[i]);
            } catch (e) {
              // if noent_okay is true, suppress a ENOENT in the last component
              // and return an object with an undefined node. This is needed for
              // resolving symlinks in the path when creating a file.
              if ((e?.errno === 44) && islast && opts.noent_okay) {
                return { path: current_path };
              }
              throw e;
            }
  
            // jump to the mount's root node if this is a mountpoint
            if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
              current = current.mounted.root;
            }
  
            // by default, lookupPath will not follow a symlink if it is the final path component.
            // setting opts.follow = true will override this behavior.
            if (FS.isLink(current.mode) && (!islast || opts.follow)) {
              if (!current.node_ops.readlink) {
                throw new FS.ErrnoError(52);
              }
              var link = current.node_ops.readlink(current);
              if (!PATH.isAbs(link)) {
                link = PATH.dirname(current_path) + '/' + link;
              }
              path = link + '/' + parts.slice(i + 1).join('/');
              continue linkloop;
            }
          }
          return { path: current_path, node: current };
        }
        throw new FS.ErrnoError(32);
      },
  getPath(node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? `${mount}/${path}` : mount + path;
          }
          path = path ? `${node.name}/${path}` : node.name;
          node = node.parent;
        }
      },
  hashName(parentid, name) {
        var hash = 0;
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },
  hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },
  hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },
  lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },
  createNode(parent, name, mode, rdev) {
        assert(typeof parent == 'object')
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },
  destroyNode(node) {
        FS.hashRemoveNode(node);
      },
  isRoot(node) {
        return node === node.parent;
      },
  isMountpoint(node) {
        return !!node.mounted;
      },
  isFile(mode) {
        return (mode & 61440) === 32768;
      },
  isDir(mode) {
        return (mode & 61440) === 16384;
      },
  isLink(mode) {
        return (mode & 61440) === 40960;
      },
  isChrdev(mode) {
        return (mode & 61440) === 8192;
      },
  isBlkdev(mode) {
        return (mode & 61440) === 24576;
      },
  isFIFO(mode) {
        return (mode & 61440) === 4096;
      },
  isSocket(mode) {
        return (mode & 49152) === 49152;
      },
  flagsToPermissionString(flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },
  nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.includes('r') && !(node.mode & 292)) {
          return 2;
        }
        if (perms.includes('w') && !(node.mode & 146)) {
          return 2;
        }
        if (perms.includes('x') && !(node.mode & 73)) {
          return 2;
        }
        return 0;
      },
  mayLookup(dir) {
        if (!FS.isDir(dir.mode)) return 54;
        var errCode = FS.nodePermissions(dir, 'x');
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0;
      },
  mayCreate(dir, name) {
        if (!FS.isDir(dir.mode)) {
          return 54;
        }
        try {
          var node = FS.lookupNode(dir, name);
          return 20;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },
  mayDelete(dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var errCode = FS.nodePermissions(dir, 'wx');
        if (errCode) {
          return errCode;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 54;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 10;
          }
        } else if (FS.isDir(node.mode)) {
          return 31;
        }
        return 0;
      },
  mayOpen(node, flags) {
        if (!node) {
          return 44;
        }
        if (FS.isLink(node.mode)) {
          return 32;
        }
        var mode = FS.flagsToPermissionString(flags);
        if (FS.isDir(node.mode)) {
          // opening for write
          // TODO: check for O_SEARCH? (== search for dir only)
          if (mode !== 'r' || (flags & (512 | 64))) {
            return 31;
          }
        }
        return FS.nodePermissions(node, mode);
      },
  checkOpExists(op, err) {
        if (!op) {
          throw new FS.ErrnoError(err);
        }
        return op;
      },
  MAX_OPEN_FDS:4096,
  nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(33);
      },
  getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(8);
        }
        return stream;
      },
  getStream:(fd) => FS.streams[fd],
  createStream(stream, fd = -1) {
        assert(fd >= -1);
  
        // clone it, so we can return an instance of FSStream
        stream = Object.assign(new FS.FSStream(), stream);
        if (fd == -1) {
          fd = FS.nextfd();
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },
  closeStream(fd) {
        FS.streams[fd] = null;
      },
  dupStream(origStream, fd = -1) {
        var stream = FS.createStream(origStream, fd);
        stream.stream_ops?.dup?.(stream);
        return stream;
      },
  doSetAttr(stream, node, attr) {
        var setattr = stream?.stream_ops.setattr;
        var arg = setattr ? stream : node;
        setattr ??= node.node_ops.setattr;
        FS.checkOpExists(setattr, 63)
        try {
          setattr(arg, attr);
        } catch (e) {
          if (e instanceof RangeError) {
            throw new FS.ErrnoError(22);
          }
          throw e;
        }
      },
  chrdev_stream_ops:{
  open(stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          stream.stream_ops.open?.(stream);
        },
  llseek() {
          throw new FS.ErrnoError(70);
        },
  },
  major:(dev) => ((dev) >> 8),
  minor:(dev) => ((dev) & 0xff),
  makedev:(ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },
  getDevice:(dev) => FS.devices[dev],
  getMounts(mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push(...m.mounts);
        }
  
        return mounts;
      },
  syncfs(populate, callback) {
        if (typeof populate == 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(errCode) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(errCode);
        }
  
        function done(errCode) {
          if (errCode) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(errCode);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        for (var mount of mounts) {
          if (mount.type.syncfs) {
            mount.type.syncfs(mount, populate, done);
          } else {
            done(null);
          }
        }
      },
  mount(type, opts, mountpoint) {
        if (typeof type == 'string') {
          // The filesystem was not included, and instead we have an error
          // message stored in the variable.
          throw type;
        }
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(10);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
        }
  
        var mount = {
          type,
          opts,
          mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },
  unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(28);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        for (var [hash, current] of Object.entries(FS.nameTable)) {
          while (current) {
            var next = current.name_next;
  
            if (mounts.includes(current.mount)) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        }
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },
  lookup(parent, name) {
        return parent.node_ops.lookup(parent, name);
      },
  mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name) {
          throw new FS.ErrnoError(28);
        }
        if (name === '.' || name === '..') {
          throw new FS.ErrnoError(20);
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },
  statfs(path) {
        return FS.statfsNode(FS.lookupPath(path, {follow: true}).node);
      },
  statfsStream(stream) {
        // We keep a separate statfsStream function because noderawfs overrides
        // it. In noderawfs, stream.node is sometimes null. Instead, we need to
        // look at stream.path.
        return FS.statfsNode(stream.node);
      },
  statfsNode(node) {
        // NOTE: None of the defaults here are true. We're just returning safe and
        //       sane values. Currently nodefs and rawfs replace these defaults,
        //       other file systems leave them alone.
        var rtn = {
          bsize: 4096,
          frsize: 4096,
          blocks: 1e6,
          bfree: 5e5,
          bavail: 5e5,
          files: FS.nextInode,
          ffree: FS.nextInode - 1,
          fsid: 42,
          flags: 2,
          namelen: 255,
        };
  
        if (node.node_ops.statfs) {
          Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));
        }
        return rtn;
      },
  create(path, mode = 0o666) {
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },
  mkdir(path, mode = 0o777) {
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },
  mkdirTree(path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var dir of dirs) {
          if (!dir) continue;
          if (d || PATH.isAbs(path)) d += '/';
          d += dir;
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != 20) throw e;
          }
        }
      },
  mkdev(path, mode, dev) {
        if (typeof dev == 'undefined') {
          dev = mode;
          mode = 0o666;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },
  symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
          throw new FS.ErrnoError(44);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },
  link(oldpath, newpath, flags) {
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // Hardlinks are only supported by filesystem backends that provide a
        // `link` node op (e.g. NODERAWFS backed by the host). NODEFS omits it:
        // a host hardlink cannot be confined to the mount root.
        if (!parent.node_ops.link) {
          throw new FS.ErrnoError(34);
        }
        return parent.node_ops.link(parent, newname, oldpath, flags);
      },
  rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
  
        // let the errors from non existent directories percolate up
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
  
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(75);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(28);
        }
        // new path should not be an ancestor of the old path
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(55);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        errCode = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(10);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          errCode = FS.nodePermissions(old_dir, 'w');
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
          // update old node (we do this here to avoid each backend
          // needing to)
          old_node.parent = new_dir;
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
      },
  rmdir(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
      },
  readdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
        return readdir(node);
      },
  unlink(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
      },
  readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(44);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(28);
        }
        return link.node_ops.readlink(link);
      },
  stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
        return getattr(node);
      },
  fstat(fd) {
        var stream = FS.getStreamChecked(fd);
        var node = stream.node;
        var getattr = stream.stream_ops.getattr;
        var arg = getattr ? stream : node;
        getattr ??= node.node_ops.getattr;
        FS.checkOpExists(getattr, 63)
        return getattr(arg);
      },
  lstat(path) {
        return FS.stat(path, true);
      },
  doChmod(stream, node, mode, dontFollow) {
        FS.doSetAttr(stream, node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          ctime: Date.now(),
          dontFollow
        });
      },
  chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doChmod(null, node, mode, dontFollow);
      },
  lchmod(path, mode) {
        FS.chmod(path, mode, true);
      },
  fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.doChmod(stream, stream.node, mode, false);
      },
  doChown(stream, node, dontFollow) {
        FS.doSetAttr(stream, node, {
          timestamp: Date.now(),
          dontFollow
          // we ignore the uid / gid for now
        });
      },
  chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doChown(null, node, dontFollow);
      },
  lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },
  fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.doChown(stream, stream.node, false);
      },
  doTruncate(stream, node, len) {
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.nodePermissions(node, 'w');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.doSetAttr(stream, node, {
          size: len,
          timestamp: Date.now()
        });
      },
  truncate(path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(28);
        }
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        FS.doTruncate(null, node, len);
      },
  ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if (len < 0 || (stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(28);
        }
        FS.doTruncate(stream, stream.node, len);
      },
  utime(path, atime, mtime, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        FS.doSetAttr(null, lookup.node, {
          atime: atime,
          mtime: mtime,
          dontFollow
        });
      },
  open(path, flags, mode = 0o666) {
        if (path === '') {
          throw new FS.ErrnoError(44);
        }
        flags = FS_modeStringToFlags(flags);
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        var isDirPath;
        if (typeof path == 'object') {
          node = path;
        } else {
          isDirPath = path.endsWith('/');
          // noent_okay makes it so that if the final component of the path
          // doesn't exist, lookupPath returns `node: undefined`. `path` will be
          // updated to point to the target of all symlinks.
          var lookup = FS.lookupPath(path, {
            follow: !(flags & 131072),
            noent_okay: true
          });
          node = lookup.node;
          path = lookup.path;
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(20);
            }
          } else if (isDirPath) {
            throw new FS.ErrnoError(31);
          } else {
            // node doesn't exist, try to create it
            // Ignore the permission bits here to ensure we can `open` this new
            // file below. We use chmod below to apply the permissions once the
            // file is open.
            node = FS.mknod(path, mode | 0o777, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var errCode = FS.mayOpen(node, flags);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // do truncation if necessary
        if ((flags & 512) && !created) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512 | 131072);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        });
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (created) {
          FS.chmod(node, mode & 0o777);
        }
        return stream;
      },
  close(stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (stream.getdents) stream.getdents = null; // free readdir state
        // The fd is going away: wake anything waiting on it (poll/epoll) with
        // POLLNVAL so a blocking wait unblocks and an epoll registration is evicted
        // on its next derive. Only sockets/pipes/epoll ever carry a wait-queue, so
        // for every other stream (incl. nodeless noderawfs stdio) this is a no-op.
        stream.node?.notifyListeners(32);
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },
  isClosed(stream) {
        return stream.fd === null;
      },
  llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(70);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
          throw new FS.ErrnoError(28);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },
  read(stream, buffer, offset, length, position) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(28);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },
  write(stream, buffer, offset, length, position, canOwn) {
        assert(offset >= 0);
        assert(buffer.subarray, 'FS.write expects a TypedArray');
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(28);
        }
        if (stream.seekable && stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten;
      },
  mmap(stream, length, position, prot, flags) {
        // User requests writing to file (prot & PROT_WRITE != 0).
        // Checking if we have permissions to write to the file unless
        // MAP_PRIVATE flag is set. According to POSIX spec it is possible
        // to write to file opened in read-only mode with MAP_PRIVATE flag,
        // as all modifications will be visible only in the memory of
        // the current process.
        if ((prot & 2)
            && !(flags & 2)
            && (stream.flags & 2097155) !== 2) {
          throw new FS.ErrnoError(2);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(2);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(43);
        }
        if (!length) {
          throw new FS.ErrnoError(28);
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags);
      },
  msync(stream, buffer, offset, length, mmapFlags) {
        assert(offset >= 0);
        if (!stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },
  ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(59);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },
  readFile(path, opts = {}) {
        opts.flags = opts.flags ?? 0;
        opts.encoding = opts.encoding ?? 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          abort(`Invalid encoding type "${opts.encoding}"`);
        }
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          buf = UTF8ArrayToString(buf);
        }
        FS.close(stream);
        return buf;
      },
  writeFile(path, data, opts = {}) {
        opts.flags = opts.flags ?? 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        data = FS_fileDataToTypedArray(data);
        FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        FS.close(stream);
      },
  cwd:() => FS.currentPath,
  chdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(44);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(54);
        }
        var errCode = FS.nodePermissions(lookup.node, 'x');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.currentPath = lookup.path;
      },
  createDefaultDirectories() {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },
  createDefaultDevices() {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: () => 0,
          write: (stream, buffer, offset, length, pos) => length,
          llseek: () => 0,
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using err() rather than out()
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        // use a buffer to avoid overhead of individual crypto calls per byte
        var randomBuffer = new Uint8Array(1024), randomLeft = 0;
        var randomByte = () => {
          if (!randomLeft) {
            randomFill(randomBuffer);
            randomLeft = randomBuffer.byteLength;
          }
          return randomBuffer[--randomLeft];
        };
        FS.createDevice('/dev', 'random', randomByte);
        FS.createDevice('/dev', 'urandom', randomByte);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },
  createSpecialDirectories() {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
        // name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        var proc_self = FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount() {
            var node = FS.createNode(proc_self, 'fd', 16895, 73);
            node.stream_ops = {
              llseek: MEMFS.stream_ops.llseek,
            };
            node.node_ops = {
              lookup(parent, name) {
                var fd = +name;
                var stream = FS.getStreamChecked(fd);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: () => stream.path },
                  id: fd + 1,
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              },
              readdir() {
                return Array.from(FS.streams.entries())
                  .filter(([k, v]) => v)
                  .map(([k, v]) => k.toString());
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },
  createStandardStreams(input, output, error) {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (input) {
          FS.createDevice('/dev', 'stdin', input);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (output) {
          FS.createDevice('/dev', 'stdout', null, output);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (error) {
          FS.createDevice('/dev', 'stderr', null, error);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 0);
        var stdout = FS.open('/dev/stdout', 1);
        var stderr = FS.open('/dev/stderr', 1);
        assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
        assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
        assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
      },
  staticInit() {
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
        };
      },
  init(input, output, error) {
        assert(!FS.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.initialized = true;
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        input ??= Module['stdin'];
        output ??= Module['stdout'];
        error ??= Module['stderr'];
  
        FS.createStandardStreams(input, output, error);
      },
  quit() {
        FS.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        _fflush(0);
        // close all of our streams
        for (var stream of FS.streams) {
          if (stream) {
            FS.close(stream);
          }
        }
      },
  findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
          return null;
        }
        return ret.object;
      },
  analyzePath(path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },
  createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            if (e.errno != 20) throw e;
          }
          parent = current;
        }
        return current;
      },
  createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode);
      },
  createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
          parent = typeof parent == 'string' ? parent : FS.getPath(parent);
          path = name ? PATH.join2(parent, name) : parent;
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          data = FS_fileDataToTypedArray(data);
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 577);
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
      },
  createDevice(parent, name, input, output) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(!!input, !!output);
        FS.createDevice.major ??= 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open(stream) {
            stream.seekable = false;
          },
          close(stream) {
            // flush any pending line data
            if (output?.buffer?.length) {
              output(10);
            }
          },
          read(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && !bytesRead) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.atime = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.mtime = stream.node.ctime = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },
  forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (globalThis.XMLHttpRequest) {
          abort('Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.');
        } else { // Command-line.
          try {
            obj.contents = readBinary(obj.url);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
      },
  createLazyFile(parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array).
        // Actual getting is abstracted away for eventual reuse.
        class LazyUint8Array {
          lengthKnown = false;
          chunks = []; // Loaded chunks. Index is the chunk number
          get(idx) {
            if (idx > this.length-1 || idx < 0) {
              return undefined;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = (idx / this.chunkSize)|0;
            return this.getter(chunkNum)[chunkOffset];
          }
          setDataGetter(getter) {
            this.getter = getter;
          }
          cacheLength() {
            // Find length
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort(`Couldn't load ${url}. Status: ${xhr.status}`);
            var datalength = Number(xhr.getResponseHeader('Content-length'));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader('Accept-Ranges')) && header === 'bytes';
            var usesGzip = (header = xhr.getResponseHeader('Content-Encoding')) && header === 'gzip';
  
            var chunkSize = 1024*1024; // Chunk size in bytes
  
            if (!hasByteServing) chunkSize = datalength;
  
            // Function to get a range from the remote URL.
            var doXHR = (from, to) => {
              if (from > to) abort(`invalid range (${from}, ${to}) or no bytes requested!`);
              if (to > datalength-1) abort(`only ${datalength} bytes available! programmer error!`);
  
              // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
              var xhr = new XMLHttpRequest();
              xhr.open('GET', url, false);
              if (datalength !== chunkSize) xhr.setRequestHeader('Range', `bytes=${from}-${to}`);
  
              // Some hints to the browser that we want binary data.
              xhr.responseType = 'arraybuffer';
              if (xhr.overrideMimeType) {
                xhr.overrideMimeType('text/plain; charset=x-user-defined');
              }
  
              xhr.send(null);
              if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort(`Couldn't load ${url}. Status: ${xhr.status}`);
              if (xhr.response !== undefined) {
                return new Uint8Array(/** @type{Array<number>} */(xhr.response || []));
              }
              return intArrayFromString(xhr.responseText ?? '', true);
            };
            var lazyArray = this;
            lazyArray.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum+1) * chunkSize - 1; // including this byte
              end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
                lazyArray.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') abort('doXHR failed!');
              return lazyArray.chunks[chunkNum];
            });
  
            if (usesGzip || !datalength) {
              // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
              chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out('LazyFiles on gzip forces download of the whole file when length is accessed');
            }
  
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          }
          get length() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
          get chunkSize() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
  
        if (globalThis.XMLHttpRequest) {
          if (!ENVIRONMENT_IS_WORKER) abort('Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc');
          var lazyArray = new LazyUint8Array();
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        for (const [key, fn] of Object.entries(node.stream_ops)) {
          stream_ops[key] = (...args) => {
            FS.forceLoadFile(node);
            return fn(...args);
          };
        }
        function writeChunks(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        }
        // use a custom read function
        stream_ops.read = (stream, buffer, offset, length, position) => {
          FS.forceLoadFile(node);
          return writeChunks(stream, buffer, offset, length, position)
        };
        // use a custom mmap function
        stream_ops.mmap = (stream, length, position, prot, flags) => {
          FS.forceLoadFile(node);
          var ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          writeChunks(stream, HEAP8, ptr, length, position);
          return { ptr, allocated: true };
        };
        node.stream_ops = stream_ops;
        return node;
      },
  };
  
  
  
  
  
  /** not-@type {!BigInt64Array} */
  var HEAP64;
  var SYSCALLS = {
  currentUmask:18,
  calculateAt(dirfd, path, allowEmpty) {
        if (PATH.isAbs(path)) {
          return path;
        }
        // relative path
        var dir;
        if (dirfd === -100) {
          dir = FS.cwd();
        } else {
          var dirstream = SYSCALLS.getStreamFromFD(dirfd);
          dir = dirstream.path;
        }
        if (path.length == 0) {
          if (!allowEmpty) {
            throw new FS.ErrnoError(44);;
          }
          return dir;
        }
        return dir + '/' + path;
      },
  writeStat(buf, stat) {
        HEAPU32[((buf)>>2)] = stat.dev;
        HEAPU32[(((buf)+(4))>>2)] = stat.mode;
        HEAPU32[(((buf)+(8))>>2)] = stat.nlink;
        HEAPU32[(((buf)+(12))>>2)] = stat.uid;
        HEAPU32[(((buf)+(16))>>2)] = stat.gid;
        HEAPU32[(((buf)+(20))>>2)] = stat.rdev;
        HEAP64[(((buf)+(24))>>3)] = BigInt(stat.size);
        HEAP32[(((buf)+(32))>>2)] = 4096;
        HEAP32[(((buf)+(36))>>2)] = stat.blocks;
        var atime = stat.atime.getTime();
        var mtime = stat.mtime.getTime();
        var ctime = stat.ctime.getTime();
        HEAP64[(((buf)+(40))>>3)] = BigInt(Math.floor(atime / 1000));
        HEAPU32[(((buf)+(48))>>2)] = (atime % 1000) * 1000 * 1000;
        HEAP64[(((buf)+(56))>>3)] = BigInt(Math.floor(mtime / 1000));
        HEAPU32[(((buf)+(64))>>2)] = (mtime % 1000) * 1000 * 1000;
        HEAP64[(((buf)+(72))>>3)] = BigInt(Math.floor(ctime / 1000));
        HEAPU32[(((buf)+(80))>>2)] = (ctime % 1000) * 1000 * 1000;
        HEAP64[(((buf)+(88))>>3)] = BigInt(stat.ino);
        return 0;
      },
  writeStatFs(buf, stats) {
        HEAPU32[(((buf)+(4))>>2)] = stats.bsize;
        HEAPU32[(((buf)+(60))>>2)] = stats.bsize;
        HEAP64[(((buf)+(8))>>3)] = BigInt(stats.blocks);
        HEAP64[(((buf)+(16))>>3)] = BigInt(stats.bfree);
        HEAP64[(((buf)+(24))>>3)] = BigInt(stats.bavail);
        HEAP64[(((buf)+(32))>>3)] = BigInt(stats.files);
        HEAP64[(((buf)+(40))>>3)] = BigInt(stats.ffree);
        HEAPU32[(((buf)+(48))>>2)] = stats.fsid;
        HEAPU32[(((buf)+(64))>>2)] = stats.flags;  // ST_NOSUID
        HEAPU32[(((buf)+(56))>>2)] = stats.namelen;
      },
  doMsync(addr, stream, len, flags, offset) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (flags & 2) {
          // MAP_PRIVATE calls need not to be synced back to underlying fs
          return 0;
        }
        var buffer = HEAPU8.subarray(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags);
      },
  getStreamFromFD(fd) {
        var stream = FS.getStreamChecked(fd);
        return stream;
      },
  varargs:undefined,
  getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },
  };
  
  /** @type {!Int16Array} */
  var HEAP16;
  function ___syscall_fcntl64(fd, cmd, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (cmd) {
        case 0: {
          var arg = syscallGetVarargI();
          if (arg < 0) {
            return -28;
          }
          while (FS.streams[arg]) {
            arg++;
          }
          var newStream;
          newStream = FS.dupStream(stream, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;  // FD_CLOEXEC makes no sense for a single process.
        case 3:
          return stream.flags;
        case 4: {
          var arg = syscallGetVarargI();
          var mask = 289792;
          stream.flags = (stream.flags & ~mask) | (arg & mask);
          return 0;
        }
        case 12: {
          var arg = syscallGetVarargP();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg)+(offset))>>1)] = 2;
          return 0;
        }
        case 13:
        case 14:
          // Pretend that the locking is successful. These are process-level locks,
          // and Emscripten programs are a single process. If we supported linking a
          // filesystem between programs, we'd need to do more here.
          // See https://github.com/emscripten-core/emscripten/issues/23697
          return 0;
      }
      return -28;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  
  
  
  function ___syscall_ioctl(fd, op, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (op) {
        case 21509: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21505: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcgets) {
            var termios = stream.tty.ops.ioctl_tcgets(stream);
            var argp = syscallGetVarargP();
            HEAP32[((argp)>>2)] = termios.c_iflag || 0;
            HEAP32[(((argp)+(4))>>2)] = termios.c_oflag || 0;
            HEAP32[(((argp)+(8))>>2)] = termios.c_cflag || 0;
            HEAP32[(((argp)+(12))>>2)] = termios.c_lflag || 0;
            for (var i = 0; i < 32; i++) {
              HEAP8[(argp + i)+(17)] = termios.c_cc[i] || 0;
            }
            return 0;
          }
          return 0;
        }
        case 21510:
        case 21511:
        case 21512: {
          if (!stream.tty) return -59;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcsets) {
            var argp = syscallGetVarargP();
            var c_iflag = HEAP32[((argp)>>2)];
            var c_oflag = HEAP32[(((argp)+(4))>>2)];
            var c_cflag = HEAP32[(((argp)+(8))>>2)];
            var c_lflag = HEAP32[(((argp)+(12))>>2)];
            var c_cc = []
            for (var i = 0; i < 32; i++) {
              c_cc.push(HEAP8[(argp + i)+(17)]);
            }
            return stream.tty.ops.ioctl_tcsets(stream.tty, op, { c_iflag, c_oflag, c_cflag, c_lflag, c_cc });
          }
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -59;
          var argp = syscallGetVarargP();
          HEAP32[((argp)>>2)] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -59;
          return -28; // not supported
        }
        case 21537:
        case 21531: {
          var argp = syscallGetVarargP();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tiocgwinsz) {
            var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
            var argp = syscallGetVarargP();
            HEAP16[((argp)>>1)] = winsize[0];
            HEAP16[(((argp)+(2))>>1)] = winsize[1];
          }
          return 0;
        }
        case 21524: {
          // TODO: technically, this ioctl call should change the window size.
          // but, since emscripten doesn't have any concept of a terminal window
          // yet, we'll just silently throw it away as we do TIOCGWINSZ
          if (!stream.tty) return -59;
          return 0;
        }
        case 21515: {
          if (!stream.tty) return -59;
          return 0;
        }
        default: return -28; // not supported
      }
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  
  function ___syscall_openat(dirfd, path, flags, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      var mode = varargs ? syscallGetVarargI() : 0;
      if (flags & 64) {
        mode &= ~SYSCALLS.currentUmask;
      }
      return FS.open(path, flags, mode).fd;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }
  

  var __abort_js = () =>
      abort('native code called abort()');

  var __emscripten_throw_longjmp = () => {
      throw new EmscriptenSjLj;
    };

  var getHeapMax = () =>
      // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
      // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
      // for any code that deals with heap sizes, which would require special
      // casing all heap size related code to treat 0 specially.
      2147483648;
  
  
  var growMemory = (size) => {
      var oldHeapSize = wasmMemory.buffer.byteLength;
      var pages = ((size - oldHeapSize + 65535) / 65536) | 0;
      try {
        // round size grow request up to wasm page size (fixed 64KB per spec)
        wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
        updateMemoryViews();
        return 1 /*success*/;
      } catch(e) {
        err(`growMemory: Attempted to grow heap from ${oldHeapSize} bytes to ${size} bytes, but got error: ${e}`);
      }
      // implicit 0 return to save code size (caller will cast 'undefined' into 0
      // anyhow)
    };
  
  var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0;
      // With multithreaded builds, races can happen (another thread might increase the size
      // in between), so return a failure, and let the caller retry.
      assert(requestedSize > oldSize);
  
      // Memory resize rules:
      // 1.  Always increase heap size to at least the requested size, rounded up
      //     to next page multiple.
      // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
      //     geometrically: increase the heap size according to
      //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
      //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
      // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
      //     linearly: increase the heap size by at least
      //     MEMORY_GROWTH_LINEAR_STEP bytes.
      // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
      //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
      // 4.  If we were unable to allocate as much memory, it may be due to
      //     over-eager decision to excessively reserve due to (3) above.
      //     Hence if an allocation fails, cut down on the amount of excess
      //     growth, in an attempt to succeed to perform a smaller allocation.
  
      // A limit is set for how much we can grow. We should not exceed that
      // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);
        return false;
      }
  
      // Loop through potential heap size increases. If we attempt a too eager
      // reservation that fails, cut down on the attempted size and reserve a
      // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
        // but limit overreserving (default to capping at +96MB overgrowth at most)
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296 );
  
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
  
        var replacement = growMemory(newSize);
        if (replacement) {
  
          return true;
        }
      }
      err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);
      return false;
    };

  function _fd_close(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  /** @param {number=} offset */
  var doReadv = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        iov += 8;
        try {
          var curr = FS.read(stream, HEAP8, ptr, len, offset);
        } catch (e) {
          // On a non-blocking stream a subsequent read may would-block after we
          // already gathered data. POSIX readv is a single gather-read: return
          // what we have rather than failing the whole call.
          if (ret > 0 && e instanceof FS.ErrnoError &&
              (e.errno == 6 || e.errno == 6)) {
            break;
          }
          throw e;
        }
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break; // nothing more to read
        if (typeof offset != 'undefined') {
          offset += curr;
        }
      }
      return ret;
    };
  
  
  function _fd_read(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doReadv(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  var INT53_MAX = 9007199254740992;
  
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => (num < INT53_MIN || num > INT53_MAX) ? NaN : Number(num);
  
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
  
  
  try {
  
      if (isNaN(offset)) return 22;
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.llseek(stream, offset, whence);
      HEAP64[((newOffset)>>3)] = BigInt(stream.position);
      if (stream.getdents && !offset && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
  }

  
  
  /** @param {number=} offset */
  var doWritev = (stream, iov, iovcnt, offset) => {
      // Gather all iovecs into one contiguous buffer and issue a single
      // FS.write, matching POSIX writev's single gather-write semantics (as
      // __syscall_sendmsg already does). Per-iovec writes fragment a stream
      // socket send into multiple segments, breaking stream byte semantics.
      if (iovcnt == 1) {
        // Single iovec: write directly from HEAP8, no gather buffer needed.
        return FS.write(stream, HEAP8, HEAPU32[((iov)>>2)], HEAPU32[(((iov)+(4))>>2)], offset);
      }
      var total = 0;
      for (var i = 0, p = iov; i < iovcnt; i++, p += 8) {
        total += HEAPU32[(((p)+(4))>>2)];
      }
      var view = new Uint8Array(total);
      var voff = 0;
      for (var i = 0; i < iovcnt; i++, iov += 8) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        view.set(HEAPU8.subarray(ptr, ptr + len), voff);
        voff += len;
      }
      return FS.write(stream, view, 0, total, offset);
    };
  
  
  function _fd_write(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doWritev(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }
  

  
  var runtimeKeepaliveCounter = 0;
  var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
  var _proc_exit = (code) => {
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        Module['onExit']?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    };
  
  
  /** @param {boolean|number=} implicit */
  var exitJS = (status, implicit) => {
      EXITSTATUS = status;
  
      checkUnflushedContent();
  
      // if exit() was called explicitly, warn the user if the runtime isn't actually being shut down
      if (keepRuntimeAlive() && !implicit) {
        var msg = `program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;
        err(msg);
      }
  
      _proc_exit(status);
    };

  var handleException = (e) => {
      // Certain exception types we do not treat as errors since they are used for
      // internal control flow.
      // 1. ExitStatus, which is thrown by exit()
      // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
      //    that wish to return to JS event loop.
      if (e instanceof ExitStatus || e == 'unwind') {
        return EXITSTATUS;
      }
      checkStackCookie();
      if (e instanceof WebAssembly.RuntimeError) {
        if (_emscripten_stack_get_current() <= 0) {
          err('Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)');
        }
      }
      quit_(1, e);
    };

  
  
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      assert(typeof maxBytesToWrite == 'number', 'stringToUTF8 requires a third parameter that specifies the length of the output buffer');
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    };
  
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };


  var wasmTableMirror = [];
  
  
  var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        /** @suppress {checkTypes} */
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      /** @suppress {checkTypes} */
      assert(wasmTable.get(funcPtr) == func, 'table mirror is out of date');
      return func;
    };



  var FS_createPath = (...args) => FS.createPath(...args);



  var FS_unlink = (...args) => FS.unlink(...args);

  var FS_createLazyFile = (...args) => FS.createLazyFile(...args);

  var FS_createDevice = (...args) => FS.createDevice(...args);



  FS.createPreloadedFile = FS_createPreloadedFile;
  FS.preloadFile = FS_preloadFile;
  FS.staticInit();;
// End JS library code

// include: postlibrary.js
// This file is included after the automatically-generated JS library code
// but before the wasm module is created.

{

  // Begin ATMODULES hooks
  if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];

if (Module['print']) out = Module['print'];
if (Module['printErr']) err = Module['printErr'];
  // End ATMODULES hooks

  checkIncomingModuleAPI();

  if (Module['arguments']) programArgs = Module['arguments'];
  if (Module['thisProgram']) thisProgram = Module['thisProgram'];

  // Assertions on removed incoming Module JS APIs.
  assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
  assert(typeof Module['read'] == 'undefined', 'Module.read option was removed');
  assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
  assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
  assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
  assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
  assert(typeof Module['ENVIRONMENT'] == 'undefined', 'Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
  assert(typeof Module['STACK_SIZE'] == 'undefined', 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')
  // If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
  assert(typeof Module['wasmMemory'] == 'undefined', 'Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally');
  assert(typeof Module['INITIAL_MEMORY'] == 'undefined', 'Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically');

  var preInit = Module['preInit'];
  if (preInit) {
    if (typeof preInit == 'function') Module['preInit'] = preInit = [preInit];
    // Written as a loop so that preInit functions that themselves add more
    // preInit functions.  Is this actually needed?
    while (preInit.length > 0) {
      preInit.shift()();
    }
  }
  consumedModuleProp('preInit');
}

// Begin runtime exports
  Module['callMain'] = callMain;
  Module['addRunDependency'] = addRunDependency;
  Module['removeRunDependency'] = removeRunDependency;
  Module['FS_preloadFile'] = FS_preloadFile;
  Module['FS_unlink'] = FS_unlink;
  Module['FS_createPath'] = FS_createPath;
  Module['FS_createDevice'] = FS_createDevice;
  Module['FS'] = FS;
  Module['FS_createDataFile'] = FS_createDataFile;
  Module['FS_createLazyFile'] = FS_createLazyFile;
  var missingLibrarySymbols = [
  'writeI53ToI64',
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'readI53FromI64',
  'readI53FromU64',
  'convertI32PairToI53',
  'convertI32PairToI53Checked',
  'convertU32PairToI53',
  'getTempRet0',
  'setTempRet0',
  'createNamedFunction',
  'withStackSave',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'readEmAsmArgs',
  'jstoi_q',
  'getExecutableName',
  'autoResumeAudioContext',
  'getDynCaller',
  'dynCall',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'callUserCallback',
  'maybeExit',
  'asmjsMangle',
  'HandleAllocator',
  'addOnInit',
  'addOnPostCtor',
  'addOnPreMain',
  'addOnExit',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'ccall',
  'cwrap',
  'convertJsFunctionToWasm',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'addFunction',
  'removeFunction',
  'setValue',
  'getValue',
  'intArrayToString',
  'AsciiToString',
  'stringToAscii',
  'UTF16ToString',
  'stringToUTF16',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'stringToNewUTF8',
  'writeArrayToMemory',
  'registerKeyEventCallback',
  'maybeCStringToJsString',
  'findEventTarget',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'callCanvasResizedCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'setLetterbox',
  'currentFullscreenStrategy',
  'softFullscreenResizeWebGLRenderTarget',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'registerPointerlockErrorEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'registerBeforeUnloadEventCallback',
  'fillBatteryEventData',
  'registerBatteryEventCallback',
  'setCanvasElementSize',
  'getCanvasElementSize',
  'jsStackTrace',
  'getCallstack',
  'convertPCtoSourceLocation',
  'getEnvStrings',
  'checkWasiClock',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'safeSetTimeout',
  'setImmediateWrapped',
  'safeRequestAnimationFrame',
  'clearImmediateWrapped',
  'registerPostMainLoop',
  'registerPreMainLoop',
  'getPromise',
  'makePromise',
  'addPromise',
  'idsToPromises',
  'makePromiseCallback',
  'Browser_asyncPrepareDataCounter',
  'isLeapYear',
  'ydayFromDate',
  'arraySum',
  'addDays',
  'getSocketFromFD',
  'getSocketAddress',
  'FS_mkdirTree',
  '_setNetworkCallback',
  'heapObjectForWebGLType',
  'toTypedArrayIndex',
  'webgl_enable_ANGLE_instanced_arrays',
  'webgl_enable_OES_vertex_array_object',
  'webgl_enable_WEBGL_draw_buffers',
  'webgl_enable_WEBGL_multi_draw',
  'webgl_enable_EXT_polygon_offset_clamp',
  'webgl_enable_EXT_clip_control',
  'webgl_enable_WEBGL_polygon_mode',
  'emscriptenWebGLGet',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  'emscriptenWebGLGetUniform',
  'webglGetProgramUniformLocation',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'writeGLArray',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'writeStringToMemory',
  'writeAsciiToMemory',
  'allocateUTF8',
  'allocateUTF8OnStack',
  'stackTrace',
  'getNativeTypeSize',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

  var unexportedSymbols = [
  'run',
  'out',
  'err',
  'abort',
  'wasmExports',
  'writeStackCookie',
  'checkStackCookie',
  'INT53_MAX',
  'INT53_MIN',
  'bigintToI53Checked',
  'HEAP8',
  'HEAPU8',
  'HEAP16',
  'HEAPU16',
  'HEAP32',
  'HEAPU32',
  'HEAPF32',
  'HEAPF64',
  'HEAP64',
  'HEAPU64',
  'stackSave',
  'stackRestore',
  'stackAlloc',
  'ptrToString',
  'zeroMemory',
  'exitJS',
  'getHeapMax',
  'growMemory',
  'ENV',
  'ERRNO_CODES',
  'strError',
  'DNS',
  'Protocols',
  'Sockets',
  'timers',
  'warnOnce',
  'readEmAsmArgsArray',
  'handleException',
  'keepRuntimeAlive',
  'asyncLoad',
  'alignMemory',
  'mmapAlloc',
  'wasmTable',
  'wasmMemory',
  'getUniqueRunDependency',
  'noExitRuntime',
  'addOnPreRun',
  'addOnPostRun',
  'freeTableIndexes',
  'functionsInTableMap',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'UTF8ToString',
  'stringToUTF8Array',
  'stringToUTF8',
  'lengthBytesUTF8',
  'intArrayFromString',
  'UTF16Decoder',
  'stringToUTF8OnStack',
  'JSEvents',
  'specialHTMLTargets',
  'findCanvasEventTarget',
  'restoreOldWindowedStyle',
  'UNWIND_CACHE',
  'ExitStatus',
  'doReadv',
  'doWritev',
  'initRandomFill',
  'randomFill',
  'emSetImmediate',
  'emClearImmediate_deps',
  'emClearImmediate',
  'promiseMap',
  'Browser',
  'requestFullscreen',
  'setCanvasSize',
  'getUserMedia',
  'createContext',
  'getPreloadedImageData__data',
  'wget',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'SYSCALLS',
  'preloadPlugins',
  'FS_createPreloadedFile',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_fileDataToTypedArray',
  'FS_stdin_getChar_buffer',
  'FS_stdin_getChar',
  'FS_readFile',
  'FS_root',
  'FS_mounts',
  'FS_devices',
  'FS_streams',
  'FS_nextInode',
  'FS_nameTable',
  'FS_currentPath',
  'FS_initialized',
  'FS_ignorePermissions',
  'FS_filesystems',
  'FS_syncFSRequests',
  'FS_lookupPath',
  'FS_getPath',
  'FS_hashName',
  'FS_hashAddNode',
  'FS_hashRemoveNode',
  'FS_lookupNode',
  'FS_createNode',
  'FS_destroyNode',
  'FS_isRoot',
  'FS_isMountpoint',
  'FS_isFile',
  'FS_isDir',
  'FS_isLink',
  'FS_isChrdev',
  'FS_isBlkdev',
  'FS_isFIFO',
  'FS_isSocket',
  'FS_flagsToPermissionString',
  'FS_nodePermissions',
  'FS_mayLookup',
  'FS_mayCreate',
  'FS_mayDelete',
  'FS_mayOpen',
  'FS_checkOpExists',
  'FS_nextfd',
  'FS_getStreamChecked',
  'FS_getStream',
  'FS_createStream',
  'FS_closeStream',
  'FS_dupStream',
  'FS_doSetAttr',
  'FS_chrdev_stream_ops',
  'FS_major',
  'FS_minor',
  'FS_makedev',
  'FS_registerDevice',
  'FS_getDevice',
  'FS_getMounts',
  'FS_syncfs',
  'FS_mount',
  'FS_unmount',
  'FS_lookup',
  'FS_mknod',
  'FS_statfs',
  'FS_statfsStream',
  'FS_statfsNode',
  'FS_create',
  'FS_mkdir',
  'FS_mkdev',
  'FS_symlink',
  'FS_link',
  'FS_rename',
  'FS_rmdir',
  'FS_readdir',
  'FS_readlink',
  'FS_stat',
  'FS_fstat',
  'FS_lstat',
  'FS_doChmod',
  'FS_chmod',
  'FS_lchmod',
  'FS_fchmod',
  'FS_doChown',
  'FS_chown',
  'FS_lchown',
  'FS_fchown',
  'FS_doTruncate',
  'FS_truncate',
  'FS_ftruncate',
  'FS_utime',
  'FS_open',
  'FS_close',
  'FS_isClosed',
  'FS_llseek',
  'FS_read',
  'FS_write',
  'FS_mmap',
  'FS_msync',
  'FS_ioctl',
  'FS_writeFile',
  'FS_cwd',
  'FS_chdir',
  'FS_createDefaultDirectories',
  'FS_createDefaultDevices',
  'FS_createSpecialDirectories',
  'FS_createStandardStreams',
  'FS_staticInit',
  'FS_init',
  'FS_quit',
  'FS_findObject',
  'FS_analyzePath',
  'FS_createFile',
  'FS_forceLoadFile',
  'MEMFS',
  'TTY',
  'PIPEFS',
  'SOCKFS',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'GL',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'SDL',
  'SDL_gfx',
  'print',
  'printErr',
  'jstoi_s',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);

  // End runtime exports
  // Begin JS library exports
  // End JS library exports

// end include: postlibrary.js

function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
  ignoredModuleProp('logReadFiles');
  ignoredModuleProp('loadSplitModule');
  ignoredModuleProp('onMalloc');
  ignoredModuleProp('onRealloc');
  ignoredModuleProp('onFree');
  ignoredModuleProp('onSbrkGrow');
  ignoredModuleProp('onCOSCacheHit');
  ignoredModuleProp('onCOSCacheMiss');
  ignoredModuleProp('onCOSStore');
  ignoredModuleProp('GL_MAX_TEXTURE_IMAGE_UNITS');
  ignoredModuleProp('SDL_canPlayWithWebAudio');
  ignoredModuleProp('SDL_numSimultaneouslyQueuedBuffers');
  ignoredModuleProp('freePreloadedMediaOnUse');
  ignoredModuleProp('preinitializedWebGLContext');
  ignoredModuleProp('keyboardListeningElement');
  ignoredModuleProp('doNotCaptureKeyboard');
  ignoredModuleProp('extraStackTrace');
  ignoredModuleProp('preloadPlugins');
  ignoredModuleProp('preMainLoop');
  ignoredModuleProp('postMainLoop');
  ignoredModuleProp('forcedAspectRatio');
  ignoredModuleProp('mainScriptUrlOrBlob');
  ignoredModuleProp('onFullScreen');
  ignoredModuleProp('INITIAL_MEMORY');
  ignoredModuleProp('wasmMemory');
  ignoredModuleProp('wasmBinary');
}

// Imports from the Wasm binary.
var _main = Module['_main'] = makeInvalidEarlyAccess('_main');
var _strerror = makeInvalidEarlyAccess('_strerror');
var _fflush = makeInvalidEarlyAccess('_fflush');
var _emscripten_builtin_memalign = makeInvalidEarlyAccess('_emscripten_builtin_memalign');
var _emscripten_stack_get_end = makeInvalidEarlyAccess('_emscripten_stack_get_end');
var _emscripten_stack_get_base = makeInvalidEarlyAccess('_emscripten_stack_get_base');
var _setThrew = makeInvalidEarlyAccess('_setThrew');
var _emscripten_stack_init = makeInvalidEarlyAccess('_emscripten_stack_init');
var _emscripten_stack_get_free = makeInvalidEarlyAccess('_emscripten_stack_get_free');
var __emscripten_stack_restore = makeInvalidEarlyAccess('__emscripten_stack_restore');
var __emscripten_stack_alloc = makeInvalidEarlyAccess('__emscripten_stack_alloc');
var _emscripten_stack_get_current = makeInvalidEarlyAccess('_emscripten_stack_get_current');
var memory = makeInvalidEarlyAccess('memory');
var __indirect_function_table = makeInvalidEarlyAccess('__indirect_function_table');
var wasmMemory = makeInvalidEarlyAccess('wasmMemory');
var wasmTable = makeInvalidEarlyAccess('wasmTable');

function assignWasmExports(wasmExports) {
  assert(typeof wasmExports['__main_argc_argv'] != 'undefined', 'missing Wasm export: __main_argc_argv');
  assert(typeof wasmExports['strerror'] != 'undefined', 'missing Wasm export: strerror');
  assert(typeof wasmExports['fflush'] != 'undefined', 'missing Wasm export: fflush');
  assert(typeof wasmExports['emscripten_builtin_memalign'] != 'undefined', 'missing Wasm export: emscripten_builtin_memalign');
  assert(typeof wasmExports['emscripten_stack_get_end'] != 'undefined', 'missing Wasm export: emscripten_stack_get_end');
  assert(typeof wasmExports['emscripten_stack_get_base'] != 'undefined', 'missing Wasm export: emscripten_stack_get_base');
  assert(typeof wasmExports['setThrew'] != 'undefined', 'missing Wasm export: setThrew');
  assert(typeof wasmExports['emscripten_stack_init'] != 'undefined', 'missing Wasm export: emscripten_stack_init');
  assert(typeof wasmExports['emscripten_stack_get_free'] != 'undefined', 'missing Wasm export: emscripten_stack_get_free');
  assert(typeof wasmExports['_emscripten_stack_restore'] != 'undefined', 'missing Wasm export: _emscripten_stack_restore');
  assert(typeof wasmExports['_emscripten_stack_alloc'] != 'undefined', 'missing Wasm export: _emscripten_stack_alloc');
  assert(typeof wasmExports['emscripten_stack_get_current'] != 'undefined', 'missing Wasm export: emscripten_stack_get_current');
  assert(typeof wasmExports['memory'] != 'undefined', 'missing Wasm export: memory');
  assert(typeof wasmExports['__indirect_function_table'] != 'undefined', 'missing Wasm export: __indirect_function_table');
  _main = Module['_main'] = createExportWrapper('__main_argc_argv', wasmExports['__main_argc_argv'], 2);
  _strerror = createExportWrapper('strerror', wasmExports['strerror'], 1);
  _fflush = createExportWrapper('fflush', wasmExports['fflush'], 1);
  _emscripten_builtin_memalign = createExportWrapper('emscripten_builtin_memalign', wasmExports['emscripten_builtin_memalign'], 2);
  _emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'];
  _emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'];
  _setThrew = createExportWrapper('setThrew', wasmExports['setThrew'], 2);
  _emscripten_stack_init = wasmExports['emscripten_stack_init'];
  _emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'];
  __emscripten_stack_restore = wasmExports['_emscripten_stack_restore'];
  __emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'];
  _emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'];
  memory = wasmMemory = wasmExports['memory'];
  __indirect_function_table = wasmTable = wasmExports['__indirect_function_table'];
}

var wasmImports = {
  /** @export */
  __syscall_fcntl64: ___syscall_fcntl64,
  /** @export */
  __syscall_ioctl: ___syscall_ioctl,
  /** @export */
  __syscall_openat: ___syscall_openat,
  /** @export */
  _abort_js: __abort_js,
  /** @export */
  _emscripten_throw_longjmp: __emscripten_throw_longjmp,
  /** @export */
  emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */
  fd_close: _fd_close,
  /** @export */
  fd_read: _fd_read,
  /** @export */
  fd_seek: _fd_seek,
  /** @export */
  fd_write: _fd_write,
  /** @export */
  invoke_iiii,
  /** @export */
  invoke_vii
};

function invoke_vii(index,a1,a2) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (!(e instanceof EmscriptenEH)) throw e;
    _setThrew(1, 0);
  }
}


// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

var calledRun;

function callMain(args = []) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])');
  assert(typeof onPreRuns === 'undefined' || onPreRuns.length == 0, 'cannot call main when preRun functions remain to be called');

  var entryFunction = _main;

  args.unshift(thisProgram);

  var argc = args.length;
  var argv = stackAlloc((argc + 1) * 4);
  var argv_ptr = argv;
  for (var arg of args) {
    HEAPU32[((argv_ptr)>>2)] = stringToUTF8OnStack(arg);
    argv_ptr += 4;
  }
  HEAPU32[((argv_ptr)>>2)] = 0;

  try {

    var ret = entryFunction(argc, argv);

    // if we're not running an evented main loop, it's time to exit
    exitJS(ret, /* implicit = */ true);
    return ret;
  } catch (e) {
    return handleException(e);
  }
}

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

async function run(args = programArgs) {
  assert(!calledRun);
  calledRun = true;

  stackCheckInit();

  preRun();

  if (runDependencies) {
    await resolveRunDependencies();
  }

  var setStatus = Module['setStatus'];
  if (setStatus) {
    setStatus('Running...');
    // Yield to the event loop to allow the browser to paint "Running..."
    await new Promise((resolve) => setTimeout(resolve, 1));
    // Then we want to clear the status text, but only after the rest of this function runs.
    setTimeout(setStatus, 1, '');
  }

  if (ABORT) return;

  initRuntime();

  // No ATMAINS hooks

  Module['onRuntimeInitialized']?.();
  consumedModuleProp('onRuntimeInitialized');

  var noInitialRun = Module['noInitialRun'] || true;
  if (!noInitialRun) callMain(args);

  postRun();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    _fflush(0);
    // also flush in the JS FS layer
    for (var name of ['stdout', 'stderr']) {
      var info = FS.analyzePath('/dev/' + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty?.output?.length) {
        has = true;
      }
    }
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
  }
}

var wasmExports;

// In modularize mode the generated code is within a factory function so we
// can use await here (since it's not top-level-await).
wasmExports = await createWasm();
await run();

// end include: postamble.js

// include: postamble_modularize.js
// In MODULARIZE mode we wrap the generated code in a factory function
// and return either the Module itself, or a promise of the module.

// Assertion for attempting to access module properties on the incoming
// moduleArg.  In the past we used this object as the prototype of the module
// and assigned properties to it, but now we return a distinct object.  This
// keeps the instance private until it is ready (i.e the promise has been
// resolved).
for (const prop of Object.keys(Module)) {
  if (!(prop in moduleArg)) {
    Object.defineProperty(moduleArg, prop, {
      configurable: true,
      get() {
        abort(`Access to module property ('${prop}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`)
      }
    });
  }
}
// end include: postamble_modularize.js



    return Module;
  };
})();

// Export using a UMD style export, or ES6 exports if selected
if (typeof exports === 'object' && typeof module === 'object') {
  module.exports = createPlconv;
  // This default export looks redundant, but it allows TS to import this
  // commonjs style module.
  module.exports.default = createPlconv;
} else if (typeof define === 'function' && define['amd'])
  define([], () => createPlconv);

