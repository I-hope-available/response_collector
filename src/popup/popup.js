(() => {
  "use strict";

  const totalCount = document.getElementById("total-count");
  const positiveCount = document.getElementById("positive-count");
  const negativeCount = document.getElementById("negative-count");
  const exportButton = document.getElementById("export-button");
  const status = document.getElementById("status");

  async function renderCounts() {
    const counts = await window.ResponseCollectorStorage.getStats();
    totalCount.textContent = String(counts.total);
    positiveCount.textContent = String(counts.positive);
    negativeCount.textContent = String(counts.negative);
  }

  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    status.textContent = "Preparing export…";

    try {
      const samples = await window.ResponseCollectorStorage.getSamples();
      await window.ResponseCollectorExport.downloadJSONL(samples);
      status.textContent = `Exported ${samples.length} sample${samples.length === 1 ? "" : "s"}.`;
    } catch (error) {
      console.debug("[response-collector] export failed", error);
      status.textContent = "Export failed. Check the browser console.";
    } finally {
      exportButton.disabled = false;
    }
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[window.ResponseCollectorStorage.STORAGE_KEY]) {
      void renderCounts();
    }
  });

  void renderCounts();
})();
