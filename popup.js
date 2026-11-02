const getStore = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));
const setStore = (obj) => new Promise((res) => chrome.storage.local.set(obj, res));

let currentTab = null;
let currentPageKey = null;

function $(id) { return document.getElementById(id); }

async function getActiveTab() {
  return new Promise((res) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => res(tabs[0]));
  });
}

function sendToContent(msg) {
  return new Promise((res) => {
    chrome.tabs.sendMessage(currentTab.id, msg, (resp) => {
      if (chrome.runtime.lastError) {
        res(null); // content script not present (e.g. tab open before install) — caller handles null
      } else {
        res(resp);
      }
    });
  });
}

async function refreshCredList() {
  const { credentials = [] } = await getStore("credentials");
  const mine = credentials.filter((c) => c.pageKey === currentPageKey);
  const list = $("cred-list");
  list.innerHTML = "";
  if (mine.length === 0) {
    list.innerHTML = '<div class="empty">No logins saved for this page yet.</div>';
    return;
  }
  mine.forEach((c) => {
    const item = document.createElement("div");
    item.className = "cred-item";
    item.innerHTML = `
      <div class="meta">
        <div class="label">${escapeHtml(c.label || c.workspace || c.username)}</div>
        <div class="sub">${escapeHtml(c.username)}${c.workspace ? " · " + escapeHtml(c.workspace) : ""}</div>
      </div>
      <div class="actions">
        <button class="fill">Fill</button>
        <button class="danger delete">Delete</button>
      </div>
    `;
    item.querySelector(".fill").addEventListener("click", async () => {
      await sendToContent({ type: "AWLM_FILL_NOW", credential: c });
      window.close();
    });
    item.querySelector(".delete").addEventListener("click", async () => {
      const { credentials: all = [] } = await getStore("credentials");
      await setStore({ credentials: all.filter((x) => x.id !== c.id) });
      refreshCredList();
      refreshAllList();
    });
    list.appendChild(item);
  });
}

async function refreshAllList() {
  const { credentials = [] } = await getStore("credentials");
  const list = $("all-list");
  list.innerHTML = "";
  if (credentials.length === 0) {
    list.innerHTML = '<div class="empty">No logins saved yet.</div>';
    return;
  }
  credentials.forEach((c) => {
    const item = document.createElement("div");
    item.className = "cred-item";
    item.innerHTML = `
      <div class="meta">
        <div class="label">${escapeHtml(c.label || c.workspace || c.username)}</div>
        <div class="sub">${escapeHtml(c.pageKey)}</div>
      </div>
      <div class="actions">
        <button class="danger delete">Delete</button>
      </div>
    `;
    item.querySelector(".delete").addEventListener("click", async () => {
      const { credentials: all = [] } = await getStore("credentials");
      await setStore({ credentials: all.filter((x) => x.id !== c.id) });
      refreshCredList();
      refreshAllList();
    });
    list.appendChild(item);
  });
}

async function refreshMapping() {
  const { pageMaps = {} } = await getStore("pageMaps");
  const map = pageMaps[currentPageKey] || {};
  $("map-workspace").textContent = map.workspace || "not set";
  $("map-username").textContent = map.username || "not set";
  $("map-password").textContent = map.password || "not set";
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function init() {
  currentTab = await getActiveTab();
  if (!currentTab || !/^https?:/.test(currentTab.url || "")) {
    $("host-label").textContent = "Not available on this page";
    document.querySelectorAll(".section button").forEach((b) => (b.disabled = true));
    return;
  }
  const resp = await sendToContent({ type: "AWLM_GET_PAGE_KEY" });
  if (!resp) {
    $("host-label").textContent = "Reload this tab to activate the extension here";
  }
  currentPageKey = (resp && resp.pageKey) || currentTab.url.split("#")[0].split("?")[0];
  if (resp) $("host-label").textContent = currentPageKey;

  await refreshCredList();
  await refreshAllList();
  await refreshMapping();

  $("btn-capture").addEventListener("click", async () => {
    const resp = await sendToContent({ type: "AWLM_GET_PAGE_FIELDS" });
    if (resp && resp.values) {
      $("f-username").value = resp.values.username || "";
      $("f-password").value = resp.values.password || "";
      $("f-workspace").value = resp.values.workspace || "";
    } else {
      alert("Couldn't detect login fields on this page automatically. Try Field mapping below.");
    }
  });

  $("btn-save").addEventListener("click", async () => {
    const username = $("f-username").value.trim();
    const password = $("f-password").value;
    const workspace = $("f-workspace").value.trim();
    const label = $("f-label").value.trim();
    if (!username || !password) {
      alert("Username and password are required.");
      return;
    }
    const { credentials = [] } = await getStore("credentials");
    credentials.push({
      id: `${Date.now()}`,
      pageKey: currentPageKey,
      label,
      workspace,
      username,
      password,
      createdAt: Date.now(),
    });
    await setStore({ credentials });
    $("f-label").value = "";
    $("f-workspace").value = "";
    $("f-username").value = "";
    $("f-password").value = "";
    refreshCredList();
    refreshAllList();
  });

  $("mapping-toggle").addEventListener("click", () => {
    $("mapping-body").classList.toggle("hidden");
  });

  $("all-toggle").addEventListener("click", () => {
    $("all-list").classList.toggle("hidden");
  });

  document.querySelectorAll("button.pick").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const kind = btn.dataset.kind;
      btn.textContent = "Click field...";
      await sendToContent({ type: "AWLM_START_PICKER", kind });
      window.close();
    });
  });
}

init();
