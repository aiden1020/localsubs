import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const modelDir = path.resolve(
  process.argv[2] || "dist/LocalSubs-EN-ZH-TW-0.6B-q4f16_1-MLC"
);
const configPath = path.join(modelDir, "mlc-chat-config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

const tokenizerVocabSize = 64024;
const supportedModelVocabSizes = new Set([tokenizerVocabSize, 151936]);

if (
  config.model_type !== "qwen3" ||
  !supportedModelVocabSizes.has(config.vocab_size) ||
  (config.active_vocab_size ?? tokenizerVocabSize) !== tokenizerVocabSize
) {
  throw new Error(
    `Unexpected MLC model: ${config.model_type ?? "unknown"}, vocab ${config.vocab_size ?? "unknown"}`
  );
}

// The stock-library experiment pads the embedding matrix to Qwen3's upstream
// vocabulary size. Sampling must remain restricted to LocalSubs' tokenizer.
config.active_vocab_size = tokenizerVocabSize;

config.conv_template = {
  ...config.conv_template,
  system_prefix_token_ids: [],
  stop_str: ["<|endoftext|>", "<|im_end|>"],
  stop_token_ids: [64000, 64002]
};
config.pad_token_id = 64000;
config.bos_token_id = 64000;
config.eos_token_id = [64000, 64002];

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Finalized WebLLM token settings in ${configPath}`);
