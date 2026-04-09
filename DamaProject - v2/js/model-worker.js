// ─── AI Model Worker ──────────────────────────────────────────────────────────
// Loads and runs the TF.js neural network off the main thread.
// Uses WASM backend (WebGL is unavailable in workers).

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/tf-backend-wasm.js');

let model       = null;
let inputBuffer = null; // reusable Float32Array — no GC per move

function progress(pct, stage, detail) {
    self.postMessage({ type: 'progress', pct, stage, detail });
}

// ─── Keras v3 → TF.js Patcher ────────────────────────────────────────────────
function patchInboundNodes(nodes) {
    if (!Array.isArray(nodes) || !nodes.length) return nodes;
    if (Array.isArray(nodes[0])) return nodes; // already old format
    const out = [];
    for (const node of nodes) {
        if (!node.args) continue;
        const rowArgs = [];
        for (const arg of node.args) {
            if (arg.class_name === '__keras_tensor__' && arg.config?.keras_history) {
                const [n, ni, ti] = arg.config.keras_history;
                rowArgs.push([n, ni, ti, {}]);
            }
        }
        if (rowArgs.length === 1) out.push(rowArgs[0]);
        else if (rowArgs.length > 1) out.push(rowArgs);
    }
    return out;
}

function patchLayers(layers) {
    for (const layer of layers) {
        if (!layer.config) continue;
        const cfg = layer.config;
        // Fix 1: batch_shape → batch_input_shape
        if (layer.class_name === 'InputLayer' && cfg.batch_shape && !cfg.batch_input_shape) {
            cfg.batch_input_shape = cfg.batch_shape;
            delete cfg.batch_shape;
        }
        // Fix 2: dtype object → plain string
        if (cfg.dtype && typeof cfg.dtype === 'object')
            cfg.dtype = cfg.dtype?.config?.name || 'float32';
        // Fix 3: inbound_nodes new format → old format
        if (Array.isArray(layer.inbound_nodes))
            layer.inbound_nodes = patchInboundNodes(layer.inbound_nodes);
        if (Array.isArray(cfg.layers)) patchLayers(cfg.layers);
    }
}

// ─── IndexedDB cache ─────────────────────────────────────────────────────────
function openIDB() {
    return new Promise((res, rej) => {
        const r = indexedDB.open('ai-model-cache', 1);
        r.onupgradeneeded = e => e.target.result.createObjectStore('weights');
        r.onsuccess = e => res(e.target.result);
        r.onerror   = e => rej(e.target.error);
    });
}
function idbGet(db, key) {
    return new Promise((res, rej) => {
        const r = db.transaction('weights','readonly').objectStore('weights').get(key);
        r.onsuccess = e => res(e.target.result ?? null);
        r.onerror   = e => rej(e.target.error);
    });
}
function idbSet(db, key, val) {
    return new Promise((res, rej) => {
        const r = db.transaction('weights','readwrite').objectStore('weights').put(val, key);
        r.onsuccess = () => res();
        r.onerror   = e => rej(e.target.error);
    });
}

// ─── Load model ───────────────────────────────────────────────────────────────
async function loadModel() {
    try {
        // 1. Init WASM backend
        progress(2, 'backend', 'Initialising WASM backend…');
        tf.wasm.setWasmPaths(
            'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/'
        );
        await tf.setBackend('wasm');
        await tf.ready();
        console.log('[Worker] Backend:', tf.getBackend());

        // 2. Fetch model.json
        progress(5, 'fetching-config', 'Fetching model config…');
        const resp = await fetch('/model/model.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching model.json`);
        const modelJSON = await resp.json();
        const cacheKey  = 'w_' + btoa(JSON.stringify(modelJSON.weightsManifest)).slice(0, 40);
        progress(20, 'fetching-config', 'Config loaded');

        // 3. Try IDB cache first
        let mergedBuffer = null;
        try {
            const db  = await openIDB();
            const hit = await idbGet(db, cacheKey);
            if (hit) {
                progress(60, 'cache', '⚡ Weights from local cache');
                mergedBuffer = hit;
            }
        } catch (e) { /* IDB unavailable, fall through */ }

        // 4. Download weights if not cached
        if (!mergedBuffer) {
            const allPaths = [];
            for (const g of (modelJSON.weightsManifest || []))
                for (const p of (g.paths || [])) allPaths.push(p);

            const buffers = [];
            for (let i = 0; i < allPaths.length; i++) {
                progress(
                    20 + Math.round((i / allPaths.length) * 38),
                    'fetching-weights',
                    `Downloading weights (${i + 1}/${allPaths.length})…`
                );
                const r = await fetch('/model/' + allPaths[i]);
                if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${allPaths[i]}`);
                buffers.push(await r.arrayBuffer());
            }

            // Merge shards
            const total  = buffers.reduce((s, b) => s + b.byteLength, 0);
            const merged = new Uint8Array(total);
            let off = 0;
            for (const b of buffers) { merged.set(new Uint8Array(b), off); off += b.byteLength; }
            mergedBuffer = merged.buffer;

            // Save to IDB in background
            openIDB()
                .then(db => idbSet(db, cacheKey, mergedBuffer))
                .catch(e => console.warn('[Worker] IDB save failed:', e));

            progress(60, 'fetching-weights', 'Download complete');
        }

        // 5. Patch Keras v3 incompatibilities
        progress(65, 'parsing', 'Patching Keras v3 topology…');
        const layers = modelJSON?.modelTopology?.model_config?.config?.layers;
        if (layers) patchLayers(layers);

        const weightSpecs = [];
        for (const g of (modelJSON.weightsManifest || []))
            for (const w of (g.weights || [])) weightSpecs.push(w);

        // 6. Build model graph
        progress(72, 'parsing', 'Building model graph…');
        model = await tf.loadLayersModel(tf.io.fromMemory({
            modelTopology: modelJSON.modelTopology,
            weightSpecs,
            weightData: mergedBuffer,
        }));

        // 7. Warm-up + pre-allocate reusable input buffer
        progress(92, 'warming-up', 'Warming up…');
        inputBuffer = new Float32Array(64); // 8×8 board flattened
        tf.tidy(() => model.predict(tf.tensor(inputBuffer, [1, 8, 8, 1])));

        progress(100, 'ready', '✅ AI ready!');
        self.postMessage({ type: 'ready' });

    } catch (e) {
        self.postMessage({ type: 'error', message: e.message });
    }
}

// ─── Inference (fast path) ────────────────────────────────────────────────────
function calcMove(board, validMoves) {
    if (!model || !validMoves.length) {
        self.postMessage({ type: 'move', move: validMoves[Math.floor(Math.random() * validMoves.length)] ?? null });
        return;
    }
    try {
        // Fill reusable buffer — zero alloc
        if (!inputBuffer) inputBuffer = new Float32Array(64);
        for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++)
                inputBuffer[r * 8 + c] = board[r][c];

        // dataSync() is synchronous but fine here — we're in a worker
        // tf.tidy() cleans up all intermediate tensors automatically
        const probs = tf.tidy(() =>
            model.predict(tf.tensor(inputBuffer, [1, 8, 8, 1])).dataSync()
        );

        let best = null, bestScore = -Infinity;
        for (const m of validMoves) {
            const score = probs[(m.fr * 512) + (m.fc * 64) + (m.tr * 8) + m.tc];
            if (score > bestScore) { bestScore = score; best = m; }
        }

        self.postMessage({ type: 'move', move: best ?? validMoves[0] });
    } catch (e) {
        console.error('[Worker] Inference error:', e.message);
        self.postMessage({ type: 'move', move: validMoves[Math.floor(Math.random() * validMoves.length)] });
    }
}

// ─── Message router ───────────────────────────────────────────────────────────
self.onmessage = ({ data }) => {
    if (data.type === 'load') loadModel();
    if (data.type === 'move') calcMove(data.board, data.moves);
};
