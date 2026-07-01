#!/usr/bin/env python3
"""Flask backend for the Phi-3.5-Financial chat interface.

Serves the chat UI and proxies conversation requests to a local Ollama
server so the browser never talks to Ollama directly (avoids CORS issues
and keeps the model name/host configurable server-side).
"""

import json
import os

import requests
from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)

# Note: intentionally NOT named OLLAMA_HOST — Ollama itself uses that variable
# for its own bind address (e.g. "0.0.0.0"), which is not a valid client URL.
OLLAMA_API_URL = os.environ.get("OLLAMA_API_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "phi3-financial")
OLLAMA_NUM_PREDICT = int(os.environ.get("OLLAMA_NUM_PREDICT", "2048"))
OLLAMA_REQUEST_TIMEOUT = int(os.environ.get("OLLAMA_REQUEST_TIMEOUT", "300"))


@app.route("/")
def index():
    return render_template("index.html", model=OLLAMA_MODEL)


@app.route("/api/health")
def health():
    """Report whether the Ollama server (and our model) is reachable."""
    try:
        resp = requests.get(f"{OLLAMA_API_URL}/api/tags", timeout=3)
        resp.raise_for_status()
        tags = [m["name"] for m in resp.json().get("models", [])]
        model_available = any(t.split(":")[0] == OLLAMA_MODEL.split(":")[0] for t in tags)
        return jsonify(
            connected=True,
            model=OLLAMA_MODEL,
            model_available=model_available,
            available_models=tags,
        )
    except requests.RequestException as exc:
        return jsonify(connected=False, model=OLLAMA_MODEL, error=str(exc)), 200


@app.route("/api/chat", methods=["POST"])
def chat():
    """Stream a chat completion from Ollama back to the browser as NDJSON."""
    payload = request.get_json(force=True) or {}
    messages = payload.get("messages", [])

    if not messages:
        return jsonify(error="No messages provided"), 400

    def generate():
        try:
            with requests.post(
                f"{OLLAMA_API_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "stream": True,
                    "options": {"num_predict": OLLAMA_NUM_PREDICT},
                },
                stream=True,
                timeout=OLLAMA_REQUEST_TIMEOUT,
            ) as ollama_resp:
                ollama_resp.raise_for_status()
                for line in ollama_resp.iter_lines():
                    if line:
                        yield line + b"\n"
        except requests.RequestException as exc:
            yield (json.dumps({"error": str(exc)}) + "\n").encode()

    return Response(generate(), mimetype="application/x-ndjson")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
