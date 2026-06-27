export function openHelpModal(): void {
  const overlay = document.createElement("div");
  overlay.className = "overlay show";
  overlay.setAttribute("role", "dialog");

  const modal = document.createElement("div");
  modal.className = "modal switch-modal";
  modal.innerHTML = `
    <div class="modal-header">How to use HomePad</div>
    <div class="modal-body">
      <div class="help-grid">
        <section class="help-card">
          <div class="section-title">Getting Started</div>
          <ul class="guide-list">
            <li>Open <b>Settings</b> and set the folder for each emulator.</li>
            <li class="muted">Optional: choose a <b>Default download folder</b>.</li>
            <li>Click a console tile to launch.</li>
          </ul>
        </section>
        <section class="help-card">
          <div class="section-title">Downloader</div>
          <ul class="guide-list">
            <li>Select an emulator and press <span class="kbd">Download</span>.</li>
            <li>HomePad downloads the latest release and shows a popup when done.</li>
          </ul>
        </section>
      </div>
      <div class="help-disclaimer" role="note" aria-label="Disclaimer">
        Disclaimer: HomePad is an independent launcher and is not affiliated with or endorsed by Nintendo or any other company. Use emulators and BIOS/keys only where you have the legal right to do so. No copyrighted content is included or distributed by this application. All trademarks and copyrights belong to their respective owners.
      </div>
    </div>
    <div class="modal-footer hint-bar">
      <button class="hint primary" id="btn-close-help" aria-label="Close" title="Close">
        <span class="glyph"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><span>Close</span>
      </button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };

  const close = (): void => {
    document.removeEventListener("keydown", onKeydown);
    modal.classList.remove("jump-in");
    modal.classList.add("modal-exit");
    modal.addEventListener(
      "animationend",
      () => {
        overlay.remove();
      },
      { once: true },
    );
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector("#btn-close-help")?.addEventListener("click", close);
  document.addEventListener("keydown", onKeydown);
}
