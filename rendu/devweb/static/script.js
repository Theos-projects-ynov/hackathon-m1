const chatEl = document.getElementById("chat");
const formEl = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const suggestionsEl = document.querySelector(".suggestions");

// Conversation history sent to the model on every turn.
const history = [];

function scrollToLatest() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function hideSuggestions() {
  if (suggestionsEl) {
    suggestionsEl.remove();
  }
}

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

function addMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "AI";
    wrapper.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  setBubbleContent(bubble, text, role);
  wrapper.appendChild(bubble);
  chatEl.appendChild(wrapper);
  scrollToLatest();
  return bubble;
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.connected && data.model_available) {
      statusDot.className = "dot connected";
      statusText.textContent = "Connect\u00e9";
    } else if (data.connected && !data.model_available) {
      statusDot.className = "dot disconnected";
      statusText.textContent = `Mod\u00e8le "${data.model}" introuvable sur Ollama`;
    } else {
      statusDot.className = "dot disconnected";
      statusText.textContent = "Ollama injoignable";
    }
  } catch (err) {
    statusDot.className = "dot disconnected";
    statusText.textContent = "Ollama injoignable";
  }
}

async function sendMessage(userText) {
  hideSuggestions();
  history.push({ role: "user", content: userText });
  addMessage("user", userText);

  const assistantBubble = addMessage("assistant", "");
  const assistantMessage = assistantBubble.parentElement;
  assistantMessage.classList.add("typing");
  history.push({ role: "assistant", content: "" });

  sendBtn.disabled = true;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(0, -1) }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Erreur serveur (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep the incomplete last line for next chunk

      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line);
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if (chunk.message && chunk.message.content) {
          assistantMessage.classList.remove("typing");
          fullText += chunk.message.content;
          setBubbleContent(assistantBubble, fullText, "assistant");
          scrollToLatest();
        }
      }
    }

    history[history.length - 1].content = fullText || "(r\u00e9ponse vide)";
    if (!fullText) {
      assistantMessage.classList.remove("typing");
      setBubbleContent(assistantBubble, "(r\u00e9ponse vide)", "assistant");
    }
  } catch (err) {
    assistantMessage.classList.remove("typing");
    assistantMessage.classList.add("error");
    assistantBubble.textContent = `Erreur : ${err.message}`;
    history.pop();
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
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

if (suggestionsEl) {
  suggestionsEl.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-prompt]");
    if (!button) return;
    inputEl.value = button.dataset.prompt;
    formEl.requestSubmit();
  });
}

checkHealth();
setInterval(checkHealth, 5000);
