(() => {
  "use strict";

  const STORAGE_KEY = "responseCollector.samples";
  const ALLOWED_LABELS = new Set(["positive", "negative"]);
  const ALLOWED_ROLES = new Set(["user", "assistant"]);
  let writeQueue = Promise.resolve();

  function hashString(value, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function createId({ source, url, context, response }) {
    const fingerprint = JSON.stringify({ source, url, context, response });
    return `sample-${hashString(fingerprint, 2166136261)}${hashString(fingerprint, 2246822519)}`;
  }

  function normalizeContext(context) {
    if (!Array.isArray(context)) {
      return [];
    }

    return context
      .slice(0, 3)
      .map((message) => ({
        role: String(message?.role || ""),
        content: typeof message?.content === "string" ? message.content.trim() : ""
      }))
      .filter((message) => ALLOWED_ROLES.has(message.role) && message.content);
  }

  function normalizeSample(sample) {
    if (!sample || !ALLOWED_LABELS.has(sample.label)) {
      return null;
    }

    const response = typeof sample.response === "string" ? sample.response.trim() : "";
    if (!response) {
      return null;
    }

    const source = String(sample.source || "qwen");
    const url = String(sample.url || "");
    const context = normalizeContext(sample.context);
    const id = String(sample.id || createId({ source, url, context, response }));

    return {
      id,
      source,
      url,
      collected_at: String(sample.collected_at || new Date().toISOString()),
      label: sample.label,
      context,
      response
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function readSamples() {
    const result = await browser.storage.local.get(STORAGE_KEY);
    const samples = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    return samples.map(normalizeSample).filter(Boolean);
  }

  async function writeSamples(samples) {
    await browser.storage.local.set({
      [STORAGE_KEY]: samples.map(normalizeSample).filter(Boolean)
    });
  }

  function enqueueWrite(operation) {
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => undefined);
    return result;
  }

  async function getSamples() {
    return clone(await readSamples());
  }

  async function findById(id) {
    const samples = await readSamples();
    const sample = samples.find((item) => item.id === id);
    return sample ? clone(sample) : null;
  }

  async function upsertSample(sample) {
    return enqueueWrite(async () => {
      const normalized = normalizeSample(sample);
      if (!normalized) {
        throw new Error("Cannot store an empty or invalid sample.");
      }

      const samples = await readSamples();
      const existingIndex = samples.findIndex((item) => item.id === normalized.id);

      if (existingIndex === -1) {
        samples.push(normalized);
        await writeSamples(samples);
        return { status: "created", sample: clone(normalized) };
      }

      const existing = samples[existingIndex];
      if (existing.label === normalized.label) {
        return { status: "duplicate", sample: clone(existing) };
      }

      samples[existingIndex] = normalized;
      await writeSamples(samples);
      return { status: "reclassified", sample: clone(normalized) };
    });
  }

  async function getStats() {
    const samples = await readSamples();
    return {
      total: samples.length,
      positive: samples.filter((sample) => sample.label === "positive").length,
      negative: samples.filter((sample) => sample.label === "negative").length
    };
  }

  window.ResponseCollectorStorage = Object.freeze({
    STORAGE_KEY,
    createId,
    getSamples,
    findById,
    getStats,
    upsertSample
  });
})();
