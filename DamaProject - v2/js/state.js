// ─── Helpers ────────────────────────────────────────────────────────────────
function load(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
}

// ─── Shared Application State ───────────────────────────────────────────────
export const gameState = {
    coins:         load('dama_coins', 0),
    unlockedItems: load('dama_items', ['board-classic', 'piece-classic']),
    gameMode:      load('dama_gameMode', 'vsAI'),   // 'vsAI' | '2player'
    soundEnabled:  load('dama_sound',    true),

    stats: load('dama_stats', {
        wins:       { ai: 0, '2player': 0 },
        losses:     { ai: 0 },
        draws:      { ai: 0 },
        streak:     0,
        bestStreak: 0,
        totalMoves: 0,
    }),

    achievements: load('dama_achievements', []),
    daily:        load('dama_daily', { date: '', completed: false }),
};

export function saveState() {
    localStorage.setItem('dama_coins',       JSON.stringify(gameState.coins));
    localStorage.setItem('dama_items',       JSON.stringify(gameState.unlockedItems));
    localStorage.setItem('dama_gameMode',    JSON.stringify(gameState.gameMode));
    localStorage.setItem('dama_sound',       JSON.stringify(gameState.soundEnabled));
    localStorage.setItem('dama_stats',       JSON.stringify(gameState.stats));
    localStorage.setItem('dama_achievements',JSON.stringify(gameState.achievements));
    localStorage.setItem('dama_daily',       JSON.stringify(gameState.daily));
}

// ─── Achievement Catalogue ───────────────────────────────────────────────────
export const ACHIEVEMENTS = {
    'first-capture': { name: 'First Blood',   desc: 'Make your first capture',           icon: 'bi-sword'                  },
    'first-king':    { name: 'King Me!',       desc: 'Promote a piece to king',           icon: 'bi-award-fill'             },
    'win-easy':      { name: 'AI Slayer',      desc: 'Beat the AI',                       icon: 'bi-patch-check'            },
    'streak-3':      { name: 'Hot Streak',     desc: 'Win 3 games in a row',              icon: 'bi-fire'                   },
    'streak-5':      { name: 'Unstoppable',    desc: 'Win 5 games in a row',              icon: 'bi-lightning-fill'         },
    'flawless':      { name: 'Flawless',       desc: 'Win without losing a single piece', icon: 'bi-gem'                   },
    'daily-done':    { name: 'Daily Grind',    desc: 'Complete a daily challenge',        icon: 'bi-calendar-check-fill'    },
    'speed-win':     { name: 'Speed Demon',    desc: 'Win in under 25 total moves',       icon: 'bi-speedometer2'           },
    '2p-winner':     { name: 'Local Legend',   desc: 'Win a local 2-player match',        icon: 'bi-people-fill'            },
    'comeback':      { name: 'The Comeback',   desc: 'Win after trailing by 8+ pieces',  icon: 'bi-arrow-counterclockwise' },
};
