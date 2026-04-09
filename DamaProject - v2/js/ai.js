import { board, isGameOver, getValidMoves } from './main.js';

let worker      = null;
let modelReady  = false;
let pendingMove = null;

function emitProgress(stage, pct, detail = '') {
    window.dispatchEvent(new CustomEvent('ai-progress', {
        detail: { stage, pct, detail }
    }));
}

// ─── 1. AI Initialization ─────────────────────────────────────────────────────
export function initAI() {
    return new Promise(resolve => {
        try {
            // import.meta.url resolves relative to THIS file (ai.js),
            // not index.html — this is the correct way inside ES modules.
            worker = new Worker(new URL('./model-worker.js', import.meta.url));
        } catch (e) {
            console.error('Web Worker failed to start:', e);
            emitProgress('error', 0, '⚠️ Worker failed to start');
            resolve(false);
            return;
        }

        worker.onmessage = ({ data }) => {
            switch (data.type) {
                case 'progress':
                    emitProgress(data.stage, data.pct, data.detail);
                    break;
                case 'ready':
                    modelReady = true;
                    console.log('✅ AI model ready!');
                    resolve(true);
                    break;
                case 'error':
                    console.error('❌ Worker error:', data.message);
                    emitProgress('error', 0, '⚠️ ' + data.message);
                    resolve(false);
                    break;
                case 'move':
                    if (pendingMove) {
                        pendingMove.resolve(data.move);
                        pendingMove = null;
                    }
                    break;
            }
        };

        worker.onerror = e => {
            // e.message is often undefined on 404 — give a helpful fallback
            const msg = e.message || `Could not load model-worker.js (check file path)`;
            console.error('Worker crashed:', msg, e);
            emitProgress('error', 0, '⚠️ ' + msg);
            resolve(false);
        };

        worker.postMessage({ type: 'load' });
    });
}

// ─── 2. The Neural Network Brain ──────────────────────────────────────────────
export function calculateAIMove(activePiece) {
    if (isGameOver) return Promise.resolve(null);

    const validMoves = getValidMoves(1, activePiece);
    if (!validMoves.length) return Promise.resolve(null);

    if (!worker || !modelReady) {
        const m = validMoves[Math.floor(Math.random() * validMoves.length)];
        return Promise.resolve(m);
    }

    return new Promise(resolve => {
        pendingMove = { resolve };
        worker.postMessage({
            type:  'move',
            board: board.map(r => [...r]),
            moves: validMoves,
        });
        // Safety timeout
        setTimeout(() => {
            if (pendingMove) {
                pendingMove = null;
                resolve(validMoves[Math.floor(Math.random() * validMoves.length)]);
            }
        }, 5000);
    });
}

// ─── 3. Required Helpers ──────────────────────────────────────────────────────
export function applyMoveOnBoard(b, fr, fc, tr, tc) {
    const nb = b.map(row => [...row]);
    const p  = nb[fr][fc];
    nb[fr][fc] = 0;
    nb[tr][tc] = p;
    const isCapture = Math.max(Math.abs(tr-fr), Math.abs(tc-fc)) >= 2;
    if (isCapture) {
        const dr = Math.sign(tr-fr), dc = Math.sign(tc-fc);
        let cr = fr+dr, cc = fc+dc;
        while (cr !== tr || cc !== tc) { nb[cr][cc] = 0; cr += dr; cc += dc; }
    }
    if ((p === 1 && tr === 7) || (p === -1 && tr === 0)) nb[tr][tc] = p * 2;
    return { board: nb, isCapture };
}

export function findBestMove(b, player) {
    const moves = getValidMoves(player);
    if (!moves.length) return null;
    return moves[Math.floor(Math.random() * moves.length)];
}
