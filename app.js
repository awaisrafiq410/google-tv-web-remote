// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.error('SW Registration Failed', err));
    });
}

let selectedIp = null;

// UI Elements
const setupCard = document.getElementById('setup-card');
const remoteCard = document.getElementById('remote-card');
const deviceList = document.getElementById('device-list');
const refreshBtn = document.getElementById('refresh-btn');
const noDevices = document.getElementById('no-devices');
const pairingOverlay = document.getElementById('pairing-overlay');
const pinInput = document.getElementById('pin-input');
const submitPinBtn = document.getElementById('submit-pin');
const keyboardInput = document.getElementById('keyboard-input');

if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// Discovery
async function discoverDevices() {
    noDevices.textContent = "Scanning...";
    deviceList.querySelectorAll('.device-item').forEach(el => el.remove());
    
    try {
        const response = await fetch('/discover');
        const tvs = await response.json();
        
        if (tvs.length === 0) {
            noDevices.textContent = "No TVs found on your network.";
            noDevices.classList.remove('hidden');
        } else {
            noDevices.classList.add('hidden');
            tvs.forEach(tv => {
                const li = document.createElement('li');
                li.className = 'device-item';
                li.innerHTML = `
                    <div class="device-info">
                        <h3>${tv.name}</h3>
                        <p>${tv.ip}</p>
                    </div>
                    <span>Connect</span>
                `;
                li.onclick = () => handleConnect(tv.ip);
                deviceList.appendChild(li);
            });
            lucide.createIcons();
        }
    } catch (err) {
        console.error("Discovery failed", err);
        noDevices.textContent = "Error scanning for devices.";
    }
}

async function handleConnect(ip) {
    selectedIp = ip;
    localStorage.setItem('last_tv_ip', ip);
    try {
        const response = await fetch('/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const result = await response.json();
        
        if (result.status === 'connected') {
            setupCard.classList.add('hidden');
            remoteCard.classList.remove('hidden');
        } else if (result.status === 'pairing_needed') {
            initiatePairing(ip);
        } else {
            alert("Connection error. Ensure your TV is on and reachable.");
        }
    } catch (err) {
        console.error("Connect failed", err);
    }
}

// Pairing
async function initiatePairing(ip) {
    selectedIp = ip;
    try {
        const response = await fetch('/pair/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const result = await response.json();
        pairingOverlay.classList.remove('hidden');
    } catch (err) {
        alert("Failed to start pairing: " + err);
    }
}

async function finishPairing() {
    const code = pinInput.value;
    if (!code) return;
    
    try {
        const response = await fetch('/pair/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: selectedIp, code })
        });
        
        if (response.ok) {
            pairingOverlay.classList.add('hidden');
            setupCard.classList.add('hidden');
            remoteCard.classList.remove('hidden');
        } else {
            const err = await response.json();
            alert("Pairing failed: " + err.detail);
        }
    } catch (err) {
        alert("Error finishing pairing: " + err);
    }
}

// Commands
async function sendCommand(command, options = {}) {
    if (!selectedIp) return;
    
    try {
        await fetch('/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ip: selectedIp,
                command: command,
                ...options
            })
        });
    } catch (err) {
        console.error("Command failed", err);
    }
}

// Event Listeners
refreshBtn.onclick = discoverDevices;

submitPinBtn.onclick = finishPairing;

document.getElementById('cancel-pairing').onclick = () => {
    pairingOverlay.classList.add('hidden');
};

// Remote Buttons
// Handle remote buttons with repeat support
let repeatInterval = null;

function startRepeat(cmd) {
    if (repeatInterval) return;
    sendCommand(cmd);
    repeatInterval = setInterval(() => sendCommand(cmd), 250);
}

function stopRepeat() {
    if (repeatInterval) {
        clearInterval(repeatInterval);
        repeatInterval = null;
    }
}

document.querySelectorAll('.btn-remote, .btn-nav, .btn-media, .btn-dpad').forEach(btn => {
    const cmd = btn.dataset.command;
    if (!cmd) return;

    btn.addEventListener('mousedown', () => startRepeat(cmd));
    btn.addEventListener('mouseup', stopRepeat);
    btn.addEventListener('mouseleave', stopRepeat);
    
    // Touch support
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRepeat(cmd);
    });
    btn.addEventListener('touchend', stopRepeat);
});

// Keyboard mapping
const KEY_MAP = {
    'ArrowUp': 'DPAD_UP',
    'ArrowDown': 'DPAD_DOWN',
    'ArrowLeft': 'DPAD_LEFT',
    'ArrowRight': 'DPAD_RIGHT',
    'Enter': 'DPAD_CENTER',
    'Escape': 'BACK',
    'Backspace': 'BACK',
    'Home': 'HOME',
    ' ': 'MEDIA_PLAY_PAUSE',
    'm': 'MUTE',
    'M': 'MUTE'
};

document.addEventListener('keydown', (e) => {
    // If user is typing in the input, don't trigger remote shortcuts
    if (e.target.tagName === 'INPUT') {
        if (e.key === 'Enter') {
            const text = e.target.value;
            if (text) {
                sendCommand(text, { is_text: true });
                e.target.value = '';
            }
        }
        return;
    }

    const command = KEY_MAP[e.key];
    if (command) {
        e.preventDefault();
        sendCommand(command);
    }
});

// App Launchers
document.querySelectorAll('[data-app]').forEach(btn => {
    btn.onclick = () => sendCommand(btn.dataset.app, { is_app: true });
});

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('tab-disabled')) return;
        
        const tabId = btn.dataset.tab;
        
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });
});

// Settings / Switch Device
document.getElementById('settings-btn').onclick = () => {
    selectedIp = null;
    localStorage.removeItem('last_tv_ip');
    remoteCard.classList.add('hidden');
    setupCard.classList.remove('hidden');
    discoverDevices();
};

// Auto-Connect on load
window.addEventListener('load', () => {
    const savedIp = localStorage.getItem('last_tv_ip');
    if (savedIp) {
        console.log("Auto-connecting to:", savedIp);
        handleConnect(savedIp);
    } else {
        discoverDevices();
    }
});
