import { renderBoard, updateStatus, clearSelection } from './board.js';
import { initAI, calculateAIMove, findBestMove, applyMoveOnBoard } from './ai.js';
import { showScreen, updateCoinDisplays, showAchievement, playSound, renderLeaderboard, renderAchievements, showGameOver, hideGameOver } from './ui.js';
import { buyItem, applyEquippedItems, renderStore, renderStoreTab } from './store.js';
import { gameState, saveState, ACHIEVEMENTS } from './state.js';

// --- Game State Exports ------------------------------------------------------
export let board        = [];
export let currentTurn  = -1;   // -1 = Human/Player1, +1 = AI/Player2
export let isAiThinking = false;
export let activePiece  = null;
export let isGameOver   = false;
export let hintMove     = null;  // Highlighted hint move {fr,fc,tr,tc}
export let lastMove     = null;  // Last executed move for trail highlight
export let moveLog      = [];    // Array of { notation, isCapture, turn }

// --- Private State -----------------------------------------------------------
let turnToken     = 0;           // Stale-timeout cancellation
let boardHistory  = [];          // For undo: array of snapshots
let isDailyGame   = false;
let piecesLostByPlayer = 0;      // For flawless / comeback tracking
let maxDeficit    = 0;           // For comeback achievement
let moveCount     = 0;           // Total moves this game

// --- App Boot ----------------------------------------------------------------
async function bootApp() {
    // ── Register Service Worker (root-level sw.js) ────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(r => console.log('[SW] Registered, scope:', r.scope))
            .catch(e => console.warn('[SW] Registration failed:', e.message));
    }

    // ── Expose globals needed by inline HTML onclick handlers ─────────────
    window.buyItem        = buyItem;
    window.renderStoreTab = renderStoreTab;
    window.setGameMode    = setGameMode;
    window.undoMove       = undoMove;
    window.getHint        = getHint;
    window.startDaily     = startDaily;
    window.playAgain      = playAgain;
    window.showScreen     = (id) => {
        showScreen(id);
        if (id === 'screen-game' && (board.length === 0 || isGameOver)) resetGame();
        if (id === 'screen-leaderboard') renderLeaderboard();
        if (id === 'screen-store')       renderStore();
        if (id === 'screen-achievements') renderAchievements();
    };

    // ── Apply saved theme / coins before showing anything ─────────────────
    updateCoinDisplays();
    applyEquippedItems();
    updateGameModeUI();

    const soundBtn = document.getElementById('sound-btn');
    if (soundBtn) soundBtn.innerHTML = gameState.soundEnabled
        ? '<i class="bi bi-volume-up-fill"></i>'
        : '<i class="bi bi-volume-mute-fill"></i>';

    // ── Wire AI progress → existing loading screen bar ────────────────────
    const bar      = document.getElementById('loading-bar');
    const hint     = document.querySelector('.loading-hint');

    function setLoadProgress(pct, label) {
        if (bar)  bar.style.width  = pct + '%';
        if (hint) hint.textContent = label || '';
    }

    setLoadProgress(5, 'Initialising board engine…');

    window.addEventListener('ai-progress', e => {
        const { stage, pct, detail } = e.detail;
        setLoadProgress(pct, detail);

        if (stage === 'ready') {
            // Short pause so the player sees 100 % before we switch
            setLoadProgress(100, '✅ Ready!');
            setTimeout(enterMenu, 600);
        } else if (stage === 'error') {
            // AI failed but game is still playable with fallback
            setLoadProgress(100, detail);
            setTimeout(enterMenu, 1800);
        }
    });

    // ── Start AI loading in background — UI stays responsive ─────────────
    initAI();

    // Safety net: if ai-progress never fires (e.g. no model folder),
    // show the menu after 6 seconds regardless
    const safetyTimer = setTimeout(() => {
        enterMenu();
    }, 6000);

    function enterMenu() {
        clearTimeout(safetyTimer);
        updateDailyButton();
        showScreen('screen-menu');
    }
}

// --- Settings -----------------------------------------------------------------
export function setGameMode(m) {
    gameState.gameMode = m;
    saveState();
    updateGameModeUI();
}

function updateGameModeUI() {
    document.querySelectorAll('[data-mode]').forEach(function(b) {
        b.classList.toggle('active', b.dataset.mode === gameState.gameMode);
    });
    const p2label = document.getElementById('p2-label');
    if (p2label) p2label.textContent = 'AI Bot';
}

// --- Daily Challenge ---------------------------------------------------------
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function seededRng(seed) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (s >>> 0) / 0xFFFFFFFF;
    };
}

function getDailySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth()+1) * 100 + d.getDate();
}

function buildDailyBoard() {
    const rng = seededRng(getDailySeed());
    const b   = Array(8).fill(null).map(() => Array(8).fill(0));
    let placed = 0;
    while (placed < 8) {
        const r = Math.floor(rng() * 4), c = Math.floor(rng() * 8);
        if (b[r][c] === 0) { b[r][c] = rng() < 0.25 ? 2 : 1; placed++; }
    }
    placed = 0;
    while (placed < 8) {
        const r = 4 + Math.floor(rng() * 4), c = Math.floor(rng() * 8);
        if (b[r][c] === 0) { b[r][c] = rng() < 0.25 ? -2 : -1; placed++; }
    }
    return b;
}

function updateDailyButton() {
    const btn = document.getElementById('daily-btn');
    if (!btn) return;
    const done = gameState.daily.date === todayStr() && gameState.daily.completed;
    btn.textContent = done ? '\u2705 Daily Done' : 'cal Daily Challenge';
    btn.disabled    = done;
}

export function startDaily() {
    if (gameState.daily.date === todayStr() && gameState.daily.completed) return;
    isDailyGame = true;
    showScreen('screen-game');
    resetGame(buildDailyBoard());
    updateStatus('Daily Challenge -- 8v8 Endgame! (+100 bonus)', '#f39c12');
}

// --- Core Reset ---------------------------------------------------------------
function resetGame(customBoard = null) {
    if (customBoard) {
        board = customBoard.map(row => [...row]);
    } else {
        board = Array(8).fill(null).map(() => Array(8).fill(0));
        // Pieces only on dark squares -- (r+c) % 2 !== 0
        for (let r = 0; r < 3; r++)
            for (let c = 0; c < 8; c++)
                if ((r + c) % 2 !== 0) board[r][c] = 1;
        for (let r = 5; r < 8; r++)
            for (let c = 0; c < 8; c++)
                if ((r + c) % 2 !== 0) board[r][c] = -1;
    }

    currentTurn        = -1;
    activePiece        = null;
    isAiThinking       = false;
    isGameOver         = false;
    hintMove           = null;
    lastMove           = null;
    moveLog            = [];
    boardHistory       = [];
    piecesLostByPlayer = 0;
    maxDeficit         = 0;
    moveCount          = 0;
    turnToken++;
    clearSelection();

    const modeText = 'Your Turn';
    updateStatus(modeText, '#2ecc71');
    toggleUndoButton();
    renderBoard();
}

// --- Move Rules (Diagonal) ---------------------------------------------------
function isValidMove(fr, fc, tr, tc, piece) {
    if (tr < 0 || tr > 7 || tc < 0 || tc > 7 || board[tr][tc] !== 0) return false;

    const dr    = tr - fr;
    const dc    = tc - fc;
    const isKing = Math.abs(piece) === 2;

    // All moves must be strictly diagonal
    if (Math.abs(dr) !== Math.abs(dc)) return false;

    const dist  = Math.abs(dr);
    const stepR = dr > 0 ? 1 : -1;
    const stepC = dc > 0 ? 1 : -1;

    if (!isKing) {
        if (dist === 1) {
            // Regular pieces move forward only (no backward single steps)
            if (piece === -1 && dr !== -1) return false; // player moves toward row 0
            if (piece ===  1 && dr !==  1) return false; // AI moves toward row 7
            return true;
        } else if (dist === 2) {
            // Capture: forward direction only (same rule as steps)
            if (piece === -1 && dr !== -2) return false; // player must capture toward row 0
            if (piece ===  1 && dr !==  2) return false; // AI must capture toward row 7
            const mid = board[fr + stepR][fc + stepC];
            return (piece < 0 && mid > 0) || (piece > 0 && mid < 0);
        }
        return false;
    } else {
        // Flying king: any diagonal distance, may jump at most one enemy
        let enemyCount = 0;
        for (let i = 1; i < dist; i++) {
            const p = board[fr + i*stepR][fc + i*stepC];
            if (p !== 0) {
                if ((piece > 0 && p > 0) || (piece < 0 && p < 0)) return false;
                enemyCount++;
            }
        }
        return enemyCount <= 1;
    }
}

export function getValidMoves(player, checkPiece = null) {
    let moves = [], captures = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (checkPiece && (r !== checkPiece.r || c !== checkPiece.c)) continue;
            const p = board[r][c];
            if ((player===-1&&p<0)||(player===1&&p>0)) {
                for (let tr = 0; tr < 8; tr++) {
                    for (let tc = 0; tc < 8; tc++) {
                        if (isValidMove(r,c,tr,tc,p)) {
                            const dist = Math.max(Math.abs(tr-r),Math.abs(tc-c));
                            const sR = (tr-r)===0?0:((tr-r)>0?1:-1);
                            const sC = (tc-c)===0?0:((tc-c)>0?1:-1);
                            let isCap = false;
                            for (let i=1;i<dist;i++) if(board[r+i*sR][c+i*sC]!==0) isCap=true;
                            if (isCap) captures.push({fr:r,fc:c,tr,tc});
                            else       moves.push({fr:r,fc:c,tr,tc});
                        }
                    }
                }
            }
        }
    }
    return captures.length > 0 ? captures : moves;
}

// --- Undo ---------------------------------------------------------------------
function pushHistory() {
    boardHistory.push({
        board:        board.map(row => [...row]),
        currentTurn,
        moveLog:      [...moveLog],
        piecesLostByPlayer,
        maxDeficit,
        moveCount,
    });
    toggleUndoButton();
}

export function undoMove() {
    if (boardHistory.length === 0 || isGameOver || isAiThinking) return;

    const cost = gameState.gameMode === 'vsAI' ? 10 : 0;
    if (cost > 0 && gameState.coins < cost) {
        updateStatus(`Need ${cost} coins to undo!`, '#e74c3c');
        return;
    }

    // Undo 2 plies: player move + AI response
    const plies = 2;
    const toPop  = Math.min(plies, boardHistory.length);
    let snap;
    for (let i = 0; i < toPop; i++) snap = boardHistory.pop();

    board              = snap.board;
    currentTurn        = snap.currentTurn;
    moveLog            = snap.moveLog;
    piecesLostByPlayer = snap.piecesLostByPlayer;
    maxDeficit         = snap.maxDeficit;
    moveCount          = snap.moveCount;
    activePiece        = null;
    isAiThinking       = false;
    hintMove           = null;
    isGameOver         = false;
    turnToken++;
    clearSelection();

    if (cost > 0) {
        gameState.coins -= cost;
        saveState();
        updateCoinDisplays();
    }

    playSound('undo');
    toggleUndoButton();
    updateStatus('Your Turn', '#2ecc71');
    renderBoard();
}

function toggleUndoButton() {
    const btn = document.getElementById('undo-btn');
    if (!btn) return;
    btn.disabled = boardHistory.length === 0 || isGameOver;
    const cost = gameState.gameMode === 'vsAI' ? 10 : 0;
    btn.textContent = cost > 0 ? `\u21A9 Undo (${cost}G)` : '\u21A9 Undo';
}

// --- Hint ---------------------------------------------------------------------
export function getHint() {
    if (isGameOver || isAiThinking) return;
    const cost = 5;
    if (gameState.coins < cost) { updateStatus(`Need ${cost} coins for a hint!`, '#e74c3c'); return; }

    // Find best move for the current player at depth 2
    const best = findBestMove(board, currentTurn, 2);
    if (!best) return;

    gameState.coins -= cost;
    saveState();
    updateCoinDisplays();

    hintMove = best;
    playSound('hint');
    renderBoard();

    // Auto-clear hint after 3s
    setTimeout(() => { hintMove = null; renderBoard(); }, 3000);
}

// --- Piece / Board Counters ---------------------------------------------------
function countPieces() {
    let ai = 0, player = 0;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            if (board[r][c] > 0) ai++;
            else if (board[r][c] < 0) player++;
        }
    return { ai, player };
}

// --- Achievements -------------------------------------------------------------
function unlockAchievement(id) {
    if (gameState.achievements.includes(id)) return;
    gameState.achievements.push(id);
    saveState();
    showAchievement(ACHIEVEMENTS[id]);
}

function checkAchievements(event, data = {}) {
    if (event === 'capture') {
        unlockAchievement('first-capture');
    }
    if (event === 'promote') {
        if (data.player === -1) unlockAchievement('first-king');
    }
    if (event === 'win') {
        const { mode } = data;
        if (mode === 'vsAI')     unlockAchievement('win-easy'); // single "beat AI" achievement
        if (mode === '2player')  unlockAchievement('2p-winner');
        if (gameState.stats.streak >= 3) unlockAchievement('streak-3');
        if (gameState.stats.streak >= 5) unlockAchievement('streak-5');
        if (piecesLostByPlayer === 0)    unlockAchievement('flawless');
        if (maxDeficit >= 8)             unlockAchievement('comeback');
        if (moveCount <= 24)             unlockAchievement('speed-win');
    }
    if (event === 'daily') {
        unlockAchievement('daily-done');
    }
}

// --- Move Notation ------------------------------------------------------------
function toNotation(fr, fc, tr, tc, isCapture) {
    const col = String.fromCharCode(65 + fc);
    const rowF = 8 - fr, rowT = 8 - tr;
    return `${col}${rowF}${isCapture ? '\u00D7' : '\u2192'}${String.fromCharCode(65+tc)}${rowT}`;
}

// --- Move Execution -----------------------------------------------------------
export function attemptPlayerMove(fr, fc, tr, tc) {
    makeMove(fr, fc, tr, tc);
}

export function makeMove(fr, fc, tr, tc) {
    // Snapshot before move (only at start of a fresh turn, not mid-multijump)
    if (!activePiece) pushHistory();

    const piece = board[fr][fc];
    board[tr][tc] = piece;
    board[fr][fc] = 0;

    let isCapture = false;
    const dist = Math.max(Math.abs(tr-fr), Math.abs(tc-fc));
    const sR = (tr-fr)===0?0:((tr-fr)>0?1:-1);
    const sC = (tc-fc)===0?0:((tc-fc)>0?1:-1);

    for (let i = 1; i < dist; i++) {
        const mR = fr+i*sR, mC = fc+i*sC;
        if (board[mR][mC] !== 0) {
            board[mR][mC] = 0;
            isCapture = true;
        }
    }

    // Update move log
    moveCount++;
    gameState.stats.totalMoves++;
    const notation = toNotation(fr, fc, tr, tc, isCapture);
    moveLog.push({ notation, isCapture, turn: currentTurn, num: moveCount });

    // Track piece loss for achievements
    if (isCapture) {
        if (currentTurn === 1) piecesLostByPlayer++;
        checkAchievements('capture');
        if (currentTurn === -1) {
            gameState.coins += 5;
            saveState();
            updateCoinDisplays();
        }
        playSound('capture');
    } else {
        playSound('move');
    }

    // Track max deficit for comeback
    const { ai, player } = countPieces();
    const deficit = ai - player;
    if (deficit > maxDeficit) maxDeficit = deficit;

    let promoted = false;
    if (tr === 7 && piece === 1)  { board[tr][tc] = 2;  promoted = true; checkAchievements('promote', { player: 1  }); playSound('promote'); }
    if (tr === 0 && piece === -1) { board[tr][tc] = -2; promoted = true; checkAchievements('promote', { player: -1 }); playSound('promote'); }

    lastMove = { fr, fc, tr, tc };
    hintMove = null;

    // Multi-jump continuation
    if (isCapture && !promoted) {
        const further = getValidMoves(currentTurn, { r: tr, c: tc }).filter(m => {
            const sR2=(m.tr-m.fr)===0?0:((m.tr-m.fr)>0?1:-1);
            const sC2=(m.tc-m.fc)===0?0:((m.tc-m.fc)>0?1:-1);
            const d2=Math.max(Math.abs(m.tr-m.fr),Math.abs(m.tc-m.fc));
            for (let i=1;i<d2;i++) if(board[m.fr+i*sR2][m.fc+i*sC2]!==0) return true;
            return false;
        });
        if (further.length > 0) {
            activePiece = { r: tr, c: tc };
            renderBoard();
            if (currentTurn === 1 && gameState.gameMode === 'vsAI') {
                const token = ++turnToken;
                setTimeout(() => {
                if (token === turnToken && !isGameOver) {
                    calculateAIMove(activePiece).then(move => {
                        if (move && token === turnToken && !isGameOver)
                            makeMove(move.fr, move.fc, move.tr, move.tc);
                    });
                }
            }, 1200);
            }
            return;
        }
    }

    activePiece = null;
    currentTurn *= -1;
    renderBoard();

    const aiMoves     = getValidMoves(1);
    const playerMoves = getValidMoves(-1);

    if (playerMoves.length === 0 && aiMoves.length === 0) {
        endGame('draw');
    } else if (playerMoves.length === 0) {
        endGame('ai-wins');
    } else if (aiMoves.length === 0) {
        endGame('player-wins');
    } else {
        if (currentTurn === 1 && gameState.gameMode === 'vsAI') {
            isAiThinking = true;
            updateStatus('AI is thinking...', '#e74c3c');
            const token = ++turnToken;
            setTimeout(() => {
                if (token === turnToken && !isGameOver) {
                    calculateAIMove(activePiece).then(move => {
                        if (move && token === turnToken && !isGameOver) {
                            isAiThinking = false;
                            makeMove(move.fr, move.fc, move.tr, move.tc);
                        }
                    });
                }
            }, 1500);
        } else {
            isAiThinking = false;
            const label = 'Your Turn';
            updateStatus(label, '#2ecc71');
        }
    }
    toggleUndoButton();
}

// --- Game Over ----------------------------------------------------------------
function endGame(result) {
    isAiThinking = false;
    isGameOver   = true;

    const s = gameState.stats;

    if (result === 'player-wins') {
        s.streak++;
        if (s.streak > s.bestStreak) s.bestStreak = s.streak;
        s.wins['ai'] = (s.wins['ai'] || 0) + 1;
        gameState.coins += 50 + (s.streak > 1 ? (s.streak - 1) * 10 : 0);
        saveState();
        updateCoinDisplays();
        const bonus = s.streak > 1 ? ` (+${(s.streak-1)*10} streak bonus)` : '';
        updateStatus(`trophy You Win! +50G${bonus}`, '#2ecc71');
        playSound('win');
        showGameOver('win');
        checkAchievements('win', { mode: gameState.gameMode });
        if (isDailyGame && gameState.daily.date !== todayStr()) {
            gameState.daily = { date: todayStr(), completed: true };
            gameState.coins += 100;
            saveState();
            updateCoinDisplays();
            updateStatus('trophy Daily Complete! +150G total', '#f39c12');
            checkAchievements('daily');
            updateDailyButton();
        }
    } else if (result === 'ai-wins') {
        s.streak = 0;
        s.losses['ai'] = (s.losses['ai'] || 0) + 1;
        saveState();
        updateStatus('AI Wins. Better luck next time!', '#e74c3c');
        playSound('lose');
        showGameOver('lose');
    } else if (result === 'draw') {
        s.draws['ai'] = (s.draws['ai'] || 0) + 1;
        saveState();
        updateStatus('Draw -- well matched!', '#f1c40f');
        showGameOver('draw');
    } else if (result === 'p1wins') {
        s.wins['2player'] = (s.wins['2player'] || 0) + 1;
        saveState();
        updateStatus('trophy Player 1 Wins!', '#2ecc71');
        playSound('win');
        checkAchievements('win', { mode: '2player' });
        showGameOver('win');
    } else if (result === 'p2wins') {
        saveState();
        updateStatus('trophy Player 2 Wins!', '#3498db');
        playSound('win');
        showGameOver('win');
    }

    isDailyGame = false;
}

export function playAgain() {
    hideGameOver();
    const btn = document.getElementById('play-again-btn');
    if (btn)  btn.style.display = 'none';
    resetGame();
}

bootApp();
