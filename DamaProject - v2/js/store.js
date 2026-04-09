import { gameState, saveState } from './state.js';
import { updateCoinDisplays } from './ui.js';

// --- Item Catalogue ---------------------------------------------------------
export const STORE_ITEMS = {
    board: [
        { id: 'board-classic', name: 'Classic Wood',  cost: 0,   preview: ['#f0d9b5','#b58863'], img: ['assets/wood_light_texter.jpg','assets/wood_dark_texter.jpg'],        desc: 'Timeless wooden board'      },
        { id: 'board-marble',  name: 'Marble',        cost: 50,  preview: ['#e8e9eb','#4a4a55'], img: ['assets/marbel_light_texter.png','assets/marbel_dark_texter.jpg'], desc: 'Cool stone finish'           },
        { id: 'board-desert',  name: 'Desert Sand',   cost: 75,  preview: ['#f5e0b0','#c8933a'], desc: 'Warm Saharan tones'          },
        { id: 'board-ocean',   name: 'Ocean Blue',    cost: 125, preview: ['#d6eaf8','#1a6090'], desc: 'Deep Atlantic vibes'         },
        { id: 'board-neon',    name: 'Neon Night',    cost: 150, preview: ['#1e1e2e','#0a0a14'], desc: 'Glowing dark arcade style', border: '#ff007f' },
    ],
    piece: [
        // playerColor = YOUR piece (.piece.red)  |  AI is always fixed cream
        { id: 'piece-classic',       name: 'Standard',  cost: 0,   playerColor: '#c0392b',                                         desc: 'Clean and classic' },
        { id: 'piece-gold',          name: 'Gold',       cost: 75,  playerColor: '#c8960a',                                         desc: 'For champions'     },
        { id: 'piece-emerald',       name: 'Emerald',    cost: 100, playerColor: '#1e8449',                                         desc: 'Rich jewel tone'   },
        { id: 'piece-fire',          name: 'Fire',       cost: 125, playerColor: '#c0520a',                                         desc: 'Burning hot'       },
        { id: 'piece-hologram',      name: 'Hologram',   cost: 150, playerColor: '#00cccc',                                         desc: 'Sci-fi shimmer'    },
        { id: 'piece-fire-skin',     name: 'Inferno',    cost: 175, playerColor: '#8b1a00', playerImg: 'assets/fire_Skin.jpg',      desc: 'Lava texture'      },
        { id: 'piece-icecream-skin', name: 'Ice Cream',  cost: 175, playerColor: '#c05a80', playerImg: 'assets/Ice_Cream_Skin.jpg', desc: 'Sweet & soft'      },
        { id: 'piece-ice-skin',      name: 'Frozen',     cost: 200, playerColor: '#0a3a5a', playerImg: 'assets/Ice_Skin.jpg',       desc: 'Arctic chill'      },
    ],
};

// --- Buy / Equip Logic ------------------------------------------------------
export function buyItem(category, itemId, cost) {
    if (gameState.unlockedItems.includes(itemId)) {
        equipItem(category, itemId);
        return;
    }
    if (gameState.coins >= cost) {
        gameState.coins -= cost;
        gameState.unlockedItems.push(itemId);
        saveState();
        updateCoinDisplays();
        equipItem(category, itemId);
        renderStore();
        showStoreToast('Unlocked: ' + STORE_ITEMS[category].find(i => i.id === itemId).name + '!', 'success');
    } else {
        showStoreToast('Need ' + (cost - gameState.coins) + ' more coins!', 'error');
    }
}

export function equipItem(category, itemId) {
    localStorage.setItem('dama_equipped_' + category, itemId);
    applyEquippedItems();
    renderStore();
}

export function applyEquippedItems() {
    var board = localStorage.getItem('dama_equipped_board') || 'board-classic';
    var piece = localStorage.getItem('dama_equipped_piece') || 'piece-classic';
    document.body.className = board + ' ' + piece;
}

// --- Store Renderer ---------------------------------------------------------
export function renderStore() {
    var activeTab = document.querySelector('.store-tab.active');
    renderStoreTab(activeTab ? activeTab.dataset.tab : 'board');
}

export function renderStoreTab(category) {
    document.querySelectorAll('.store-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === category);
    });

    var grid = document.getElementById('store-grid');
    if (!grid) return;

    var equippedBoard = localStorage.getItem('dama_equipped_board') || 'board-classic';
    var equippedPiece = localStorage.getItem('dama_equipped_piece') || 'piece-classic';
    var equipped = category === 'board' ? equippedBoard : equippedPiece;

    grid.innerHTML = '';

    STORE_ITEMS[category].forEach(function(item) {
        var owned      = gameState.unlockedItems.includes(item.id);
        var isEquipped = item.id === equipped;

        var card = document.createElement('div');
        card.className = 'store-card' + (isEquipped ? ' equipped' : '') + (owned ? ' owned' : ' locked');

        // Colour swatch
        var preview = document.createElement('div');
        preview.className = 'card-preview';
        if (category === 'piece') {
            // Left = YOUR piece (red/player), Right = AI (always fixed cream)
            var pStyle = item.playerImg
                ? 'background:' + item.playerColor + ';background-image:url(' + item.playerImg + ');background-size:cover;background-position:center'
                : 'background:' + item.playerColor;
            preview.innerHTML =
                '<div class="preview-half preview-player" style="' + pStyle + '">' +
                    '<span class="preview-label">You</span>' +
                '</div>' +
                '<div class="preview-half preview-ai" style="background:#c8bfb0">' +
                    '<span class="preview-label">AI</span>' +
                '</div>';
        } else {
            var h0 = item.img
                ? 'background:' + item.preview[0] + ';background-image:url(' + item.img[0] + ');background-size:cover;background-position:center'
                : 'background:' + item.preview[0];
            var h1 = item.img
                ? 'background:' + item.preview[1] + ';background-image:url(' + item.img[1] + ');background-size:cover;background-position:center'
                : 'background:' + item.preview[1];
            preview.innerHTML =
                '<div class="preview-half" style="' + h0 + '"></div>' +
                '<div class="preview-half" style="' + h1 + '"></div>' +
                (item.border ? '<div class="preview-border-flash" style="border-color:' + item.border + '"></div>' : '');
        }

        // Badge
        var badge = '';
        if (isEquipped) {
            badge = '<span class="card-badge badge-equipped">Equipped</span>';
        } else if (owned) {
            badge = '<span class="card-badge badge-owned">Owned</span>';
        } else {
            badge = '<span class="card-badge badge-price"><img src="assets/Coin.png" class="badge-coin"> ' + item.cost + '</span>';
        }

        // Body
        var body = document.createElement('div');
        body.className = 'card-body';
        body.innerHTML = badge +
            '<div class="card-name">' + item.name + '</div>' +
            '<div class="card-desc">' + item.desc + '</div>';

        // Button
        var btn = document.createElement('button');
        if (isEquipped) {
            btn.className   = 'btn card-btn btn-equipped';
            btn.disabled    = true;
            btn.textContent = 'In Use';
        } else if (owned) {
            btn.className   = 'btn card-btn btn-equip';
            btn.textContent = 'Equip';
        } else {
            btn.className   = 'btn card-btn btn-buy';
            btn.textContent = 'Buy ' + item.cost + ' G';
        }
        btn.onclick = (function(cat, id, c) {
            return function() { buyItem(cat, id, c); };
        })(category, item.id, item.cost);

        card.appendChild(preview);
        card.appendChild(body);
        card.appendChild(btn);
        grid.appendChild(card);
    });
}

// --- Toast ------------------------------------------------------------------
function showStoreToast(message, type) {
    var toast = document.getElementById('store-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'store-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className   = 'store-toast store-toast-' + type + ' store-toast-show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() {
        toast.classList.remove('store-toast-show');
    }, 2500);
}
