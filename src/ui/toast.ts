type ToastType = "info" | "success" | "error" | "warning";

const ICONS: Record<string, string> = {
  success:
    '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M20 7L9 18l-5-5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
  error:
    '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke-width="2"></circle><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke-width="2" stroke-linecap="round"></path></svg>',
  warning:
    '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M12 3l9 16H3l9-16z" fill="none" stroke-width="2"></path><path d="M12 9v5" stroke-width="2" stroke-linecap="round"></path><circle cx="12" cy="17" r="1.2"></circle></svg>',
};

const CONTAINER_KEY = "__homepad_toast_container";
const DUPE_WINDOW_MS = 800;
const VISIBLE_MS = 1800;

interface ToastNode extends HTMLDivElement {
  _toastTimer?: ReturnType<typeof setTimeout>;
}

export function showPopup(message: string, type: ToastType = "info"): void {
  try {
    const now = Date.now();
    const msg = String(message || "");

    let container = (window as any)[CONTAINER_KEY] as HTMLElement | undefined;
    if (!container || !document.body.contains(container)) {
      container = document.createElement("div");
      container.className = "toast-stack";
      document.body.appendChild(container);
      (window as any)[CONTAINER_KEY] = container;
    }

    for (const n of Array.from(container.children)) {
      if (!(n instanceof HTMLElement)) continue;
      const lastType = n.getAttribute("data-type");
      const lastMsg = n.getAttribute("data-msg");
      const ts = Number(n.getAttribute("data-ts") || 0);
      if (lastType === type && lastMsg === msg && now - ts < DUPE_WINDOW_MS) {
        const node = n as ToastNode;
        node.setAttribute("data-ts", String(now));
        try {
          clearTimeout(node._toastTimer);
        } catch {}
        try {
          node.classList.remove("auto-dismiss");
          void node.offsetWidth;
          node.classList.add("auto-dismiss");
          node.style.setProperty("--toast-duration", `${VISIBLE_MS}ms`);
        } catch {}
        node._toastTimer = setTimeout(() => hideAndRemove(node), VISIBLE_MS);
        node.classList.remove("visible");
        requestAnimationFrame(() => node.classList.add("visible"));
        return;
      }
    }

    const el = document.createElement("div") as ToastNode;
    el.className = `popup ${type} auto-dismiss`;
    const icon = document.createElement("span");
    icon.innerHTML = ICONS[type] || "";
    const span = document.createElement("span");
    span.textContent = msg;
    if (icon.firstChild) el.appendChild(icon.firstChild);
    el.appendChild(span);
    el.setAttribute("role", "status");
    el.setAttribute("data-type", type);
    el.setAttribute("data-msg", msg);
    el.setAttribute("data-ts", String(now));
    el.style.setProperty("--toast-duration", `${VISIBLE_MS}ms`);
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("visible"));
    el._toastTimer = setTimeout(() => hideAndRemove(el), VISIBLE_MS);
  } catch {}
}

function hideAndRemove(node: HTMLElement): void {
  try {
    node.classList.add("hiding");
    node.classList.remove("visible");
    const cleanup = () => {
      try {
        node.remove();
      } catch {}
    };
    node.addEventListener("animationend", cleanup, { once: true });
    node.addEventListener("transitionend", cleanup, { once: true });
    setTimeout(cleanup, 600);
  } catch {}
}
