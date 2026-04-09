import { gameState, saveState, ACHIEVEMENTS } from './state.js';

// --- Coin Displays ---------------------------------------------------------
export function updateCoinDisplays() {
    const val = gameState.coins;
    ['menu-coins','game-coins','store-coins','leaderboard-coins'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });
}

// --- Screen Routing --------------------------------------------------------
export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    const target = document.getElementById(screenId);
    if (!target) { console.error(`showScreen: no element "${screenId}"`); return; }
    target.classList.remove('hidden');
    target.classList.add('active');
}

// --- Web Audio Sounds ------------------------------------------------------
let _ctx = null;
function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
}

function tone(freq, type, duration, gain = 0.3, delay = 0) {
    if (!gameState.soundEnabled) return;
    try {
        const ac  = ctx();
        const osc = ac.createOscillator();
        const env = ac.createGain();
        osc.connect(env);
        env.connect(ac.destination);
        osc.type      = type;
        osc.frequency.value = freq;
        env.gain.setValueAtTime(gain, ac.currentTime + delay);
        env.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
        osc.start(ac.currentTime + delay);
        osc.stop(ac.currentTime  + delay + duration + 0.05);
    } catch { /* AudioContext may be blocked before user gesture */ }
}

export function playSound(type) {
    if (!gameState.soundEnabled) return;
    switch (type) {
        case 'move':    tone(440, 'sine',   0.08, 0.15); break;
        case 'capture': tone(280, 'square', 0.12, 0.2); tone(220,'square',0.1,0.15,0.1); break;
        case 'promote': [523,659,784].forEach((f,i) => tone(f,'sine',0.15,0.25,i*0.1)); break;
        case 'hint':    tone(880, 'sine',   0.2,  0.2); break;
        case 'undo':    [440,330].forEach((f,i) => tone(f,'sine',0.1,0.15,i*0.08)); break;
        case 'win':
            [523,659,784,1047].forEach((f,i) => tone(f,'sine',0.3,0.3,i*0.12));
            break;
        case 'lose':
            [440,370,330,220].forEach((f,i) => tone(f,'triangle',0.2,0.2,i*0.1));
            break;
    }
}

// --- Sound Toggle ----------------------------------------------------------
export function toggleSound() {
    gameState.soundEnabled = !gameState.soundEnabled;
    saveState();
    const btn = document.getElementById('sound-btn');
    if (btn) btn.innerHTML = gameState.soundEnabled
        ? '<i class="bi bi-volume-up-fill"></i>'
        : '<i class="bi bi-volume-mute-fill"></i>';
}
// Expose for HTML
window.toggleSound = toggleSound;

// --- Achievement Toast -----------------------------------------------------
export function showAchievement(ach) {
    const container = document.getElementById('achievement-container');
    if (!container || !ach) return;

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
        <span class="ach-icon"><i class="bi ${ach.icon}"></i></span>
        <div class="ach-text">
            <strong>Achievement Unlocked!</strong>
            <span>${ach.name}: ${ach.desc}</span>
        </div>`;
    container.appendChild(toast);
    playSound('promote');

    // Animate out and remove
    setTimeout(() => toast.classList.add('toast-exit'), 2800);
    setTimeout(() => toast.remove(), 3300);
}

// --- Game Over Overlay ----------------------------------------------------
export function showGameOver(result) {
    // result: 'win' | 'lose' | 'draw'
    const overlay = document.getElementById('gameover-overlay');
    const img     = document.getElementById('gameover-img');
    if (!overlay || !img) return;

    if (result === 'win') {
        img.src = 'assets/Win.png';
        img.alt = 'You Win!';
    } else if (result === 'lose') {
        img.src = 'assets/Lose.png';
        img.alt = 'You Lose!';
    } else {
        // draw -- reuse lose banner, player can dismiss
        img.src = 'assets/Lose.png';
        img.alt = 'Draw!';
        img.style.opacity = '0.6';
    }

    overlay.classList.remove('hidden');
}

export function hideGameOver() {
    const overlay = document.getElementById('gameover-overlay');
    if (overlay) overlay.classList.add('hidden');
    const img = document.getElementById('gameover-img');
    if (img) img.style.opacity = '';
}

// --- Leaderboard Screen ----------------------------------------------------
export function renderLeaderboard() {
    const el = document.getElementById('leaderboard-content');
    if (!el) return;

    const s = gameState.stats;

    const w  = s.wins['ai']   || 0;
    const l  = s.losses['ai'] || 0;
    const dr = s.draws['ai']  || 0;
    const w2 = s.wins['2player'] || 0;
    const pct = (w + l + dr) > 0 ? Math.round(w / (w+l+dr) * 100) : 0;

    el.innerHTML = `
        <div class="lb-summary">
            <div class="lb-stat"><span>${w + w2}</span>Wins</div>
            <div class="lb-stat"><span>${s.streak}</span>Streak</div>
            <div class="lb-stat"><span>${s.bestStreak}</span>Best</div>
            <div class="lb-stat"><span>${l}</span>Losses</div>
        </div>
        <table class="lb-table">
            <thead><tr><th>Mode</th><th>W</th><th>L</th><th>D</th><th>Win %</th></tr></thead>
            <tbody>
                <tr>
                    <td class="lb-diff lb-medium">vs AI</td>
                    <td>${w}</td><td>${l}</td><td>${dr}</td>
                    <td class="lb-pct">${pct}%</td>
                </tr>
                <tr>
                    <td class="lb-diff lb-easy">2 Player</td>
                    <td>${w2}</td><td>—</td><td>—</td>
                    <td class="lb-pct">—</td>
                </tr>
            </tbody>
        </table>
        <p class="lb-footer">Total moves played: <strong>${s.totalMoves}</strong></p>
    `;
}

// --- Achievements Screen ---------------------------------------------------
export function renderAchievements() {
    const el = document.getElementById('achievements-content');
    if (!el) return;

    const unlocked = new Set(gameState.achievements);
    el.innerHTML = Object.entries(ACHIEVEMENTS).map(([id, ach]) => {
        const done = unlocked.has(id);
        return `<div class="ach-card ${done ? 'ach-done' : 'ach-locked'}">
            <span class="ach-icon-big">${done
                ? `<i class="bi ${ach.icon}"></i>`
                : `<i class="bi bi-lock-fill"></i>`
            }</span>
            <div class="ach-info">
                <strong>${ach.name}</strong>
                <span>${ach.desc}</span>
            </div>
        </div>`;
    }).join('');
}
