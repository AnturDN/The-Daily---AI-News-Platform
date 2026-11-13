
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
];

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

const MODEL_GONE =
  /not found for API version|no longer available|does not exist|decommission|not supported for generateContent|unknown model|model_not_found/i;

function classifyError(message, status) {
  const msg = String(message || '');

  if (
    /location is not supported|unsupported (country|region|location)|not available in your (country|region)/i.test(msg)
  ) return 'geo';

  if (
    /exceeded your current quota|quota exceeded|per day limit|daily limit|requests per day|\(RPD\)|tokens per day|\(TPD\)/i.test(msg)
  ) return 'quota';

  if (status === 429 || /rate limit|too many requests|RESOURCE_EXHAUSTED/i.test(msg)) {
    return 'rate';
  }

  if (
    status === 401 ||
    status === 403 ||
    /api key|permission|unauthorized|forbidden|invalid/i.test(msg)
  ) return 'auth';

  if (/network|failed to fetch|timeout/i.test(msg)) return 'network';

  return 'other';
}

async function readError(response) {
  try {
    const data = await response.json();
    return data?.error?.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function makePrompt(article) {
  return `You are a news editor. Summarize this news article in the SAME language as the article title, in 2 short sentences. Then provide 3 key bullet points in that same language. Format strictly as JSON: {"summary": "...", "points": ["...", "...", "..."]}. Article title: ${article.title}. Article description: ${article.description}`;
}

function parseSummary(raw, provider) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}') + 1;

  if (start === -1 || end <= start) {
    throw new Error('The AI returned an empty response.');
  }

  const parsed = JSON.parse(text.slice(start, end));

  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new Error('The AI response did not contain a summary.');
  }

  return {
    summary: parsed.summary,
    points: Array.isArray(parsed.points) ? parsed.points.slice(0, 3) : [],
    provider,
  };
}

async function callGroq(article, key, model) {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a news editor. Respond only with valid JSON matching the requested schema.',
        },
        {
          role: 'user',
          content: makePrompt(article),
        },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const message = await readError(response);
    const error = new Error(message);
    error.kind = classifyError(message, response.status);
    throw error;
  }

  const data = await response.json();
  return parseSummary(data.choices?.[0]?.message?.content, 'groq');
}

async function callGemini(article, key, model) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: makePrompt(article) }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const message = await readError(response);
    const error = new Error(message);
    error.kind = classifyError(message, response.status);
    throw error;
  }

  const data = await response.json();
  return parseSummary(
    data.candidates?.[0]?.content?.parts?.[0]?.text,
    'gemini',
  );
}

async function tryProvider(article, key, models, provider) {
  let lastError;

  for (const model of models) {
    try {
      if (provider === 'groq') {
        return await callGroq(article, key, model);
      }

      return await callGemini(article, key, model);
    } catch (error) {
      lastError = error;

      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        error.kind = 'network';
      }

      // A rejected key or unsupported region affects the whole provider.
      if (error.kind === 'auth' || error.kind === 'geo') {
        throw error;
      }

      // A retired model, quota limit or rate limit:
      // try the next model in the ladder.
      if (error.kind === 'quota' || error.kind === 'rate' || MODEL_GONE.test(error.message)) {
        continue;
      }

      // Do not keep retrying a provider for network or unknown failures.
      if (error.kind === 'network') {
        throw error;
      }
    }
  }

  throw lastError || new Error('No available AI model.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: { kind: 'other', message: 'Method not allowed.' },
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!groqKey && !geminiKey) {
    return res.status(503).json({
      error: {
        kind: 'missingKey',
        message: 'AI summary is not configured on the server.',
      },
    });
  }

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description =
    typeof body?.description === 'string' ? body.description.trim() : '';

  if (!title || title.length > 500 || description.length > 12000) {
    return res.status(400).json({
      error: {
        kind: 'other',
        message: 'Invalid article data.',
      },
    });
  }

  const article = { title, description };
  const errors = [];

  if (groqKey) {
    const models = [
      process.env.GROQ_MODEL,
      ...GROQ_MODELS,
    ].filter(Boolean);

    try {
      const result = await tryProvider(article, groqKey, [...new Set(models)], 'groq');
      return res.status(200).json(result);
    } catch (error) {
      errors.push(error);
    }
  }

  if (geminiKey) {
    const models = [
      process.env.GEMINI_MODEL,
      ...GEMINI_MODELS,
    ].filter(Boolean);

    try {
      const result = await tryProvider(article, geminiKey, [...new Set(models)], 'gemini');
      return res.status(200).json(result);
    } catch (error) {
      errors.push(error);
    }
  }

  const priority = ['auth', 'geo', 'quota', 'rate', 'network', 'other'];
  const lastError =
    priority.map((kind) => errors.find((error) => error.kind === kind)).find(Boolean)
    || errors[errors.length - 1];

  const kind = lastError?.kind || 'other';

  const status =
    kind === 'auth' ? 401
      : kind === 'quota' || kind === 'rate' ? 429
        : kind === 'geo' ? 403
          : 502;

  // Do not expose raw provider errors or API keys to the browser.
  const messages = {
    auth: 'The AI provider rejected its API key.',
    geo: 'The AI provider is not available in this region.',
    quota: 'The available AI model quotas have been reached.',
    rate: 'The AI service is busy. Please try again shortly.',
    network: 'Could not reach the AI service.',
    other: 'AI summary is unavailable for this article.',
  };

  return res.status(status).json({
    error: {
      kind,
      message: messages[kind] || messages.other,
    },
  });
}
