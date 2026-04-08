import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  if (ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0) {
    return `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }
  if (ENV.geminiApiKey) {
    return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }
  return "https://forge.manus.im/v1/chat/completions";
};

const getApiKey = () => ENV.geminiApiKey || ENV.forgeApiKey;

const assertApiKey = () => {
  if (!getApiKey()) {
    throw new Error("No AI API key configured — set GEMINI_API_KEY or BUILT_IN_FORGE_API_KEY");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// In-memory "Gemini is sick" cache. If Gemini fails, we remember it for 5 min
// and skip straight to Claude on subsequent calls. Self-healing — once 5 min
// pass with no Gemini calls, we try Gemini first again.
let _geminiCooldownUntil = 0;
const GEMINI_COOLDOWN_MS = 5 * 60 * 1000;

function isGeminiInCooldown(): boolean {
  return Date.now() < _geminiCooldownUntil;
}
function markGeminiSick(): void {
  _geminiCooldownUntil = Date.now() + GEMINI_COOLDOWN_MS;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  // Primary model with a fallback chain. If the primary is 503/429-overloaded
  // for all 5 retries, fall through to the next model. Order = prefer cheap/fast
  // first, fall back to slower/pricier as needed.
  const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-pro"];

  const buildPayload = (model: string): Record<string, unknown> => ({
    model,
    messages: messages.map(normalizeMessage),
  });

  let payload: Record<string, unknown> = buildPayload(MODEL_CHAIN[0]);

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  // Retry transient errors (503/429/502/504) with exponential backoff.
  // After exhausting retries on the primary model, fall through to the next
  // model in MODEL_CHAIN — useful when Gemini Flash is having a bad day.
  const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
  const ATTEMPTS_PER_MODEL = 2; // Reduced from 3 — fewer tries before falling through
  let lastError: Error | null = null;

  // If Gemini failed within the last 5 minutes, skip it entirely and go straight
  // to Claude. Avoids 60+ second waits during a Gemini outage.
  if (isGeminiInCooldown() && ENV.anthropicApiKey) {
    console.log("[LLM] Gemini in cooldown — going straight to Claude");
    try {
      return await invokeClaude(messages, normalizedResponseFormat);
    } catch (claudeErr) {
      console.error("[LLM] Claude failed during Gemini cooldown:", claudeErr);
      // Reset cooldown so we retry Gemini next time
      _geminiCooldownUntil = 0;
      // Fall through to the normal Gemini chain as a last resort
    }
  }

  for (const modelName of MODEL_CHAIN) {
    payload = buildPayload(modelName);
    if (modelName !== MODEL_CHAIN[0]) {
      console.warn(`[LLM] Falling back to model: ${modelName}`);
    }

    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      let response: Response;
      try {
        response = await fetch(resolveApiUrl(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${getApiKey()}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (networkErr) {
        lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
        if (attempt < ATTEMPTS_PER_MODEL) {
          const backoffMs = Math.min(4000, 500 * Math.pow(2, attempt - 1));
          console.warn(`[LLM:${modelName}] Network error attempt ${attempt}/${ATTEMPTS_PER_MODEL}, retrying in ${backoffMs}ms…`);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        break; // try next model
      }

      if (response.ok) {
        return (await response.json()) as InvokeResult;
      }

      const errorText = await response.text();
      lastError = new Error(
        `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
      );

      if (!RETRYABLE_STATUSES.has(response.status)) {
        throw lastError; // non-retryable, give up immediately
      }

      if (attempt >= ATTEMPTS_PER_MODEL) {
        console.warn(`[LLM:${modelName}] Exhausted ${ATTEMPTS_PER_MODEL} attempts with ${response.status}, falling through to next model`);
        break; // try next model in chain
      }

      // Exponential backoff with jitter: 500ms, 1s, 2s
      const backoffMs = Math.min(4000, 500 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(`[LLM:${modelName}] Got ${response.status} attempt ${attempt}/${ATTEMPTS_PER_MODEL}, retrying in ${backoffMs}ms…`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  // All Gemini models failed — mark Gemini as sick so the next 5 minutes of
  // requests skip Gemini entirely and go straight to Claude.
  markGeminiSick();
  console.warn("[LLM] All Gemini models exhausted — putting Gemini in 5-min cooldown");

  // ─── Final fallback: Anthropic Claude ─────────────────────────────────────
  // If both Gemini Flash and Pro have exhausted all retries, try Claude as a
  // last resort. Claude uses a different API format so we convert messages
  // and the response back into our InvokeResult shape.
  if (ENV.anthropicApiKey) {
    console.warn("[LLM] Falling back to Claude Sonnet 4.5");
    try {
      return await invokeClaude(messages, normalizedResponseFormat);
    } catch (claudeErr) {
      console.error("[LLM] Claude fallback also failed:", claudeErr);
      // Throw the Gemini error since that's what users were originally hitting
      throw lastError ?? claudeErr;
    }
  }

  throw lastError ?? new Error("LLM invoke failed after exhausting all models");
}

// ─── Claude (Anthropic) fallback ────────────────────────────────────────────
async function invokeClaude(
  messages: Message[],
  responseFormat:
    | { type: "json_schema"; json_schema: JsonSchema }
    | { type: "text" }
    | { type: "json_object" }
    | undefined,
): Promise<InvokeResult> {
  // Anthropic format separates system message from user/assistant turns.
  const systemParts: string[] = [];
  const conversation: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of messages) {
    const contentString =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .map((c) => (typeof c === "string" ? c : "text" in c ? c.text : ""))
              .join("\n")
          : (msg.content as { text?: string }).text ?? "";

    if (msg.role === "system") {
      systemParts.push(contentString);
    } else if (msg.role === "user" || msg.role === "assistant") {
      conversation.push({ role: msg.role, content: contentString });
    }
  }

  // If a JSON response format was requested, append a hint to the system prompt
  // since Claude doesn't have a native json_schema enforcement parameter.
  if (responseFormat?.type === "json_schema" || responseFormat?.type === "json_object") {
    systemParts.push(
      "IMPORTANT: Respond with valid JSON only — no markdown, no code fences, no commentary outside the JSON object.",
    );
  }

  // Make sure there's at least one user message (Anthropic requires it).
  if (conversation.length === 0 || conversation[0].role !== "user") {
    conversation.unshift({ role: "user", content: "Continue." });
  }

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    messages: conversation,
  };
  if (systemParts.length > 0) {
    body.system = systemParts.join("\n\n");
  }

  // Retry transient errors on Claude too (3 attempts).
  const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
  const MAX_ATTEMPTS = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ENV.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };
      const textPart = data.content?.find((c) => c.type === "text")?.text ?? "";

      // Convert Claude response → OpenAI-compatible InvokeResult
      return {
        id: "claude-fallback",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "claude-sonnet-4-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: textPart,
            },
            finish_reason: "stop",
          },
        ],
        usage: data.usage
          ? {
              prompt_tokens: data.usage.input_tokens,
              completion_tokens: data.usage.output_tokens,
              total_tokens: data.usage.input_tokens + data.usage.output_tokens,
            }
          : undefined,
      } as unknown as InvokeResult;
    }

    const errorText = await response.text();
    lastError = new Error(
      `Claude fallback failed: ${response.status} ${response.statusText} – ${errorText}`,
    );

    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) {
      throw lastError;
    }

    const backoffMs = Math.min(4000, 500 * Math.pow(2, attempt - 1));
    console.warn(`[Claude] Got ${response.status} attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${backoffMs}ms…`);
    await new Promise((r) => setTimeout(r, backoffMs));
  }

  throw lastError ?? new Error("Claude fallback failed after retries");
}
