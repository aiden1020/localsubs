import { spawn } from "node:child_process";

function frame(message) {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

function waitForResponses(stream, count, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const responses = [];
    const timeout = setTimeout(() => reject(new Error("native host integration test timed out")), timeoutMs);
    stream.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (buffer.length < 4 + length) break;
        responses.push(JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")));
        buffer = buffer.subarray(4 + length);
        if (responses.length === count) {
          clearTimeout(timeout);
          resolve(responses);
          return;
        }
      }
    });
    stream.on("error", reject);
  });
}

const child = spawn("go", ["run", "./cmd/localsubs", "native-host", "--fake-backend"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    GOCACHE: process.env.GOCACHE || `${process.cwd()}/.gocache`
  },
  stdio: ["pipe", "pipe", "pipe"]
});
let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const responsesPromise = waitForResponses(child.stdout, 2);
child.stdin.write(frame({ id: "health-1", type: "health" }));
child.stdin.write(frame({
  id: "cue-1",
  type: "translate",
  payload: {
    sessionId: "integration-session",
    cueId: "1",
    currentText: "I'll be right back.",
    contextLines: ["Wait here."],
    sourceLanguage: "en",
    targetLanguage: "zh-Hant"
  }
}));

const responses = await responsesPromise;
child.stdin.end();
const exitCode = await new Promise((resolve) => child.on("close", resolve));
if (exitCode !== 0) {
  throw new Error(`native host exited with ${exitCode}: ${stderr.trim()}`);
}
const [health, translation] = responses;
if (!health.ok || health.type !== "health.result" || !health.payload?.apiVersion) {
  throw new Error(`unexpected health response: ${JSON.stringify(health)}`);
}
if (!translation.ok || translation.type !== "translate.result") {
  throw new Error(`unexpected translate response: ${JSON.stringify(translation)}`);
}
if (translation.payload?.translation !== "我馬上回來。") {
  throw new Error(`unexpected fake translation: ${JSON.stringify(translation.payload)}`);
}

console.log("Native Messaging integration test passed");
