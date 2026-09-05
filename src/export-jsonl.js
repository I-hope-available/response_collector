(() => {
  "use strict";

  function toExportableSample(sample) {
    return {
      id: sample.id,
      source: sample.source,
      url: sample.url,
      collected_at: sample.collected_at,
      label: sample.label,
      context: Array.isArray(sample.context)
        ? sample.context.map((message) => ({
            role: message.role,
            content: message.content
          }))
        : [],
      response: sample.response
    };
  }

  function serializeJSONL(samples) {
    return samples.map(toExportableSample).map(JSON.stringify).join("\n");
  }

  async function downloadJSONL(samples) {
    const text = serializeJSONL(samples);
    const blob = new Blob([text], { type: "application/x-ndjson;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `response-collector-${date}.jsonl`;

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);

    try {
      anchor.click();
      return null;
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    }
  }

  window.ResponseCollectorExport = Object.freeze({
    serializeJSONL,
    downloadJSONL
  });
})();
