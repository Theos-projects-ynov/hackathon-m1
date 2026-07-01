const appEl = document.getElementById("app");
const chatEl = document.getElementById("chat");
const formEl = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const themeBtn = document.getElementById("theme-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const banner = document.getElementById("offline-banner");
const bannerTitle = document.getElementById("offline-title");
const bannerDesc = document.getElementById("offline-desc");
const bannerCmd = document.getElementById("offline-cmd");

const STORAGE_KEY = "techcorp_chat_history";
const THEME_KEY = "techcorp_theme";

const WELCOME =
  "Bonjour, je suis **Finora**, votre assistant financier. Je peux vous aider à mieux comprendre " +
  "vos investissements, structurer un budget ou analyser les risques d'une stratégie.";

const SUGGESTIONS = [
  { label: "Analyser un portefeuille", prompt: "Résume les risques principaux d'un portefeuille exposé aux actions tech." },
  { label: "Comparer des placements", prompt: "Explique la différence entre ETF obligataire et action à dividendes." },
  { label: "Construire un budget", prompt: "Aide-moi à construire un budget mensuel simple." },
];

// Conversation state: array of { role, content, ts }. Persisted to localStorage.
let messages = loadMessages();

// Streaming control for the in-flight request (null when idle).
let controller = null;
let generating = false;

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

function loadMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (err) {
    /* quota plein ou stockage indisponible : on ignore silencieusement */
  }
}

/* ------------------------------------------------------------------ */
/* Rendu markdown                                                      */
/* ------------------------------------------------------------------ */

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdown(markdown) {
  const lines = markdown.split("\n");
  const html = [];
  let listType = null;

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length + 2;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const orderedItem = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedItem) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInlineMarkdown(orderedItem[2])}</li>`);
      continue;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    if (unorderedItem) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInlineMarkdown(unorderedItem[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function setBubbleContent(bubble, text, role) {
  if (role === "assistant") {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }
}

/* ------------------------------------------------------------------ */
/* Construction des messages                                           */
/* ------------------------------------------------------------------ */

function scrollToLatest() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function formatTime(ts) {
  const date = ts ? new Date(ts) : new Date();
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function iconButton(className, label, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `meta-btn ${className}`;
  btn.innerHTML = `${svg}<span>${label}</span>`;
  return btn;
}

// Crée un message complet (avatar + bulle + méta) et l'ajoute au chat.
function appendMessage(role, text, ts) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "assistant" ? "AI" : "VO";

  const col = document.createElement("div");
  col.className = "col";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.dataset.raw = text;
  setBubbleContent(bubble, text, role);

  const meta = document.createElement("div");
  meta.className = "meta";
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(ts);
  meta.appendChild(time);

  if (role === "assistant") {
    meta.appendChild(
      iconButton(
        "copy-btn",
        "Copier",
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
      )
    );
    meta.appendChild(
      iconButton(
        "regen-btn",
        "Régénérer",
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
      )
    );
  }

  col.appendChild(bubble);
  col.appendChild(meta);

  if (role === "assistant") {
    wrapper.appendChild(avatar);
    wrapper.appendChild(col);
  } else {
    wrapper.appendChild(col);
    wrapper.appendChild(avatar);
  }

  chatEl.appendChild(wrapper);
  scrollToLatest();
  return { wrapper, bubble };
}

// Le bouton « Régénérer » n'apparaît que sur le dernier message de l'assistant.
function markLastAssistant() {
  const assistants = chatEl.querySelectorAll(".message.assistant");
  assistants.forEach((el) => el.classList.remove("show-regen"));
  const last = assistants[assistants.length - 1];
  if (last) {
    last.classList.add("show-regen");
  }
}

function renderWelcome() {
  const { wrapper } = appendMessage("assistant", WELCOME, Date.now());
  // Message d'accueil : pas d'actions copier/régénérer ni horodatage.
  wrapper.querySelector(".meta").remove();

  const box = document.createElement("div");
  box.className = "suggestions";
  box.setAttribute("aria-label", "Suggestions");
  for (const item of SUGGESTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.prompt = item.prompt;
    btn.textContent = item.label;
    box.appendChild(btn);
  }
  chatEl.appendChild(box);
}

function removeSuggestions() {
  const box = chatEl.querySelector(".suggestions");
  if (box) {
    box.remove();
  }
}

// Reconstruit tout le fil à partir de l'état `messages`.
function renderConversation() {
  chatEl.innerHTML = "";
  if (!messages.length) {
    renderWelcome();
    return;
  }
  for (const msg of messages) {
    appendMessage(msg.role, msg.content, msg.ts);
  }
  markLastAssistant();
  scrollToLatest();
}

/* ------------------------------------------------------------------ */
/* État de connexion + bandeau hors-ligne                              */
/* ------------------------------------------------------------------ */

function updateBanner(state, data) {
  if (state === "connected") {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  if (state === "no-model") {
    bannerTitle.textContent = `Modèle "${data.model}" introuvable sur Ollama`;
    bannerDesc.textContent =
      "Le serveur Ollama répond mais le modèle n'est pas encore créé. Lancez :";
    bannerCmd.textContent = `ollama create ${data.model} -f ollama_server/Modelfile`;
  } else {
    bannerTitle.textContent = "Serveur Ollama injoignable";
    bannerDesc.textContent = "Démarrez Ollama puis créez le modèle financier :";
    bannerCmd.textContent =
      "ollama serve\nollama create phi3-financial -f ollama_server/Modelfile";
  }
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.connected && data.model_available) {
      statusDot.className = "dot connected";
      statusText.textContent = "Connecté";
      updateBanner("connected");
    } else if (data.connected && !data.model_available) {
      statusDot.className = "dot disconnected";
      statusText.textContent = `Modèle "${data.model}" introuvable`;
      updateBanner("no-model", data);
    } else {
      statusDot.className = "dot disconnected";
      statusText.textContent = "Ollama injoignable";
      updateBanner("offline", data);
    }
  } catch (err) {
    statusDot.className = "dot disconnected";
    statusText.textContent = "Ollama injoignable";
    updateBanner("offline", {});
  }
}

/* ------------------------------------------------------------------ */
/* Envoi / streaming                                                   */
/* ------------------------------------------------------------------ */

function setGenerating(on) {
  generating = on;
  appEl.classList.toggle("generating", on);
  sendBtn.hidden = on;
  stopBtn.hidden = !on;
}

async function sendMessage(userText) {
  removeSuggestions();

  const ts = Date.now();
  messages.push({ role: "user", content: userText, ts });
  appendMessage("user", userText, ts);
  persist();

  const assistantTs = Date.now();
  const { wrapper, bubble } = appendMessage("assistant", "", assistantTs);
  wrapper.classList.add("typing");

  setGenerating(true);
  controller = new AbortController();

  let fullText = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Erreur serveur (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop(); // garde la dernière ligne incomplète pour le chunk suivant

      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line);
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if (chunk.message && chunk.message.content) {
          wrapper.classList.remove("typing");
          fullText += chunk.message.content;
          bubble.dataset.raw = fullText;
          setBubbleContent(bubble, fullText, "assistant");
          scrollToLatest();
        }
      }
    }

    wrapper.classList.remove("typing");
    const finalText = fullText || "(réponse vide)";
    bubble.dataset.raw = finalText;
    if (!fullText) {
      setBubbleContent(bubble, finalText, "assistant");
    }
    messages.push({ role: "assistant", content: finalText, ts: assistantTs });
    persist();
  } catch (err) {
    wrapper.classList.remove("typing");
    if (err.name === "AbortError") {
      // Génération interrompue par l'utilisateur : on conserve le texte partiel.
      const partial = fullText || "(génération interrompue)";
      bubble.dataset.raw = partial;
      if (!fullText) {
        setBubbleContent(bubble, partial, "assistant");
      }
      wrapper.classList.add("stopped");
      messages.push({ role: "assistant", content: partial, ts: assistantTs });
      persist();
    } else {
      wrapper.classList.add("error");
      bubble.textContent = `Erreur : ${err.message}`;
      // La réponse assistant n'est pas enregistrée ; le message utilisateur reste
      // pour permettre un nouvel essai via « Régénérer ».
    }
  } finally {
    controller = null;
    setGenerating(false);
    markLastAssistant();
    inputEl.focus();
  }
}

// Supprime le dernier échange (assistant + utilisateur) puis le renvoie.
function regenerate() {
  if (generating) return;

  if (messages.length && messages[messages.length - 1].role === "assistant") {
    messages.pop();
  }
  let lastUser = "";
  if (messages.length && messages[messages.length - 1].role === "user") {
    lastUser = messages.pop().content;
  }
  persist();
  renderConversation();

  if (lastUser) {
    sendMessage(lastUser);
  }
}

async function copyMessage(button) {
  const bubble = button.closest(".col").querySelector(".bubble");
  const text = bubble.dataset.raw || bubble.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // Repli si l'API Clipboard est indisponible (contexte non sécurisé).
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const span = button.querySelector("span");
  const original = span.textContent;
  button.classList.add("copied");
  span.textContent = "Copié";
  setTimeout(() => {
    button.classList.remove("copied");
    span.textContent = original;
  }, 1500);
}

/* ------------------------------------------------------------------ */
/* Thème                                                               */
/* ------------------------------------------------------------------ */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

/* ------------------------------------------------------------------ */
/* Événements                                                          */
/* ------------------------------------------------------------------ */

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  if (generating) return;
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  inputEl.style.height = "auto";
  sendMessage(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`;
});

stopBtn.addEventListener("click", () => {
  if (controller) {
    controller.abort();
  }
});

newChatBtn.addEventListener("click", () => {
  if (generating && controller) {
    controller.abort();
  }
  messages = [];
  persist();
  renderConversation();
  inputEl.focus();
});

themeBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// Délégation d'événements : suggestions, copier et régénérer sont recréés dynamiquement.
chatEl.addEventListener("click", (e) => {
  const suggestion = e.target.closest("button[data-prompt]");
  if (suggestion) {
    inputEl.value = suggestion.dataset.prompt;
    formEl.requestSubmit();
    return;
  }
  const copyBtn = e.target.closest(".copy-btn");
  if (copyBtn) {
    copyMessage(copyBtn);
    return;
  }
  const regenBtn = e.target.closest(".regen-btn");
  if (regenBtn) {
    regenerate();
  }
});

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

initTheme();
renderConversation();
checkHealth();
setInterval(checkHealth, 5000);
