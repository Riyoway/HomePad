const DEBUG_SCROLL = false;

interface AppsScrollEl extends HTMLElement {
  _inertiaRAF?: number;
}

const WHEEL_LINE_PX = 16;
const WHEEL_MULTIPLIER = 3;
const WHEEL_MIN_STEP = 40;

function wheelDeltaToPixels(e: WheelEvent): number {
  const base = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const factor = e.deltaMode === 1 ? WHEEL_LINE_PX : 1;
  let px = base * factor * WHEEL_MULTIPLIER;
  if (e.shiftKey) px *= 1.5;
  if (px !== 0 && Math.abs(px) < WHEEL_MIN_STEP) px = Math.sign(px) * WHEEL_MIN_STEP;
  return px;
}

function computeScrollStep(scrollEl: HTMLElement | null): number {
  if (!scrollEl) return WHEEL_MIN_STEP;
  const card = scrollEl.querySelector(".app-card");
  const cardWidth = card ? card.getBoundingClientRect().width : 0;
  const gap = 24;
  const byCard = cardWidth > 0 ? cardWidth + gap : 0;
  const byViewport = Math.floor(scrollEl.clientWidth * 0.3);
  const candidate = Math.max(WHEEL_MIN_STEP, byCard || byViewport || WHEEL_MIN_STEP);
  return candidate;
}

export function initAppsScroller(): void {
  const el = document.getElementById("apps") as AppsScrollEl | null;
  if (!el) return;
  if (el.dataset.scrollerInit === "1") {
    updateEdgeFades();
    return;
  }
  el.dataset.scrollerInit = "1";

  const clampScroll = () => {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    if (el.scrollLeft < 0) el.scrollLeft = 0;
    else if (el.scrollLeft > max) el.scrollLeft = max;
  };

  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", "Applications");
  el.setAttribute("aria-roledescription", "Carousel");

  const onWheel = (e: WheelEvent) => {
    let delta = wheelDeltaToPixels(e);
    const minStep = computeScrollStep(el);
    if (delta !== 0 && Math.abs(delta) < minStep) delta = Math.sign(delta) * minStep;
    if (delta === 0) return;
    if (DEBUG_SCROLL) {
      try {
        console.log("[scroll] #apps onWheel", {
          dx: e.deltaX,
          dy: e.deltaY,
          mode: e.deltaMode,
          before: el.scrollLeft,
          delta,
          minStep,
        });
      } catch {}
    }
    el.scrollLeft += delta;
    clampScroll();
    if (DEBUG_SCROLL) {
      try {
        console.log("[scroll] #apps onWheel after", { after: el.scrollLeft });
      } catch {}
    }
    e.preventDefault();
  };
  el.addEventListener("wheel", onWheel, { passive: false });

  let isDown = false;
  let startX = 0;
  let startLeft = 0;
  let isDragging = false;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let rafId = 0;
  const DRAG_THRESHOLD = 6;
  const onPointerDown = (e: PointerEvent) => {
    if (el._inertiaRAF) {
      try {
        cancelAnimationFrame(el._inertiaRAF);
      } catch {}
      el._inertiaRAF = 0;
    }
    isDown = true;
    isDragging = false;
    startX = e.clientX;
    startLeft = el.scrollLeft;
    lastX = e.clientX;
    lastT = performance.now();
    velocity = 0;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    if (!isDragging && Math.abs(dx) >= DRAG_THRESHOLD) {
      isDragging = true;
      el.style.scrollBehavior = "auto";
      el.classList.add("dragging");
      el.setPointerCapture?.(e.pointerId);
    }
    if (isDragging) {
      el.scrollLeft = startLeft - dx;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = now;
      e.preventDefault();
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (isDragging) {
      el.classList.remove("dragging");
      el.style.scrollBehavior = "";
      el.releasePointerCapture?.(e.pointerId);
      const maxVelocity = 2.5;
      let v = Math.max(-maxVelocity, Math.min(maxVelocity, -velocity * 800));
      const friction = 0.92;
      const step = () => {
        if (Math.abs(v) < 0.2) {
          rafId && cancelAnimationFrame(rafId);
          updateEdgeFades();
          return;
        }
        el.scrollLeft += v;
        const min = 0;
        const max = el.scrollWidth - el.clientWidth;
        if (el.scrollLeft <= min || el.scrollLeft >= max) {
          clampScroll();
          rafId && cancelAnimationFrame(rafId);
          updateEdgeFades();
          return;
        }
        v *= friction;
        rafId = requestAnimationFrame(step);
        el._inertiaRAF = rafId;
      };
      rafId = requestAnimationFrame(step);
      el._inertiaRAF = rafId;
    }
    isDown = false;
    isDragging = false;
  };
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointerleave", () => {
    isDown = false;
    el.classList.remove("dragging");
    el.style.scrollBehavior = "";
  });

  const applyRovingTabindex = () => {
    const cards = Array.from(el.querySelectorAll(".app-card"));
    if (!cards.length) return;
    const current = cards.find((c) => c.getAttribute("tabindex") === "0");
    if (!current) {
      cards.forEach((c, i) => c.setAttribute("tabindex", i === 0 ? "0" : "-1"));
    }
  };
  applyRovingTabindex();

  el.addEventListener("keydown", (e: KeyboardEvent) => {
    const cards = Array.from(el.querySelectorAll(".app-card")) as HTMLElement[];
    if (!cards.length) return;
    const ae = document.activeElement as HTMLElement | null;
    const active =
      ae && cards.includes(ae)
        ? ae
        : cards.find((c) => c.getAttribute("tabindex") === "0") || cards[0];
    const idx = cards.indexOf(active);

    const moveFocus = (nextIdx: number) => {
      const clamped = Math.max(0, Math.min(cards.length - 1, nextIdx));
      cards.forEach((c, i) => c.setAttribute("tabindex", i === clamped ? "0" : "-1"));
      const target = cards[clamped];
      target.focus();
      target.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    };

    const pageStep = () => el.clientWidth * 0.9;

    switch (e.key) {
      case "ArrowLeft":
        moveFocus(idx - 1);
        e.preventDefault();
        e.stopPropagation();
        break;
      case "ArrowRight":
        moveFocus(idx + 1);
        e.preventDefault();
        e.stopPropagation();
        break;
      case "Home":
        moveFocus(0);
        e.preventDefault();
        e.stopPropagation();
        break;
      case "End":
        moveFocus(cards.length - 1);
        e.preventDefault();
        e.stopPropagation();
        break;
      case "PageUp":
        el.scrollBy({ left: -pageStep(), behavior: "smooth" });
        e.preventDefault();
        e.stopPropagation();
        break;
      case "PageDown":
        el.scrollBy({ left: pageStep(), behavior: "smooth" });
        e.preventDefault();
        e.stopPropagation();
        break;
      case "Enter":
      case " ":
        if (active && typeof active.click === "function") active.click();
        e.preventDefault();
        e.stopPropagation();
        break;
      default:
        break;
    }
  });

  ensureNavArrows(el);
  const content = document.querySelector(".content") as HTMLElement | null;
  if (content && content.dataset.wheelProxy !== "1") {
    content.dataset.wheelProxy = "1";
    const onContentWheel = (e: WheelEvent) => {
      if (!e || document.querySelector(".overlay.show")) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest(".modal, .overlay, .text, .select")) return;
      let delta = wheelDeltaToPixels(e);
      const minStep = computeScrollStep(el);
      if (delta !== 0 && Math.abs(delta) < minStep) delta = Math.sign(delta) * minStep;
      if (delta === 0) return;
      if (DEBUG_SCROLL) {
        try {
          console.log("[scroll] .content proxy", {
            dx: e.deltaX,
            dy: e.deltaY,
            mode: e.deltaMode,
            before: el.scrollLeft,
            delta,
            minStep,
            target: t?.className || t?.id,
          });
        } catch {}
      }
      el.scrollLeft += delta;
      clampScroll();
      if (DEBUG_SCROLL) {
        try {
          console.log("[scroll] .content proxy after", { after: el.scrollLeft });
        } catch {}
      }
      e.preventDefault();
    };
    content.addEventListener("wheel", onContentWheel, { passive: false });
  }
  const onScroll = () => updateEdgeFades();
  el.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  updateEdgeFades();
  el.querySelectorAll("img").forEach((img) =>
    img.addEventListener("load", () => updateEdgeFades(), { once: true })
  );
  const ResizeObserverCtor =
    window.ResizeObserver ||
    (class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver);
  const ro = new ResizeObserverCtor(() => {
    updateEdgeFades();
  });
  ro.observe(el);
  const mo = new MutationObserver(() => updateEdgeFades());
  mo.observe(el, { childList: true, subtree: true });
}

function ensureNavArrows(scrollEl: HTMLElement): void {
  const content = document.querySelector(".content");
  if (!content) return;
  let left = content.querySelector(".nav-arrow.left") as HTMLButtonElement | null;
  let right = content.querySelector(".nav-arrow.right") as HTMLButtonElement | null;
  if (!left) {
    left = document.createElement("button");
    left.className = "nav-arrow left";
    left.setAttribute("aria-label", "Previous");
    left.setAttribute("aria-controls", "apps");
    left.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>';
    content.appendChild(left);
  }
  if (!right) {
    right = document.createElement("button");
    right.className = "nav-arrow right";
    right.setAttribute("aria-label", "Next");
    right.setAttribute("aria-controls", "apps");
    right.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
    content.appendChild(right);
  }

  const stepCalc = () => {
    const card = scrollEl.querySelector(".app-card");
    const cardWidth = card ? card.getBoundingClientRect().width : 260;
    const gap = 24;
    return cardWidth + gap;
  };

  left.onclick = () => scrollEl.scrollBy({ left: -stepCalc(), behavior: "smooth" });
  right.onclick = () => scrollEl.scrollBy({ left: stepCalc(), behavior: "smooth" });
}

function updateEdgeFades(): void {
  const content = document.querySelector(".content");
  const el = document.getElementById("apps");
  if (!content || !el) return;
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const EPS = 8;
  const atStart = el.scrollLeft <= EPS;
  const atEnd = max - el.scrollLeft <= EPS;

  content.classList.toggle("at-start", atStart);
  content.classList.toggle("at-end", atEnd);

  const left = content.querySelector(".nav-arrow.left");
  const right = content.querySelector(".nav-arrow.right");
  const hasOverflow = el.scrollWidth > el.clientWidth + 2;
  if (left && right) {
    if (!hasOverflow) {
      left.classList.add("hidden");
      right.classList.add("hidden");
      left.setAttribute("aria-disabled", "true");
      right.setAttribute("aria-disabled", "true");
    } else {
      left.classList.toggle("hidden", atStart);
      right.classList.toggle("hidden", atEnd);
      left.setAttribute("aria-disabled", String(atStart));
      right.setAttribute("aria-disabled", String(atEnd));
    }
  }
}

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  if (document.querySelector(".overlay.show")) return;
  const ae = document.activeElement as HTMLElement | null;
  const tag = (ae?.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag) || ae?.isContentEditable) return;
  const el = document.getElementById("apps");
  if (!el) return;
  if (ae && el.contains(ae)) return;
  const cards = Array.from(el.querySelectorAll(".app-card")) as HTMLElement[];
  if (!cards.length) return;
  const active =
    ae && cards.includes(ae)
      ? ae
      : cards.find((c) => c.getAttribute("tabindex") === "0") || cards[0];
  const idx = cards.indexOf(active);
  const moveFocus = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(cards.length - 1, nextIdx));
    cards.forEach((c, i) => c.setAttribute("tabindex", i === clamped ? "0" : "-1"));
    const target = cards[clamped];
    target.focus();
    target.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  };
  switch (e.key) {
    case "ArrowLeft":
      moveFocus(idx - 1);
      e.preventDefault();
      e.stopPropagation();
      break;
    case "ArrowRight":
      moveFocus(idx + 1);
      e.preventDefault();
      e.stopPropagation();
      break;
    case "Home":
      moveFocus(0);
      e.preventDefault();
      e.stopPropagation();
      break;
    case "End":
      moveFocus(cards.length - 1);
      e.preventDefault();
      e.stopPropagation();
      break;
  }
});

(function installGlobalWheelFallback() {
  if (document.documentElement.dataset.wheelFallback === "1") return;
  document.documentElement.dataset.wheelFallback = "1";
  const handler = (e: WheelEvent) => {
    if (document.querySelector(".overlay.show")) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest && t.closest(".modal, .overlay, .text, .select")) return;
    if (t && t.closest && t.closest("#apps")) return;
    const el = document.getElementById("apps");
    if (!el) return;
    let delta = wheelDeltaToPixels(e);
    const minStep = computeScrollStep(el);
    if (delta !== 0 && Math.abs(delta) < minStep) delta = Math.sign(delta) * minStep;
    if (delta === 0) return;
    if (DEBUG_SCROLL) {
      try {
        console.log("[scroll] global fallback", {
          dx: e.deltaX,
          dy: e.deltaY,
          mode: e.deltaMode,
          before: el.scrollLeft,
          delta,
          minStep,
          target: t?.className || t?.id,
        });
      } catch {}
    }
    el.scrollLeft += delta;
    if (DEBUG_SCROLL) {
      try {
        console.log("[scroll] global fallback after", { after: el.scrollLeft });
      } catch {}
    }
    e.preventDefault();
  };
  window.addEventListener("wheel", handler, { passive: false });
})();
