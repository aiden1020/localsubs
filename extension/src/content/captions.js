export function normalizeText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeTranslatedText(text = "") {
  return text
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join("\n");
}

export function normalizeCaption(text = "") {
  return text
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join("\n");
}

export function isNonDialogueCaption(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return true;
  }
  return (
    /^\[[^\]]+\]$/.test(normalized) ||
    /^\([^)]+\)$/.test(normalized) ||
    /^[♪♬][^♪♬]*[♪♬]?$/.test(normalized)
  );
}

export function isLikelyUiText(text) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!normalized) return true;
  if (normalized.length > 160) return true;
  if (/^S\d+\s*E\d+:/i.test(normalized)) return true;
  if (/^(episode|season)\b/i.test(normalized)) return true;
  if (/^(skip|play|pause|settings|audio|subtitle|continue watching|next episode)\b/i.test(normalized)) {
    return true;
  }
  return (
    words.length <= 3 &&
    !/[.!?,"'-]/u.test(normalized) &&
    words.every((word) => /^[A-Z][a-z]+$/.test(word))
  );
}

export function buildTranslationWindow(history, caption, windowSize) {
  const contextCaptions = history.filter(Boolean).slice(-windowSize);
  if (contextCaptions[contextCaptions.length - 1] === caption) {
    return {
      fullText: contextCaptions.join("\n"),
      prefixText: contextCaptions.slice(0, -1).join("\n")
    };
  }
  const fullCaptions = [...contextCaptions, caption];
  return {
    fullText: fullCaptions.join("\n"),
    prefixText: fullCaptions.slice(0, -1).join("\n")
  };
}

export function translationCacheKey({ text, contextLines = [], targetLanguage, contextSize }) {
  return `local:${contextSize}\n${targetLanguage}\n${contextLines.join("\n")}\n---\n${text}`;
}
