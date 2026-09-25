import { setTimeout as sleep } from 'node:timers/promises';
import { FunctionCallingConfigMode, GoogleGenAI } from '@google/genai';
import { LlmUsage, today } from '../models/llm-usage.js';
import { logger } from '../logger.js';
import { createRateLimiter } from './limiter.js';

const MAX_ATTEMPTS = 5;
const MAX_RETRY_WAIT_MS = 60_000;

export class LlmUnavailableError extends Error {}

// The model kept answering 503 (overloaded) or 429 (rate limited) through every retry.
export class LlmOverloadedError extends Error {}

// The only place OpsPilot talks to a language model. Everything model-specific lives here:
// request format, rate limits, retries and quota accounting.
export function createGemini({ apiKey, model, fallbackModel, requestsPerMinute, dailyRequestBudget }) {
  if (!apiKey) return null;

  const client = new GoogleGenAI({ apiKey });
  const waitForSlot = createRateLimiter(requestsPerMinute);

  async function remainingToday() {
    const usage = await LlmUsage.findOne({ day: today() }).lean();
    return dailyRequestBudget - (usage?.requests ?? 0);
  }

  async function record(usage) {
    await LlmUsage.updateOne(
      { day: today() },
      {
        $inc: {
          requests: 1,
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        },
      },
      { upsert: true },
    );
  }

  /**
   * One model turn. `tools` are function declarations; with `requireTool` the model must
   * answer with a function call, optionally limited to `allowedTools`.
   * Returns the model's message (to append to the conversation), its function calls, any
   * text, and token usage.
   */
  async function generate({ model: chosen = model, system, contents, tools, requireTool = true, allowedTools }) {
    if ((await remainingToday()) <= 0) throw new LlmUnavailableError('the daily AI request budget is used up');

    for (let attempt = 1; ; attempt += 1) {
      await waitForSlot();
      try {
        const response = await client.models.generateContent({
          model: chosen,
          contents,
          config: {
            systemInstruction: system,
            temperature: 0.2,
            tools: [{ functionDeclarations: tools }],
            toolConfig: {
              functionCallingConfig: {
                mode: requireTool ? FunctionCallingConfigMode.ANY : FunctionCallingConfigMode.AUTO,
                ...(allowedTools && { allowedFunctionNames: allowedTools }),
              },
            },
          },
        });
        await record(response.usageMetadata);

        return {
          message: response.candidates?.[0]?.content ?? { role: 'model', parts: [] },
          calls: response.functionCalls ?? [],
          text: textOf(response),
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens:
              (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0),
          },
        };
      } catch (err) {
        const busy = err.status === 429 || err.status === 503;
        if (!(busy || err.status >= 500)) throw err;
        if (attempt === MAX_ATTEMPTS) {
          if (busy) throw new LlmOverloadedError(`${chosen} is overloaded right now (HTTP ${err.status})`);
          throw err;
        }
        const wait = err.status === 429 ? retryDelay(err) : 2000 * 2 ** (attempt - 1);
        logger.warn({ model: chosen, status: err.status, attempt, waitMs: wait }, 'Gemini request failed, retrying');
        await sleep(wait);
      }
    }
  }

  return { model, fallbackModel, generate, remainingToday };
}

// A 429 from Gemini usually says how long to back off ("retryDelay": "37s").
function retryDelay(err) {
  const seconds = Number(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(err.message ?? '')?.[1]);
  return Math.min(MAX_RETRY_WAIT_MS, Number.isFinite(seconds) ? seconds * 1000 + 500 : 20_000);
}

function textOf(response) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join('\n')
    .trim();
}
