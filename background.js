'use strict';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// ── AI Digest ─────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'generateDigest') return false;

  const { apiKey, topics } = msg;

  // Find the active Twitter tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      sendResponse({ error: 'No active tab found.' });
      return;
    }

    // Tell content script we're loading (shows skeleton in panel)
    chrome.tabs.sendMessage(tab.id, { type: 'showDigestLoading' });

    // Ask content script to collect visible tweets
    chrome.tabs.sendMessage(tab.id, { type: 'collectTweets' }, (tweetsResp) => {
      if (chrome.runtime.lastError || !tweetsResp) {
        chrome.tabs.sendMessage(tab.id, { type: 'showDigestError', error: 'Could not read feed. Make sure you\'re on twitter.com.' });
        sendResponse({ error: 'Could not collect tweets.' });
        return;
      }

      const tweets = tweetsResp.tweets || [];
      if (tweets.length === 0) {
        chrome.tabs.sendMessage(tab.id, { type: 'showDigestError', error: 'No tweets found in feed. Scroll down a bit first.' });
        sendResponse({ error: 'No tweets.' });
        return;
      }

      callClaudeAPI(apiKey, topics, tweets, tab.id, sendResponse);
    });
  });

  return true; // async response
});

async function callClaudeAPI(apiKey, topics, tweets, tabId, sendResponse) {
  const topicList = topics.length > 0 ? topics.join(', ') : 'AI, Tech, Stocks';

  const systemPrompt = `You are a concise Twitter/X feed summarizer. Your job is to read a list of tweets and group the interesting ones by topic.

Rules:
- Only include tweets relevant to the requested topics
- Skip retweets, replies, promotional content, and fluff
- For each topic, write 2-4 bullet points capturing the key signal
- Each bullet should be ≤ 25 words
- Return ONLY valid JSON — no markdown, no code fences, no explanation
- If no tweets match a topic, omit that topic from the output

Output format:
{
  "topics": [
    {
      "name": "Topic Name",
      "bullets": ["bullet 1", "bullet 2"]
    }
  ],
  "total_tweets_analyzed": <number>,
  "generated_at": "<HH:MM>"
}`;

  const tweetText = tweets
    .slice(0, 80) // cap at 80 tweets to stay in context
    .map((t, i) => `[${i + 1}] @${t.author}: ${t.text}`)
    .join('\n');

  const userMessage = `Topics to summarize: ${topicList}

Tweets from feed:
${tweetText}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = errBody?.error?.message || `API error ${res.status}`;
      chrome.tabs.sendMessage(tabId, { type: 'showDigestError', error: errMsg });
      sendResponse({ error: errMsg });
      return;
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || '';

    let digest;
    try {
      digest = JSON.parse(raw);
    } catch {
      // Claude returned something non-JSON — surface it gracefully
      chrome.tabs.sendMessage(tabId, { type: 'showDigestError', error: 'Could not parse digest. Try again.' });
      sendResponse({ error: 'Parse error' });
      return;
    }

    chrome.tabs.sendMessage(tabId, { type: 'showDigest', digest });
    sendResponse({ ok: true });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, { type: 'showDigestError', error: err.message || 'Network error.' });
    sendResponse({ error: err.message });
  }
}
