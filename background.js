'use strict';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// ── AI Digest (Ollama local) ──────────────────────────────────────────────────
const OLLAMA_BASE = 'http://localhost:11434';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'checkOllama') {
    fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.json())
      .then(data => {
        const models = (data.models || []).map(m => m.name);
        sendResponse({ ok: true, models });
      })
      .catch(() => sendResponse({ ok: false, models: [] }));
    return true;
  }

  if (msg.type !== 'generateDigest') return false;

  const { model, topics } = msg;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) { sendResponse({ error: 'No active tab.' }); return; }

    chrome.tabs.sendMessage(tab.id, { type: 'showDigestLoading' });

    chrome.tabs.sendMessage(tab.id, { type: 'collectTweets' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        chrome.tabs.sendMessage(tab.id, { type: 'showDigestError', error: "Couldn't read feed. Make sure you're on twitter.com." });
        sendResponse({ error: 'No tweets collected.' });
        return;
      }

      const tweets = resp.tweets || [];
      if (tweets.length === 0) {
        chrome.tabs.sendMessage(tab.id, { type: 'showDigestError', error: 'No tweets in feed. Scroll down a bit first.' });
        sendResponse({ error: 'Empty feed.' });
        return;
      }

      callOllama(model, topics, tweets, tab.id, sendResponse);
    });
  });

  return true;
});

async function callOllama(model, topics, tweets, tabId, sendResponse) {
  const topicList = topics.length > 0 ? topics.join(', ') : 'AI, Tech';

  const systemPrompt = `You are a Twitter/X feed summarizer. Read the tweets and group notable ones by topic.

Rules:
- Only include tweets relevant to the requested topics
- Skip retweets, replies, promotional fluff
- 2-4 bullet points per topic, each ≤ 25 words
- Return ONLY valid JSON, no markdown, no code fences

Format:
{"topics":[{"name":"Topic","bullets":["bullet 1","bullet 2"]}],"total_tweets_analyzed":<number>}`;

  const tweetText = tweets
    .slice(0, 60)
    .map((t, i) => `[${i + 1}] @${t.author}: ${t.text}`)
    .join('\n');

  const userMessage = `Topics: ${topicList}\n\nTweets:\n${tweetText}`;

  try {
    const res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
        stream: false,
        options: { temperature: 0.3 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `Ollama error ${res.status}`);
    }

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content || '';

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

    let digest;
    try {
      digest = JSON.parse(cleaned);
    } catch {
      // Model returned prose instead of JSON — surface gracefully
      chrome.tabs.sendMessage(tabId, {
        type: 'showDigestError',
        error: `Model returned non-JSON. Try a bigger model like llama3.1 or mistral.`,
      });
      sendResponse({ error: 'parse error' });
      return;
    }

    chrome.tabs.sendMessage(tabId, { type: 'showDigest', digest });
    sendResponse({ ok: true });
  } catch (err) {
    const isConnRefused = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
    const msg = isConnRefused
      ? 'Ollama not running. Start it with: ollama serve'
      : err.message || 'Unknown error';
    chrome.tabs.sendMessage(tabId, { type: 'showDigestError', error: msg });
    sendResponse({ error: msg });
  }
}
