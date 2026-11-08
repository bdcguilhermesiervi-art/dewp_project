(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Smooth scroll for internal links (sidebar, CTAs) ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      }
    });
  });

  /* ---------- Reveal on scroll (fade + slide, one-shot) ---------- */
  const revealEls = document.querySelectorAll(".reveal");

  if (reduceMotion) {
    revealEls.forEach((el) => el.classList.add("in-view"));
  } else if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  /* ---------- Active section in the sidebar ---------- */
  const sections = document.querySelectorAll(".section[id]");
  const navDots = document.querySelectorAll(".nav-dot");

  if ("IntersectionObserver" in window && sections.length) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navDots.forEach((dot) => {
              dot.classList.toggle("active", dot.dataset.section === id);
            });
          }
        });
      },
      { threshold: 0.55 }
    );
    sections.forEach((s) => navObserver.observe(s));
  }

  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  // True once the page has scrolled as far as it can go. Scroll-linked
  // reveals target a position a given element would reach with "enough"
  // scrolling below it — but for content near the end of the page there
  // isn't always enough room left to scroll, so without this guard the
  // last section's bottom row can get stuck mid-reveal forever. A small
  // (2px) tolerance absorbs rounding from browser zoom / fractional pixels.
  function isAtPageBottom() {
    const doc = document.documentElement;
    return window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
  }

  /* ---------- Per-section scroll progress (for "scrubbing" animations) ---------- */
  function sectionProgress(el) {
    if (isAtPageBottom()) return 1;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const total = rect.height + vh;
    const scrolled = vh - rect.top;
    return Math.min(1, Math.max(0, scrolled / total));
  }

  // --- (b) Section background: "generated" gradually as you scroll ---
  const howSection = document.getElementById("como-funciona");
  const howBg = document.getElementById("howBg");

  if (reduceMotion && howBg) {
    howBg.style.setProperty("--reveal", "1");
  }

  // --- (c) Performance chart ---
  const advSection = document.getElementById("vantagens");
  const bars = document.querySelectorAll(".bar");
  const trendLine = document.querySelector(".trend-line");
  let trendLength = 0;

  if (trendLine) {
    trendLength = trendLine.getTotalLength();
    if (reduceMotion) {
      trendLine.style.strokeDasharray = "none";
    } else {
      trendLine.style.strokeDasharray = String(trendLength);
      trendLine.style.strokeDashoffset = String(trendLength);
    }
  }

  if (reduceMotion && bars.length) {
    bars.forEach((bar) => {
      const h = parseFloat(bar.dataset.h);
      bar.setAttribute("height", h);
      bar.setAttribute("y", 260 - h);
    });
  }

  /* ---------- Words "generated" one by one as you scroll ---------- */
  // Wraps every word of an element's text in its own <span class="word">,
  // walking through child nodes so inline tags (like <strong>) are kept
  // intact — the words inside them just get wrapped too.
  function wrapWordsPreservingTags(el) {
    const words = [];
    function walk(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((part) => {
            if (part === "") return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
            } else {
              const span = document.createElement("span");
              span.className = "word";
              span.textContent = part;
              frag.appendChild(span);
              words.push(span);
            }
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    }
    walk(el);
    return words;
  }

  // Progress of a single element crossing the viewport, independent of how
  // tall its parent section is. 0 exactly when the element's top is at the
  // BOTTOM edge of the viewport (it has not appeared yet at all), 1 once
  // its top has scrolled up to `triggerFrac` of the viewport height — so
  // the whole 0→1 range plays out while the element is actually visible,
  // not partly before it even enters the screen.
  // `travelFrac` is how much of the viewport height the element needs to
  // travel, measured from the moment it first starts entering at the
  // bottom edge — NOT a fixed target position near the top. The previous
  // version required the element to climb all the way up to a specific
  // absolute spot (e.g. 28% down the viewport), which for a user who
  // naturally stops scrolling once text is comfortably readable (usually
  // 35-55% down, well before that) meant it never finished. This version
  // always completes after a short, predictable amount of scrolling,
  // regardless of where the element ends up resting on screen.
  function elementRevealProgress(el, travelFrac) {
    if (isAtPageBottom()) return 1;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const travelPx = Math.max(vh * travelFrac, 150);
    return clamp01((vh - rect.top) / travelPx);
  }

  function setWordsRevealed(words) {
    words.forEach((w) => {
      w.style.opacity = "1";
      w.style.filter = "none";
      w.style.transform = "none";
    });
  }

  // One text line (e.g. a whole <h2> or <p>) worth of word spans, tied to
  // its own element so the cascade plays out while THAT line is scrolling
  // into view — not shared/diluted across the whole section's height.
  function makeWordLine(el, triggerFrac) {
    if (!el) return null;
    const words = wrapWordsPreservingTags(el);
    if (reduceMotion) setWordsRevealed(words);
    return { el, words, triggerFrac };
  }

  // Ratchet: scroll-driven reveals only ever move forward. Without this,
  // visibility is a pure function of the CURRENT scroll position, so if
  // the user's scroll comes to rest even slightly before the exact target
  // (e.g. 97% there), it looks permanently stuck — and scrolling back up
  // would un-reveal it too. Once something has been scrolled far enough to
  // be (nearly) fully shown, it latches and stays shown from then on.
  const revealWatermarks = new WeakMap();
  function watermark(el, value) {
    const prev = revealWatermarks.get(el) || 0;
    const next = Math.max(prev, value);
    revealWatermarks.set(el, next);
    return next;
  }

  function updateWordLine(line) {
    if (!line || !line.words.length) return;
    const progress = watermark(line.el, elementRevealProgress(line.el, line.triggerFrac));
    const n = line.words.length;
    // span is each word's own fade width, in the line's normalized 0–1
    // progress space. Word centers are packed into [span/2, 1-span/2]
    // (not the full [0,1]) so the LAST word's fade-in window ends exactly
    // at progress=1 instead of needing progress>1 (impossible — it's
    // clamped) to ever reach full opacity.
    const span = Math.min(Math.max(n > 1 ? 1.5 / n : 0.4, 0.12), 0.85);
    line.words.forEach((word, i) => {
      const t = n > 1 ? span / 2 + (i / (n - 1)) * (1 - span) : 0.5;
      const wp = clamp01((progress - (t - span / 2)) / span);
      word.style.opacity = String(wp);
      word.style.filter = wp > 0.96 ? "none" : `blur(${(1 - wp) * 5}px)`;
      word.style.transform = wp > 0.96 ? "none" : `translateY(${(1 - wp) * 10}px)`;
    });
  }

  // travelFrac = how much of the viewport height of scrolling the cascade
  // takes to finish, starting from when the line first appears at the
  // bottom edge. Kicker/h2/p are stacked, so they still naturally cascade
  // one after another even though each uses a similarly short distance.
  const wordLines = [
    makeWordLine(document.querySelector("#como-funciona .how-text .section-kicker"), 0.16),
    makeWordLine(document.querySelector("#como-funciona .how-text h2"), 0.22),
    makeWordLine(document.querySelector("#como-funciona .how-text p"), 0.3),
    makeWordLine(document.querySelector("#vantagens .adv-text > .section-kicker"), 0.16),
    makeWordLine(document.querySelector("#vantagens .adv-text > h2"), 0.22),
  ].filter(Boolean);

  // --- Advantage cards: materialize (fade + blur) one by one as you scroll ---
  const cards = document.querySelectorAll(".card-stream");

  if (reduceMotion && cards.length) {
    cards.forEach((card) => {
      card.style.opacity = "1";
      card.style.filter = "none";
    });
  }

  function updateCards() {
    if (!cards.length) return;
    cards.forEach((card) => {
      // top row reaches the trigger before the bottom row (they're lower
      // on the page), so the 2x2 grid naturally fills in row by row
      // instead of all four cards popping in together
      const progress = watermark(card, elementRevealProgress(card, 0.3));
      card.style.opacity = String(progress);
      card.style.filter = progress > 0.97 ? "none" : `blur(${(1 - progress) * 6}px)`;
    });
  }

  function updateScrollAnimations() {
    if (reduceMotion) return;

    if (howSection && howBg) {
      const progress = watermark(howBg, clamp01(sectionProgress(howSection) * 1.25));
      howBg.style.setProperty("--reveal", String(progress));
    }

    wordLines.forEach(updateWordLine);
    updateCards();

    if (advSection && bars.length) {
      const progress = watermark(advSection, sectionProgress(advSection));
      bars.forEach((bar, i) => {
        const eased = clamp01(progress * 1.6 - i * 0.12);
        const fullH = parseFloat(bar.dataset.h);
        const h = fullH * eased;
        bar.setAttribute("height", h);
        bar.setAttribute("y", 260 - h);
      });

      if (trendLine) {
        const eased = clamp01(progress * 1.4 - 0.25);
        trendLine.style.strokeDashoffset = String(trendLength * (1 - eased));
      }
    }
  }

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        updateScrollAnimations();
        ticking = false;
      });
    }
  }

  if (!reduceMotion) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateScrollAnimations();
  }

  /* ---------- Chat widget — Morpheus assistant ---------- */
  const fab = document.getElementById("helpFab");
  const widget = document.getElementById("chatWidget");
  const closeBtn = document.getElementById("chatClose");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");

  const morpheusReplies = [
    "I'm still learning the ropes here — real conversation is coming soon! 👋",
    "Soon I'll be able to answer with dewp's full context. For now, I'm just a preview!",
    "Good question! This part is still being built, but I'm glad to already be here with you.",
  ];
  let replyIndex = 0;
  let greeted = false;

  function addMessage(type, text) {
    const bubble = document.createElement("div");
    bubble.className = `msg ${type}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function openChat() {
    widget.classList.add("open");
    widget.setAttribute("aria-hidden", "false");
    fab.setAttribute("aria-expanded", "true");
    if (!greeted) {
      greeted = true;
      setTimeout(() => {
        addMessage("bot", "Hi! I'm Morpheus 👋 How can I help you?");
      }, 350);
    }
    input.focus();
  }

  function closeChat() {
    widget.classList.remove("open");
    widget.setAttribute("aria-hidden", "true");
    fab.setAttribute("aria-expanded", "false");
  }

  if (fab && widget) {
    fab.addEventListener("click", () => {
      widget.classList.contains("open") ? closeChat() : openChat();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeChat);
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      addMessage("user", value);
      input.value = "";
      setTimeout(() => {
        addMessage("bot", morpheusReplies[replyIndex % morpheusReplies.length]);
        replyIndex++;
      }, 500);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && widget && widget.classList.contains("open")) {
      closeChat();
    }
  });
})();
