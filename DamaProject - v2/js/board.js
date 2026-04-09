import {
    board, currentTurn, isAiThinking, activePiece, isGameOver,
    hintMove, lastMove, moveLog, getValidMoves, attemptPlayerMove
} from './main.js';
import { gameState } from './state.js';

let selected = null;

export function clearSelection() { selected = null; }

export function renderBoard() {
    var container = document.getElementById('game-board');
    if (!container) return;
    container.innerHTML = '';

    if (currentTurn === 1 && gameState.gameMode === 'vsAI') selected = null;

    var validMoves  = getValidMoves(currentTurn, activePiece);
    var validStarts = {};
    validMoves.forEach(function(m) { validStarts[m.fr + ',' + m.fc] = true; });

    var isHintFrom = hintMove ? hintMove.fr + ',' + hintMove.fc : null;
    var isHintTo   = hintMove ? hintMove.tr + ',' + hintMove.tc : null;
    var isLastFrom = lastMove ? lastMove.fr + ',' + lastMove.fc : null;
    var isLastTo   = lastMove ? lastMove.tr + ',' + lastMove.tc : null;

    for (var r = 0; r < 8; r++) {
        for (var c = 0; c < 8; c++) {
            var cell = document.createElement('div');
            var key  = r + ',' + c;

            var sqClass = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            if (key === isLastFrom) sqClass += ' trail-from';
            if (key === isLastTo)   sqClass += ' trail-to';
            if (key === isHintTo)   sqClass += ' hint-dest';
            cell.className = sqClass;

            var pVal = board[r][c];

            if (pVal !== 0) {
                var piece = document.createElement('div');
                var pClass = 'piece ' + (pVal > 0 ? 'white' : 'red');
                if (Math.abs(pVal) === 2) pClass += ' king';
                if (lastMove && lastMove.tr === r && lastMove.tc === c) pClass += ' piece-land';
                piece.className = pClass;

                if (selected && selected.r === r && selected.c === c)
                    piece.classList.add('selected-piece');
                if (activePiece && activePiece.r === r && activePiece.c === c)
                    piece.classList.add('active-multijump');
                if (key === isHintFrom)
                    piece.classList.add('hint-source');

                // Use closure for click handler
                (function(row, col, pv, vs, vm) {
                    piece.onclick = function() { handlePieceClick(row, col, pv, vs, vm); };
                })(r, c, pVal, validStarts, validMoves);

                cell.appendChild(piece);
            } else if (selected) {
                var isValidDest = validMoves.some(function(m) {
                    return m.fr === selected.r && m.fc === selected.c && m.tr === r && m.tc === c;
                });
                if (isValidDest) {
                    // Detect if this is a capture move (for capture-dest colour)
                    var isCapDest = validMoves.some(function(m) {
                        return m.fr === selected.r && m.fc === selected.c &&
                               m.tr === r && m.tc === c &&
                               Math.abs(m.tr - m.fr) >= 2;
                    });
                    cell.classList.add('valid-dest');
                    if (isCapDest) cell.classList.add('capture-dest');
                    (function(row, col) {
                        cell.onclick = function() {
                            var fromR = selected.r, fromC = selected.c;
                            selected = null;
                            attemptPlayerMove(fromR, fromC, row, col);
                        };
                    })(r, c);
                } else {
                    cell.onclick = function() { selected = null; renderBoard(); };
                }
            }

            container.appendChild(cell);
        }
    }

    updateScoreboard();
    renderMoveLog();
}

function handlePieceClick(r, c, pVal, validStarts, validMoves) {
    if (isGameOver || (isAiThinking && gameState.gameMode === 'vsAI')) return;

    if (gameState.gameMode === 'vsAI' && (currentTurn !== -1 || pVal >= 0)) return;

    if (gameState.gameMode === '2player') {
        var isP1Turn  = currentTurn === -1;
        var isP1Piece = pVal < 0;
        if (isP1Turn !== isP1Piece) return;
    }

    if (validStarts[r + ',' + c]) {
        selected = { r: r, c: c, piece: pVal };
    } else {
        selected = null;
    }
    renderBoard();
}

export function updateScoreboard() {
    var ai = 0, player = 0;
    for (var r = 0; r < 8; r++)
        for (var c = 0; c < 8; c++) {
            if (board[r][c] > 0) ai++;
            else if (board[r][c] < 0) player++;
        }
    var aiEl     = document.getElementById('ai-score');
    var playerEl = document.getElementById('player-score');
    if (aiEl)     aiEl.textContent     = ai;
    if (playerEl) playerEl.textContent = player;
}

export function updateStatus(message, color) {
    var el = document.getElementById('turn-indicator');
    if (!el) return;
    el.textContent = message;
    el.style.color = color || '';
    // Reflect status in background tint
    if (color === '#2ecc71') {
        el.style.background = 'rgba(46,204,113,0.12)';
        el.style.borderColor = 'rgba(46,204,113,0.3)';
    } else if (color === '#e74c3c') {
        el.style.background = 'rgba(231,76,60,0.12)';
        el.style.borderColor = 'rgba(231,76,60,0.3)';
    } else if (color === '#f39c12' || color === '#f1c40f') {
        el.style.background = 'rgba(241,196,15,0.12)';
        el.style.borderColor = 'rgba(241,196,15,0.3)';
    } else {
        el.style.background = '';
        el.style.borderColor = '';
    }
}

function renderMoveLog() {
    var log = document.getElementById('move-log-list');
    if (!log) return;
    log.innerHTML = '';

    var entries = moveLog.slice(-20).reverse();
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var li = document.createElement('li');
        li.className = entry.isCapture ? 'log-capture' : 'log-move';
        var side = entry.turn === -1 ? '[P]' : '[A]';
        li.textContent = side + ' ' + entry.num + '. ' + entry.notation;
        log.appendChild(li);
    }
}
