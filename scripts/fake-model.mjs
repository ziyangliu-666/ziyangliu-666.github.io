/* A scripted stand-in for the model, so the harness can be tested without spending
 * tokens or holding a key.
 *
 *   node scripts/fake-model.mjs                 # listens on :8787
 *   VITE_AGENT_PROXY_URL=http://localhost:8787 npm run dev
 *
 * It speaks the same wire format as the proxy — SSE chat completions with
 * `reasoning_content` and streamed `tool_calls` — and scripts a turn that exercises every
 * branch the UI can render: reasoning, a tool call, a sub-agent, then the answer.
 *
 * The tools it asks for run for real against the real corpus, so a failure here is a
 * failure in the loop or the tools, not in a mock of them.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const REASONING =
  "The question is about throughput, so the résumé is the right index. " +
  "Search it first, then have a sub-agent check whether the same claim appears in the Chinese résumé, " +
  "because a number that only exists in one language is usually a typo.";

const ANSWER = `He replaced a serial read-then-write transfer path with async chunked reads and writes across a shared queue, 8 threads per side. Sustained throughput went from 70 MB/s to 290 MB/s.

That is the V2V OS data path at SmartX — the product that moves guests off VMware onto SMTX OS, now on 10,000+ production VMs.`;

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function chunk(delta, finish = null) {
  return {
    id: "fake",
    object: "chat.completion.chunk",
    model: "deepseek-v4-flash",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function streamText(res, text, field = "content") {
  for (const piece of text.match(/[\s\S]{1,24}/g) ?? []) {
    sse(res, chunk({ [field]: piece }));
    await sleep(20);
  }
}

async function streamToolCall(res, name, args) {
  // Fragmented exactly like the real thing: id and name first, then arguments in pieces.
  sse(res, chunk({ tool_calls: [{ index: 0, id: `call_${name}`, type: "function", function: { name, arguments: "" } }] }));
  const json = JSON.stringify(args);
  for (const piece of json.match(/[\s\S]{1,12}/g) ?? []) {
    sse(res, chunk({ tool_calls: [{ index: 0, function: { arguments: piece } }] }));
    await sleep(10);
  }
  sse(res, chunk({}, "tool_calls"));
}

function finishUp(res, inputTokens) {
  sse(res, {
    id: "fake",
    choices: [],
    usage: { prompt_tokens: inputTokens, completion_tokens: 180 },
  });
  res.write("data: [DONE]\n\n");
  res.end();
}

async function handleChat(body, res) {
  const messages = body.messages ?? [];
  const system = String(messages[0]?.content ?? "");
  const toolTurns = messages.filter((m) => m.role === "tool").length;
  const isSubagent = system.startsWith("You are a research sub-agent");
  const isFollowUp = system.includes("two questions a curious visitor");

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    ...CORS,
  });

  if (isFollowUp) {
    await streamText(res, "What else did he change in that path?\nWhy 8 threads per side?");
    sse(res, chunk({}, "stop"));
    return finishUp(res, 400);
  }

  if (isSubagent) {
    if (toolTurns === 0) {
      await streamToolCall(res, "retrieve", { query: "吞吐 290 MB/s", index: "resume" });
      return finishUp(res, 900);
    }
    await streamText(
      res,
      "The Chinese résumé carries the same figures (resume-zh#2): 70 MB/s to 290 MB/s, 8 threads per side. No discrepancy.",
    );
    sse(res, chunk({}, "stop"));
    return finishUp(res, 1400);
  }

  if (toolTurns === 0) {
    await streamText(res, REASONING, "reasoning_content");
    await streamToolCall(res, "retrieve", {
      query: "transfer throughput async chunked shared queue",
      index: "resume",
    });
    return finishUp(res, 2100);
  }

  if (toolTurns === 1) {
    await streamToolCall(res, "spawn_subagent", {
      name: "zh-crosscheck",
      task: "Check whether the Chinese résumé states the same throughput figures as the English one. Report both numbers and any discrepancy.",
    });
    return finishUp(res, 4200);
  }

  await streamText(res, ANSWER);
  sse(res, chunk({}, "stop"));
  return finishUp(res, 5600);
}

createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", async () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = req.url ?? "";

    if (url.startsWith("/api/chat")) {
      console.log(
        `chat · ${body.messages?.length ?? 0} messages · ${body.messages?.filter((m) => m.role === "tool").length ?? 0} tool results`,
      );
      return handleChat(body, res).catch((err) => {
        console.error(err);
        res.end();
      });
    }

    if (url.startsWith("/api/search")) {
      console.log(`search · ${body.query}`);
      res.writeHead(200, { "content-type": "application/json", ...CORS });
      return res.end(
        JSON.stringify({
          results: [
            {
              title: "SmartX V2V OS",
              url: "https://www.smartx.com/",
              content: "Scripted search result from scripts/fake-model.mjs.",
            },
          ],
        }),
      );
    }

    if (url.startsWith("/api/fetch")) {
      res.writeHead(200, { "content-type": "application/json", ...CORS });
      return res.end(
        JSON.stringify({ url: body.url, title: "Scripted page", text: "Scripted body text." }),
      );
    }

    res.writeHead(404, CORS);
    res.end("no such route");
  });
}).listen(PORT, () => {
  console.log(`scripted model on http://localhost:${PORT} — point VITE_AGENT_PROXY_URL at it`);
});
