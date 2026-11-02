(() => {
  const PAGE_KEY = location.origin + location.pathname;

  // ---------- storage helpers ----------
  const getStore = (keys) => new Promise((res) => chrome.storage.local.get(keys, res));
  const setStore = (obj) => new Promise((res) => chrome.storage.local.set(obj, res));

  async function getPageMap() {
    const { pageMaps = {} } = await getStore("pageMaps");
    return pageMaps[PAGE_KEY] || null;
  }

  async function savePageMap(map) {
    const { pageMaps = {} } = await getStore("pageMaps");
    pageMaps[PAGE_KEY] = { ...(pageMaps[PAGE_KEY] || {}), ...map };
    await setStore({ pageMaps });
  }

  async function getCredentialsForPage() {
    const { credentials = [] } = await getStore("credentials");
    return credentials.filter((c) => c.pageKey === PAGE_KEY);
  }

  async function saveCredential(cred) {
    const { credentials = [] } = await getStore("credentials");
    credentials.push(cred);
    await setStore({ credentials });
  }

  // ---------- field detection ----------
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function scoreMatch(el, patterns) {
    const hay = [el.id, el.name, el.placeholder, el.getAttribute("aria-label")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return patterns.some((p) => hay.includes(p));
  }

  function autoDetectFields() {
    const inputs = Array.from(document.querySelectorAll("input")).filter(isVisible);
    const passwordEl = inputs.find((el) => el.type === "password");
    if (!passwordEl) return null;

    const textLike = inputs.filter((el) => ["text", "email", ""].includes(el.type));

    const usernameEl =
      textLike.find((el) => scoreMatch(el, ["username", "user_name", "userid", "email", "p_username"])) ||
      // fall back: the text input immediately before the password field in DOM order
      (() => {
        const idx = inputs.indexOf(passwordEl);
        for (let i = idx - 1; i >= 0; i--) {
          if (textLike.includes(inputs[i])) return inputs[i];
        }
        return null;
      })();

    const workspaceEl = textLike.find(
      (el) => el !== usernameEl && scoreMatch(el, ["workspace", "p_workspace", "wksp"])
    );

    if (!usernameEl) return null;

    return {
      workspace: workspaceEl ? cssSelectorFor(workspaceEl) : null,
      username: cssSelectorFor(usernameEl),
      password: cssSelectorFor(passwordEl),
    };
  }

  function cssSelectorFor(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
    // last resort: nth-of-type path
    const path = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let selector = node.tagName.toLowerCase();
      if (node.parentElement) {
        const siblings = Array.from(node.parentElement.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      path.unshift(selector);
      node = node.parentElement;
    }
    return path.join(" > ");
  }

  function fillField(selector, value) {
    if (!selector || value === undefined || value === null) return false;
    const el = document.querySelector(selector);
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function fillWithCredential(map, cred) {
    if (map.workspace) fillField(map.workspace, cred.workspace);
    fillField(map.username, cred.username);
    fillField(map.password, cred.password);
  }

  // ---------- floating UI ----------
  function ensureRoot() {
    let root = document.getElementById("awlm-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "awlm-root";
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function clearRoot() {
    const root = document.getElementById("awlm-root");
    if (root) root.innerHTML = "";
  }

  function showChooser(map, creds) {
    const root = ensureRoot();
    const card = document.createElement("div");
    card.className = "awlm-card";
    card.innerHTML = `
      <div class="awlm-title"><span class="awlm-dot"></span>Choose login to fill<button class="awlm-close" id="awlm-close">✕</button></div>
      <div id="awlm-list"></div>
    `;
    root.innerHTML = "";
    root.appendChild(card);
    const list = card.querySelector("#awlm-list");
    creds.forEach((c) => {
      const item = document.createElement("div");
      item.className = "awlm-item";
      item.innerHTML = `<span><span class="awlm-label">${escapeHtml(c.label || c.workspace || c.username)}</span><br><span class="awlm-sub">${escapeHtml(
        c.username
      )}</span></span>`;
      item.addEventListener("click", () => {
        fillWithCredential(map, c);
        clearRoot();
      });
      list.appendChild(item);
    });
    card.querySelector("#awlm-close").addEventListener("click", clearRoot);
  }

  function showSavePrompt(map, values, forPageKey) {
    const targetPageKey = forPageKey || PAGE_KEY;
    const root = ensureRoot();
    const card = document.createElement("div");
    card.className = "awlm-card";
    card.innerHTML = `
      <div class="awlm-title"><span class="awlm-dot"></span>Save this APEX login?<button class="awlm-close" id="awlm-close">✕</button></div>
      <div class="awlm-sub" style="margin-bottom:8px;">${escapeHtml(values.username)}${
      values.workspace ? " · " + escapeHtml(values.workspace) : ""
    }</div>
      <div class="awlm-actions">
        <button class="awlm-btn" id="awlm-save">Save</button>
        <button class="awlm-btn awlm-secondary" id="awlm-dismiss">Not now</button>
      </div>
    `;
    root.innerHTML = "";
    root.appendChild(card);
    card.querySelector("#awlm-close").addEventListener("click", clearRoot);
    card.querySelector("#awlm-dismiss").addEventListener("click", clearRoot);
    card.querySelector("#awlm-save").addEventListener("click", async () => {
      await saveCredential({
        id: `${Date.now()}`,
        pageKey: targetPageKey,
        label: values.workspace || values.username,
        workspace: values.workspace || "",
        username: values.username,
        password: values.password,
        createdAt: Date.now(),
      });
      clearRoot();
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- form submit watcher (offer to save, survives navigation) ----------
  const PENDING_TTL_MS = 90 * 1000; // ignore stale capture attempts (e.g. failed logins) after this long

  async function captureAttempt(map) {
    const usernameEl = map.username && document.querySelector(map.username);
    const passwordEl = map.password && document.querySelector(map.password);
    const workspaceEl = map.workspace && document.querySelector(map.workspace);
    if (!passwordEl) return null;
    const values = {
      username: usernameEl ? usernameEl.value : "",
      password: passwordEl.value,
      workspace: workspaceEl ? workspaceEl.value : "",
    };
    if (!values.username || !values.password) return null;

    const existing = await getCredentialsForPage();
    const dup = existing.find((c) => c.username === values.username && c.workspace === values.workspace);
    if (dup) return null;

    // Stash to storage BEFORE the page navigates away, so we can still offer
    // to save once the *next* page (e.g. the post-login landing page) loads.
    await setStore({ pendingSave: { pageKey: PAGE_KEY, values, capturedAt: Date.now() } });
    return values;
  }

  let submitWatcherAttached = false;

  async function watchForSubmit(map) {
    if (submitWatcherAttached) return;
    const passwordEl = map.password && document.querySelector(map.password);
    if (!passwordEl) return;
    submitWatcherAttached = true;
    const form = passwordEl.closest("form");
    const handler = () => captureAttempt(map);

    if (form) form.addEventListener("submit", handler, true);
    // also catch button click submits that don't fire a real form submit event
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target;
        if (t && (t.type === "submit" || t.tagName === "BUTTON")) handler();
      },
      true
    );

    // Some APEX pages log in via AJAX and never navigate at all — detect that
    // by watching for the password field disappearing from the DOM shortly
    // after a capture, and show the prompt immediately in that case.
    const observer = new MutationObserver(() => {
      if (!document.body.contains(passwordEl)) {
        observer.disconnect();
        getStore("pendingSave").then(({ pendingSave }) => {
          if (pendingSave && pendingSave.pageKey === PAGE_KEY && Date.now() - pendingSave.capturedAt < PENDING_TTL_MS) {
            showSavePrompt(map, pendingSave.values);
            setStore({ pendingSave: null });
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- pending-save check (runs on every page load, incl. after a redirect) ----------
  async function checkPendingSave() {
    const { pendingSave } = await getStore("pendingSave");
    if (!pendingSave) return;
    if (Date.now() - pendingSave.capturedAt > PENDING_TTL_MS) {
      await setStore({ pendingSave: null }); // stale (e.g. login failed, user wandered off) — drop it
      return;
    }
    if (PAGE_KEY === pendingSave.pageKey) return; // still on the login page itself, let the AJAX watcher handle it
    // We navigated somewhere new right after a credential attempt — treat that as a likely successful login.
    const { pageMaps = {} } = await getStore("pageMaps");
    const originalMap = pageMaps[pendingSave.pageKey] || {};
    await setStore({ pendingSave: null }); // consume it so it can't show again on a later page too
    showSavePrompt(originalMap, pendingSave.values, pendingSave.pageKey);
  }

  // ---------- picker mode (for popup "map fields" flow) ----------
  let pickerActive = null; // 'workspace' | 'username' | 'password' | null
  let hoverEl = null;

  function startPicker(kind) {
    pickerActive = kind;
    document.addEventListener("mouseover", onPickerHover, true);
    document.addEventListener("click", onPickerClick, true);
  }

  function stopPicker() {
    pickerActive = null;
    if (hoverEl) hoverEl.classList.remove("awlm-pick-highlight");
    document.removeEventListener("mouseover", onPickerHover, true);
    document.removeEventListener("click", onPickerClick, true);
  }

  function onPickerHover(e) {
    if (hoverEl) hoverEl.classList.remove("awlm-pick-highlight");
    hoverEl = e.target;
    if (hoverEl && hoverEl.tagName === "INPUT") hoverEl.classList.add("awlm-pick-highlight");
  }

  async function onPickerClick(e) {
    if (!pickerActive) return;
    if (!e.target || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    e.stopPropagation();
    const selector = cssSelectorFor(e.target);
    await savePageMap({ [pickerActive]: selector });
    chrome.runtime.sendMessage({ type: "AWLM_FIELD_PICKED", kind: pickerActive, selector });
    stopPicker();
  }

  // ---------- messages from popup ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "AWLM_START_PICKER") {
      startPicker(msg.kind);
      sendResponse({ ok: true });
    } else if (msg.type === "AWLM_STOP_PICKER") {
      stopPicker();
      sendResponse({ ok: true });
    } else if (msg.type === "AWLM_GET_PAGE_FIELDS") {
      getPageMap().then(async (map) => {
        const effectiveMap = map || autoDetectFields();
        if (!effectiveMap) return sendResponse({ map: null, values: null });
        const values = {
          username: effectiveMap.username ? (document.querySelector(effectiveMap.username) || {}).value || "" : "",
          password: effectiveMap.password ? (document.querySelector(effectiveMap.password) || {}).value || "" : "",
          workspace: effectiveMap.workspace ? (document.querySelector(effectiveMap.workspace) || {}).value || "" : "",
        };
        sendResponse({ map: effectiveMap, values, pageKey: PAGE_KEY });
      });
      return true;
    } else if (msg.type === "AWLM_FILL_NOW") {
      getPageMap().then((map) => {
        const effectiveMap = map || autoDetectFields();
        if (effectiveMap) fillWithCredential(effectiveMap, msg.credential);
        sendResponse({ ok: !!effectiveMap });
      });
      return true;
    } else if (msg.type === "AWLM_GET_PAGE_KEY") {
      sendResponse({ pageKey: PAGE_KEY });
    }
  });

  // ---------- init ----------
  async function init() {
    await checkPendingSave(); // in case we just landed here right after a login attempt elsewhere

    let map = await getPageMap();
    if (!map) {
      const detected = autoDetectFields();
      if (detected) {
        map = detected;
        await savePageMap(detected);
      }
    }
    if (!map) return; // not a recognizable login page

    const creds = await getCredentialsForPage();
    if (creds.length === 1) {
      fillWithCredential(map, creds[0]);
    } else if (creds.length > 1) {
      showChooser(map, creds);
    }
    watchForSubmit(map);
  }

  // Retry a few times since APEX pages sometimes render fields via JS after load
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    init();
    if (attempts >= 5) clearInterval(timer);
  }, 600);
  init();
})();
