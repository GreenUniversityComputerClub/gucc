"use client";

import React, { useEffect, useRef } from "react";

function getLanguageLabel(codeEl: HTMLElement | null, preEl: HTMLElement): string {
  // Check data attributes first
  const dataLang = preEl.getAttribute("data-language") || preEl.getAttribute("data-lang") || codeEl?.getAttribute("data-language") || codeEl?.getAttribute("data-lang");
  if (dataLang) return formatLangName(dataLang);

  // Check class list on code and pre
  const classList = `${preEl.className} ${codeEl?.className || ""}`;
  const match = classList.match(/language-([a-zA-Z0-9_+-]+)/i) || classList.match(/lang-([a-zA-Z0-9_+-]+)/i);
  if (match && match[1]) {
    return formatLangName(match[1]);
  }

  // Detect based on content
  const text = (codeEl?.textContent || preEl.textContent || "").trim();
  if (text.startsWith("pip ") || text.startsWith("!pip ") || text.startsWith("npm ") || text.startsWith("git ") || text.startsWith("bun ") || text.startsWith("yarn ") || text.startsWith("pnpm ")) {
    return "Terminal";
  }

  return "Code";
}

function formatLangName(lang: string): string {
  const lower = lang.toLowerCase();
  switch (lower) {
    case "bash":
    case "sh":
    case "shell":
    case "zsh":
      return "Bash";
    case "terminal":
    case "console":
    case "cmd":
      return "Terminal";
    case "python":
    case "py":
      return "Python";
    case "cpp":
    case "c++":
      return "C++";
    case "c":
      return "C";
    case "java":
      return "Java";
    case "javascript":
    case "js":
      return "JavaScript";
    case "typescript":
    case "ts":
      return "TypeScript";
    case "jsx":
      return "JSX";
    case "tsx":
      return "TSX";
    case "json":
      return "JSON";
    case "yaml":
    case "yml":
      return "YAML";
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "sql":
      return "SQL";
    case "markdown":
    case "md":
      return "Markdown";
    case "text":
    case "txt":
      return "Text";
    default:
      return lang.charAt(0).toUpperCase() + lang.slice(1);
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
    }
  }

  // Fallback for older contexts
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    document.body.removeChild(textArea);
    return false;
  }
}

export default function CodeBlockEnhancer({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const enhanceCodeBlocks = () => {
      const preElements = root.querySelectorAll<HTMLElement>("pre:not([data-enhanced='true'])");

      preElements.forEach((pre) => {
        pre.setAttribute("data-enhanced", "true");

        const codeEl = pre.querySelector<HTMLElement>("code");
        const lang = getLanguageLabel(codeEl, pre);

        // Check if pre is already in a custom code block wrapper
        const parent = pre.parentElement;
        const isAlreadyWrapped = parent?.classList.contains("code-block-container");

        let wrapper: HTMLElement;
        if (isAlreadyWrapped && parent) {
          wrapper = parent;
        } else {
          wrapper = document.createElement("div");
          wrapper.className = "code-block-container my-6 rounded-xl overflow-hidden border border-slate-700/60 dark:border-slate-800 bg-[#0d1117] shadow-lg shadow-black/10 group";
          pre.parentNode?.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);
        }

        // Check if header already exists
        if (!wrapper.querySelector(".code-block-header")) {
          const header = document.createElement("div");
          header.className = "code-block-header flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-slate-700/50 select-none text-xs font-mono";

          // Language badge
          const langBadge = document.createElement("div");
          langBadge.className = "flex items-center gap-2 text-slate-400 font-medium tracking-wide";
          
          // Terminal/Code dot indicator
          const dot = document.createElement("span");
          dot.className = "w-2 h-2 rounded-full bg-emerald-500/80 inline-block";
          langBadge.appendChild(dot);

          const langText = document.createElement("span");
          langText.textContent = lang;
          langBadge.appendChild(langText);

          header.appendChild(langBadge);

          // Copy button
          const copyBtn = document.createElement("button");
          copyBtn.type = "button";
          copyBtn.className = "copy-code-btn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer";
          copyBtn.setAttribute("aria-label", "Copy code");

          // Initial Copy SVG Icon
          const renderCopyIcon = () => `
            <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span class="copy-text">Copy</span>
          `;

          // Copied SVG Icon
          const renderCopiedIcon = () => `
            <svg class="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in-50 duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
            <span class="copy-text text-emerald-400 font-semibold">Copied!</span>
          `;

          copyBtn.innerHTML = renderCopyIcon();

          let timeoutId: ReturnType<typeof setTimeout> | null = null;

          copyBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Extract pure code
            let rawCode = codeEl ? codeEl.innerText : pre.innerText;
            // Clean up any extraneous carriage returns
            rawCode = rawCode.replace(/\r\n/g, "\n").trim();

            const success = await copyTextToClipboard(rawCode);
            if (success) {
              copyBtn.innerHTML = renderCopiedIcon();
              copyBtn.classList.add("text-emerald-400");

              if (timeoutId) clearTimeout(timeoutId);
              timeoutId = setTimeout(() => {
                copyBtn.innerHTML = renderCopyIcon();
                copyBtn.classList.remove("text-emerald-400");
              }, 2000);
            }
          });

          header.appendChild(copyBtn);
          wrapper.insertBefore(header, pre);
        }

        // Ensure pre styling
        pre.className = "p-4 overflow-x-auto text-[0.875rem] leading-relaxed text-slate-100 font-mono bg-[#0d1117] focus:outline-none focus:ring-1 focus:ring-emerald-500/30 rounded-b-xl";
      });
    };

    enhanceCodeBlocks();

    // Use MutationObserver for any client-rendered changes
    const observer = new MutationObserver(enhanceCodeBlocks);
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef}>{children}</div>;
}
