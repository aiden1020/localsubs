import { copyFile, mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceDir = path.resolve(process.argv[2] || "final");
const outputDir = path.resolve(process.argv[3] || "dist/mlc-source");

const config = JSON.parse(await readFile(path.join(sourceDir, "config.json"), "utf8"));
const generationConfig = JSON.parse(
  await readFile(path.join(sourceDir, "generation_config.json"), "utf8")
);
const ropeTheta = config.rope_theta ?? config.rope_parameters?.rope_theta;

const expected = {
  model_type: "qwen3",
  vocab_size: 64024,
  hidden_size: 1024,
  num_hidden_layers: 28,
  eos_token_id: 64002
};
for (const [field, value] of Object.entries(expected)) {
  if (config[field] !== value) {
    throw new Error(`Unexpected checkpoint ${field}: expected ${value}, got ${config[field]}`);
  }
}
if (!Number.isFinite(ropeTheta)) {
  throw new Error("Checkpoint has neither rope_theta nor rope_parameters.rope_theta");
}

const weightsPath = path.join(sourceDir, "model.safetensors");
const weights = await open(weightsPath, "r");
let tensorCount;
let embeddingShape;
try {
  const lengthBuffer = Buffer.alloc(8);
  await weights.read(lengthBuffer, 0, 8, 0);
  const headerLength = Number(lengthBuffer.readBigUInt64LE());
  const headerBuffer = Buffer.alloc(headerLength);
  await weights.read(headerBuffer, 0, headerLength, 8);
  const header = JSON.parse(headerBuffer.toString("utf8"));
  tensorCount = Object.keys(header).filter((key) => key !== "__metadata__").length;
  embeddingShape = header["model.embed_tokens.weight"]?.shape;
} finally {
  await weights.close();
}
if (tensorCount !== 310 || JSON.stringify(embeddingShape) !== "[64024,1024]") {
  throw new Error(
    `Unexpected safetensors layout: ${tensorCount} tensors, embedding ${JSON.stringify(embeddingShape)}`
  );
}

await mkdir(outputDir, { recursive: true });
const normalizedConfig = { ...config, rope_theta: ropeTheta };
delete normalizedConfig.rope_parameters;
await writeFile(
  path.join(outputDir, "config.json"),
  `${JSON.stringify(normalizedConfig, null, 2)}\n`
);
await writeFile(
  path.join(outputDir, "generation_config.json"),
  `${JSON.stringify({ ...generationConfig, bos_token_id: null }, null, 2)}\n`
);
for (const file of ["tokenizer.json", "tokenizer_config.json"]) {
  await copyFile(path.join(sourceDir, file), path.join(outputDir, file));
}
await writeFile(
  path.join(outputDir, "normalization-report.json"),
  `${JSON.stringify({
    sourceDir,
    outputDir,
    changes: {
      rope_theta: { from: "rope_parameters.rope_theta", to: ropeTheta },
      generation_bos_token_id: { from: generationConfig.bos_token_id, to: null }
    },
    tensorCount,
    embeddingShape
  }, null, 2)}\n`
);

console.log(`Prepared MLC checkpoint metadata in ${outputDir}`);
