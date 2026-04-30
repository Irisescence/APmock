(function () {
  "use strict";

  const SUPABASE_URL = "https://dantlodnorpvnlzzypsg.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_phLI1fQMrcRZJVrkXcBUxQ_3nTgwjo_";
  const PROFILE_COLUMNS = "id, email, role, real_name, nickname, created_at";

  const text = {
    accountNotLoggedIn: "\u8d26\u6237\u672a\u767b\u5f55",
    loginSignup: "\u767b\u5f55 / \u6ce8\u518c",
    viewAccount: "\u67e5\u770b\u8d26\u6237\u4fe1\u606f",
    logout: "\u9000\u51fa\u767b\u5f55",
    email: "\u90ae\u7bb1",
    realName: "\u771f\u5b9e\u59d3\u540d",
    nickname: "\u6635\u79f0",
    notSet: "\u672a\u586b\u5199",
    role: "\u89d2\u8272"
  };

  if (!window.supabase) {
    console.error("Supabase CDN did not load.");
    return;
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let currentUser = null;
  let currentProfile = null;

  function normalizeRole(role) {
    return ["student", "teacher", "admin"].includes(role) ? role : "student";
  }

  function isTeacherLike(role) {
    return role === "teacher" || role === "admin";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDisplayName() {
    return currentProfile?.real_name || currentProfile?.nickname || currentUser?.email || text.accountNotLoggedIn;
  }

  function getInitial() {
    const name = getDisplayName().trim();
    return (name[0] || "?").toUpperCase();
  }

  function friendlyAuthError(error) {
    const message = error?.message || "\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002";
    if (message.includes("Invalid login credentials")) return "\u90ae\u7bb1\u6216\u5bc6\u7801\u4e0d\u6b63\u786e\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165\u3002";
    if (message.includes("Email not confirmed")) return "\u90ae\u7bb1\u8fd8\u6ca1\u6709\u786e\u8ba4\u3002\u5f00\u53d1\u6d4b\u8bd5\u65f6\u53ef\u4ee5\u5728 Supabase \u5173\u95ed Confirm email\u3002";
    if (message.includes("email rate limit exceeded")) return "\u90ae\u7bb1\u53d1\u9001\u592a\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u6216\u6362\u4e00\u4e2a\u6d4b\u8bd5\u90ae\u7bb1\u3002";
    if (message.includes("Password should be")) return "\u5bc6\u7801\u4e0d\u7b26\u5408\u8981\u6c42\uff0c\u8bf7\u81f3\u5c11\u8f93\u5165 6 \u4f4d\u3002";
    return message;
  }

  async function getSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;
    return data.session;
  }

  async function fetchProfile(userId) {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function ensureProfile(user) {
    if (!user) return null;

    const existingProfile = await fetchProfile(user.id);
    if (existingProfile) {
      currentProfile = { ...existingProfile, role: normalizeRole(existingProfile.role) };
      return currentProfile;
    }

    const { data, error } = await supabaseClient
      .from("profiles")
      .insert({ id: user.id, email: user.email, role: "student" })
      .select("*")
      .single();

    if (error) throw error;
    currentProfile = { ...data, role: normalizeRole(data.role) };
    return currentProfile;
  }

  async function getCurrentProfile() {
    const session = await getSession();
    if (!session?.user) {
      currentProfile = null;
      return null;
    }
    return ensureProfile(session.user);
  }

  async function signUp(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session?.user) {
      currentUser = data.session.user;
      await ensureProfile(data.session.user);
    } else if (data.user) {
      currentUser = data.user;
    }

    return data;
  }

  async function login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    if (data.user) await ensureProfile(data.user);
    return data;
  }

  async function saveProfileDetails(realName, nickname = "") {
    const session = await getSession();
    const user = session?.user;
    if (!user) throw new Error("\u8bf7\u5148\u767b\u5f55\u540e\u518d\u4fdd\u5b58\u8d44\u6599\u3002");

    const cleanRealName = realName.trim();
    const cleanNickname = nickname.trim();
    if (!cleanRealName) throw new Error("\u8bf7\u586b\u5199\u771f\u5b9e\u59d3\u540d\u3002");

    const { data, error } = await supabaseClient
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        role: currentProfile?.role || "student",
        real_name: cleanRealName,
        nickname: cleanNickname || null
      }, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    currentProfile = { ...data, role: normalizeRole(data.role) };
    return currentProfile;
  }

  async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    currentUser = null;
    currentProfile = null;
  }

  async function requireLogin() {
    const profile = await getCurrentProfile();
    if (!profile) {
      alert("\u8bf7\u5148\u767b\u5f55\u8d26\u53f7\u3002");
      window.location.href = "index.html";
      return null;
    }
    return profile;
  }

  function renderAuthBox(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isLoggedIn = !!currentUser;
    const displayName = getDisplayName();
    const role = currentProfile?.role || "guest";

    if (!isLoggedIn) {
      container.innerHTML = `
        <button class="account-entry" id="accountEntry" type="button" aria-label="login or register">
          <span class="account-avatar guest">?</span>
          <span class="account-copy">
            <strong>${text.accountNotLoggedIn}</strong>
            <small>${text.loginSignup}</small>
          </span>
        </button>
      `;
      document.getElementById("accountEntry")?.addEventListener("click", () => {
        window.location.href = "auth.html";
      });
      return;
    }

    const safeName = escapeHtml(displayName);
    const safeEmail = escapeHtml(currentUser.email);
    const safeRole = escapeHtml(role);

    container.innerHTML = `
      <div class="account-menu-wrap">
        <button class="account-entry" id="accountEntry" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="account-avatar">${escapeHtml(getInitial())}</span>
          <span class="account-copy">
            <strong>${safeName}</strong>
            <small>${safeRole}</small>
          </span>
        </button>
        <div class="account-menu hidden" id="accountMenu">
          <div class="account-menu-user">
            <strong>${safeName}</strong>
            <span>${safeEmail}</span>
          </div>
          <button type="button" id="viewAccountBtn">${text.viewAccount}</button>
          <button type="button" id="logoutBtn">${text.logout}</button>
        </div>
      </div>
    `;

    const entry = document.getElementById("accountEntry");
    const menu = document.getElementById("accountMenu");
    entry?.addEventListener("click", (event) => {
      event.stopPropagation();
      menu?.classList.toggle("hidden");
      entry.setAttribute("aria-expanded", menu?.classList.contains("hidden") ? "false" : "true");
    });

    document.addEventListener("click", () => {
      menu?.classList.add("hidden");
      entry?.setAttribute("aria-expanded", "false");
    });

    document.getElementById("viewAccountBtn")?.addEventListener("click", () => {
      alert([
        `${text.email}: ${currentUser.email}`,
        `${text.realName}: ${currentProfile?.real_name || text.notSet}`,
        `${text.nickname}: ${currentProfile?.nickname || text.notSet}`,
        `${text.role}: ${role}`
      ].join("\n"));
    });

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      try {
        await logout();
        window.location.reload();
      } catch (error) {
        alert("\u9000\u51fa\u767b\u5f55\u5931\u8d25\uff1a" + friendlyAuthError(error));
      }
    });
  }

  function setAuthMessage(message, type = "error") {
    const box = document.getElementById("authMessage");
    if (!box) return;
    box.textContent = message;
    box.className = `auth-message ${type}`;
  }

  function clearAuthMessage() {
    const box = document.getElementById("authMessage");
    if (!box) return;
    box.textContent = "";
    box.className = "auth-message hidden";
  }

  function showAuthPanel(panelName) {
    clearAuthMessage();
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const profileForm = document.getElementById("profileForm");
    const loginTab = document.getElementById("loginTab");
    const signupTab = document.getElementById("signupTab");

    loginForm?.classList.toggle("hidden", panelName !== "login");
    signupForm?.classList.toggle("hidden", panelName !== "signup");
    profileForm?.classList.toggle("hidden", panelName !== "profile");
    loginTab?.classList.toggle("active", panelName === "login");
    signupTab?.classList.toggle("active", panelName === "signup");
  }

  async function initAuthPage() {
    await getCurrentProfile().catch(() => null);
    if (currentUser && !currentProfile?.real_name) showAuthPanel("profile");

    document.getElementById("loginTab")?.addEventListener("click", () => showAuthPanel("login"));
    document.getElementById("signupTab")?.addEventListener("click", () => showAuthPanel("signup"));

    document.getElementById("loginForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthMessage();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;

      try {
        await login(email, password);
        if (!currentProfile?.real_name) {
          showAuthPanel("profile");
          setAuthMessage("\u767b\u5f55\u6210\u529f\uff0c\u8bf7\u5148\u5b8c\u5584\u8d44\u6599\u3002", "success");
          return;
        }
        window.location.href = "index.html";
      } catch (error) {
        setAuthMessage("\u767b\u5f55\u5931\u8d25\uff1a" + friendlyAuthError(error));
      }
    });

    document.getElementById("signupForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthMessage();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;
      const confirmPassword = document.getElementById("signupPasswordConfirm").value;

      if (password.length < 6) {
        setAuthMessage("\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d\u3002");
        return;
      }
      if (password !== confirmPassword) {
        setAuthMessage("\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165\u3002");
        return;
      }

      try {
        const data = await signUp(email, password);
        if (!data.session) {
          setAuthMessage("\u6ce8\u518c\u6210\u529f\u3002\u8bf7\u5148\u5b8c\u6210\u90ae\u7bb1\u786e\u8ba4\uff0c\u7136\u540e\u56de\u5230\u8fd9\u91cc\u767b\u5f55\u3002", "success");
          showAuthPanel("login");
          return;
        }
        showAuthPanel("profile");
        setAuthMessage("\u6ce8\u518c\u6210\u529f\uff0c\u8bf7\u7ee7\u7eed\u586b\u5199\u8d44\u6599\u3002", "success");
      } catch (error) {
        setAuthMessage("\u6ce8\u518c\u5931\u8d25\uff1a" + friendlyAuthError(error));
      }
    });

    document.getElementById("profileForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthMessage();
      const realName = document.getElementById("profileRealName").value;
      const nickname = document.getElementById("profileNickname").value;

      try {
        await saveProfileDetails(realName, nickname);
        setAuthMessage("\u8d44\u6599\u5df2\u4fdd\u5b58\uff0c\u6b63\u5728\u8fd4\u56de\u9996\u9875\u3002", "success");
        window.location.href = "index.html";
      } catch (error) {
        setAuthMessage("\u8d44\u6599\u4fdd\u5b58\u5931\u8d25\uff1a" + friendlyAuthError(error));
      }
    });
  }

  window.apAuth = {
    supabaseClient,
    signUp,
    login,
    logout,
    getSession,
    getCurrentProfile,
    requireLogin,
    renderAuthBox,
    saveProfileDetails,
    initAuthPage,
    normalizeRole,
    isTeacherLike,
    friendlyAuthError,
    get user() { return currentUser; },
    get profile() { return currentProfile; },
    get role() { return currentProfile?.role || null; },
    get canEditExams() { return isTeacherLike(currentProfile?.role); }
  };
})();