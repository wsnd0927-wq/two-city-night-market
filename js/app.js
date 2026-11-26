(function () {
  "use strict";

  const data = window.NIGHT_MARKET;
  if (!data) {
    return;
  }

  const { stalls, ui, ranks } = data;
  const STORAGE_KEY = "two-city-night-market:v1";
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

  const els = {
    soundToggle: document.getElementById("soundToggle"),
    soundLabel: document.getElementById("soundLabel"),
    openPassport: document.getElementById("openPassport"),
    passportCount: document.getElementById("passportCount"),
    homeButton: document.getElementById("homeButton"),
    introView: document.getElementById("introView"),
    startButton: document.getElementById("startButton"),
    startButtonCopy: document.getElementById("startButtonCopy"),
    previewPassportButton: document.getElementById("previewPassportButton"),
    introResetButton: document.getElementById("introResetButton"),
    gameView: document.getElementById("gameView"),
    progressTrack: document.getElementById("progressTrack"),
    progressCurrent: document.getElementById("progressCurrent"),
    stallScene: document.getElementById("stallScene"),
    orderPanel: document.querySelector(".order-panel"),
    panelStep: document.getElementById("panelStep"),
    ticketTime: document.getElementById("ticketTime"),
    orderQuote: document.getElementById("orderQuote"),
    challengeTitle: document.getElementById("challengeTitle"),
    choices: document.getElementById("choices"),
    orderNotes: document.getElementById("orderNotes"),
    feedback: document.getElementById("feedback"),
    hintZone: document.getElementById("hintZone"),
    hintButton: document.getElementById("hintButton"),
    hintText: document.getElementById("hintText"),
    resultView: document.getElementById("resultView"),
    resultTitle: document.getElementById("resultTitle"),
    resultRank: document.getElementById("resultRank"),
    resultNote: document.getElementById("resultNote"),
    firstTryCount: document.getElementById("firstTryCount"),
    retryCount: document.getElementById("retryCount"),
    restartButton: document.getElementById("restartButton"),
    copyResultButton: document.getElementById("copyResultButton"),
    printResultButton: document.getElementById("printResultButton"),
    resultStamps: document.getElementById("resultStamps"),
    phraseGrid: document.getElementById("phraseGrid"),
    passportDialog: document.getElementById("passportDialog"),
    closePassport: document.getElementById("closePassport"),
    dialogCount: document.getElementById("dialogCount"),
    dialogProgressFill: document.getElementById("dialogProgressFill"),
    passportEntries: document.getElementById("passportEntries"),
    toast: document.getElementById("toast"),
    liveStatus: document.getElementById("liveStatus"),
    confettiLayer: document.getElementById("confettiLayer")
  };

  const state = {
    phase: "intro",
    step: 0,
    solved: [],
    attempts: {},
    retries: 0,
    sound: false,
    locked: false,
    activeChoices: []
  };

  let toastTimer = 0;
  let confettiTimer = 0;
  let dialogTrigger = null;

  const audio = createAudioController();

  init();

  function init() {
    loadState();
    buildProgressTrack();
    bindEvents();
    renderSound();
    renderHeader();
    renderIntroState();
    showView("intro", false);
    updateProgress();
  }

  /* ── State ───────────────────────────────────────────────── */

  function freshAttempts() {
    const attempts = {};
    stalls.forEach((stall) => {
      attempts[stall.id] = 0;
    });
    return attempts;
  }

  function loadState() {
    state.attempts = freshAttempts();

    let saved = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        saved = JSON.parse(raw);
      }
    } catch (error) {
      saved = null;
    }

    if (!saved || saved.version !== 1) {
      return;
    }

    const validIds = new Set(stalls.map((stall) => stall.id));
    const savedSolved = Array.isArray(saved.solved)
      ? saved.solved.filter((id) => typeof id === "string" && validIds.has(id))
      : [];

    const solvedSet = new Set(savedSolved);
    const prefix = [];
    for (const stall of stalls) {
      if (!solvedSet.has(stall.id)) {
        break;
      }
      prefix.push(stall.id);
    }
    state.solved = prefix;

    if (saved.attempts && typeof saved.attempts === "object") {
      stalls.forEach((stall) => {
        const value = Number(saved.attempts[stall.id]);
        state.attempts[stall.id] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
      });
    }

    const savedRetries = Number(saved.retries);
    state.retries = Number.isFinite(savedRetries)
      ? Math.max(0, Math.floor(savedRetries))
      : Math.max(0, getAttemptTotal() - state.solved.length);

    state.sound = Boolean(saved.sound);

    if (state.solved.length === stalls.length) {
      state.phase = "result";
      state.step = stalls.length;
      return;
    }

    state.phase = saved.phase === "playing" || state.solved.length > 0 ? "playing" : "intro";
    state.step = state.solved.length;
  }

  function saveState() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          phase: state.phase,
          step: state.step,
          solved: state.solved,
          attempts: state.attempts,
          retries: state.retries,
          sound: state.sound
        })
      );
    } catch (error) {
      /* The game still works when storage is unavailable. */
    }
  }

  function resetState(options) {
    const keepSound = !options || options.keepSound !== false;
    state.phase = "playing";
    state.step = 0;
    state.solved = [];
    state.attempts = freshAttempts();
    state.retries = 0;
    state.locked = false;
    state.activeChoices = [];
    if (!keepSound) {
      state.sound = false;
    }
    saveState();
  }

  function getAttemptTotal() {
    return stalls.reduce((sum, stall) => sum + (state.attempts[stall.id] || 0), 0);
  }

  /* ── Rendering — shared ──────────────────────────────────── */

  function renderHeader() {
    const count = state.solved.length;
    els.passportCount.textContent = `${count}/6`;
  }

  function renderIntroState() {
    const hasProgress = state.solved.length > 0 || state.phase === "result";
    let label = ui.start;

    if (state.phase === "result") {
      label = ui.viewResult;
    } else if (state.solved.length > 0) {
      label = ui.continue;
    }

    els.startButtonCopy.innerHTML = bilingual(label.ko, label.zh);
    els.introResetButton.hidden = !hasProgress;
  }

  function renderSound() {
    const label = state.sound ? ui.soundOff : ui.soundOn;
    els.soundLabel.innerHTML = bilingual(label.ko, label.zh);
    els.soundToggle.setAttribute("aria-pressed", String(state.sound));
    els.soundToggle.setAttribute("aria-label", `${label.ko}, ${label.zh}`);
  }

  function buildProgressTrack() {
    els.progressTrack.innerHTML = stalls
      .map(
        (stall) =>
          `<span class="progress-segment" style="--segment-color:${escapeHtml(stall.accent)}"></span>`
      )
      .join("");
  }

  function updateProgress() {
    const segments = Array.from(els.progressTrack.children);
    segments.forEach((segment, index) => {
      const stall = stalls[index];
      const done = state.solved.includes(stall.id);
      segment.classList.toggle("is-done", done);
      segment.classList.toggle(
        "is-current",
        !done && state.phase !== "result" && index === state.step
      );
    });

    const visibleStep = state.phase === "result" ? stalls.length : Math.min(state.step + 1, stalls.length);
    els.progressCurrent.textContent = String(visibleStep);
  }

  function showView(name, doScroll) {
    const views = {
      intro: els.introView,
      game: els.gameView,
      result: els.resultView
    };

    Object.entries(views).forEach(([key, element]) => {
      const active = key === name;
      element.hidden = !active;
      element.classList.toggle("is-active", active);
    });

    document.body.dataset.view = name;

    if (doScroll !== false && name !== "intro") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  /* ── Intro & navigation ──────────────────────────────────── */

  function handleStart() {
    if (state.phase === "result") {
      renderResult();
      showView("result");
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    state.phase = "playing";
    state.step = Math.min(state.solved.length, stalls.length - 1);

    if (state.solved.length >= stalls.length) {
      finishJourney();
      return;
    }

    showView("game");
    renderChallenge();
    window.scrollTo({ top: 0, behavior: "auto" });
    window.setTimeout(focusChallengeHeading, 80);
    audio.ui();
    saveState();
  }

  function handleHome() {
    if (document.body.dataset.view === "intro") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    renderIntroState();
    renderHeader();
    showView("intro");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function handleResetFromIntro() {
    resetState({ keepSound: true });
    renderIntroState();
    renderHeader();
    updateProgress();
    showToast(ui.resetToast);
    audio.ui();
  }

  function handleRestart() {
    resetState({ keepSound: true });
    renderHeader();
    renderIntroState();
    showView("game");
    renderChallenge();
    updateProgress();
    window.scrollTo({ top: 0, behavior: "auto" });
    showToast(ui.resetToast);
    audio.ui();
    window.setTimeout(focusChallengeHeading, 80);
  }

  /* ── Game render ─────────────────────────────────────────── */

  function renderChallenge() {
    const stall = stalls[state.step];
    if (!stall) {
      finishJourney();
      return;
    }

    state.locked = false;
    els.stallScene.style.setProperty("--accent", stall.accent);
    els.stallScene.style.setProperty("--accent-soft", stall.accentSoft);
    els.stallScene.classList.remove("is-solved");
    els.orderPanel.style.setProperty("--ticket-accent", stall.accent);
    els.panelStep.textContent = stall.number;
    els.ticketTime.textContent = stall.ticketTime;
    els.progressCurrent.textContent = String(state.step + 1);

    els.stallScene.innerHTML = sceneTemplate(stall);
    setSceneBadge(false);

    els.orderQuote.innerHTML =
      `<span class="order-ko" lang="ko">“${escapeHtml(stall.order.ko)}”</span>` +
      `<span class="order-zh" lang="zh-CN">“${escapeHtml(stall.order.zh)}”</span>`;

    state.activeChoices = shuffle(
      stall.options.map((option, index) => ({ ...option, originalIndex: index }))
    );

    els.choices.innerHTML = state.activeChoices
      .map(
        (option, index) =>
          `<button class="choice" type="button" data-correct="${option.correct ? "true" : "false"}" data-original="${option.originalIndex}">` +
          `<span class="choice-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>` +
          `<span class="choice-copy">` +
          `<span class="choice-ko" lang="ko">${escapeHtml(option.ko)}</span>` +
          `<span class="choice-zh" lang="zh-CN">${escapeHtml(option.zh)}</span>` +
          `</span>` +
          `<span class="choice-mark" aria-hidden="true">→</span>` +
          `</button>`
      )
      .join("");

    els.orderNotes.hidden = false;
    els.feedback.hidden = true;
    els.feedback.className = "feedback";
    els.feedback.innerHTML = "";
    els.hintZone.hidden = true;
    els.hintButton.setAttribute("aria-expanded", "false");
    els.hintButton.innerHTML =
      `<span class="hint-icon" aria-hidden="true">?</span>` +
      bilingual(ui.hintToggle.ko, ui.hintToggle.zh);
    els.hintText.hidden = true;
    els.hintText.innerHTML =
      `<span lang="ko">${escapeHtml(stall.hint.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.hint.zh)}</span>`;

    updateProgress();
    renderHeader();

    if ((state.attempts[stall.id] || 0) > 0) {
      els.hintZone.hidden = false;
    }
  }

  function sceneTemplate(stall) {
    return (
      `<div class="scene-noise" aria-hidden="true"></div>` +
      `<div class="scene-sky" aria-hidden="true">` +
      `<div class="scene-bulbs"><i></i><i></i><i></i><i></i><i></i><i></i></div>` +
      `</div>` +
      `<div class="scene-top">` +
      `<p class="scene-location">` +
      `<span lang="ko">${escapeHtml(stall.city.ko)} · ${escapeHtml(stall.market.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.city.zh)} · ${escapeHtml(stall.market.zh)}</span>` +
      `</p>` +
      `<span class="scene-step" aria-hidden="true">${escapeHtml(stall.number)} / 06</span>` +
      `</div>` +
      `<div class="stall-stage">` +
      `<div class="awning" aria-hidden="true"></div>` +
      `<div class="stall-sign">` +
      `<p class="stall-sign-location">` +
      `<span lang="ko">오늘의 메뉴</span><span lang="zh-CN">今日菜单</span>` +
      `</p>` +
      `<h2>` +
      `<span lang="ko">${escapeHtml(stall.dish.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.dish.zh)}</span>` +
      `</h2>` +
      `<p class="stall-sign-tagline">` +
      `<span lang="ko">${escapeHtml(stall.tagline.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.tagline.zh)}</span>` +
      `</p>` +
      `</div>` +
      `<div class="food-stage">` +
      `<div class="steam steam-a" aria-hidden="true"></div>` +
      `<div class="steam steam-b" aria-hidden="true"></div>` +
      `<div class="steam steam-c" aria-hidden="true"></div>` +
      `<img src="${escapeHtml(stall.art)}" alt="" width="245" height="245">` +
      `<div class="price-tag">` +
      `<span lang="ko">${escapeHtml(stall.price.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.price.zh)}</span>` +
      `</div>` +
      `</div>` +
      `<div class="counter" aria-hidden="true"></div>` +
      `</div>` +
      `<div class="scene-bottom">` +
      `<p class="scene-time">` +
      `<span lang="ko">${escapeHtml(stall.time.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.time.zh)}</span>` +
      `</p>` +
      `<span class="scene-badge">` +
      `<span lang="ko">도장 대기</span><span lang="zh-CN">待盖章</span>` +
      `</span>` +
      `<p class="scene-greeting">` +
      `<span lang="ko">“${escapeHtml(stall.greeting.ko)}”</span>` +
      `<span lang="zh-CN">“${escapeHtml(stall.greeting.zh)}”</span>` +
      `</p>` +
      `</div>`
    );
  }

  function setSceneBadge(isComplete) {
    const badge = els.stallScene.querySelector(".scene-badge");
    if (!badge) {
      return;
    }
    badge.classList.toggle("is-complete", Boolean(isComplete));
    badge.innerHTML = isComplete
      ? `<span lang="ko">도장 완료</span><span lang="zh-CN">已盖章</span>`
      : `<span lang="ko">도장 대기</span><span lang="zh-CN">待盖章</span>`;
  }

  /* ── Answer handling ─────────────────────────────────────── */

  function handleChoiceClick(event) {
    const button = event.target.closest(".choice");
    if (!button || button.disabled || state.locked) {
      return;
    }

    const stall = stalls[state.step];
    if (!stall) {
      return;
    }

    const isCorrect = button.dataset.correct === "true";
    state.attempts[stall.id] = (state.attempts[stall.id] || 0) + 1;

    if (isCorrect) {
      handleCorrectAnswer(button, stall);
    } else {
      state.retries += 1;
      handleWrongAnswer(button, stall);
    }

    saveState();
  }

  function handleCorrectAnswer(button, stall) {
    state.locked = true;
    button.classList.add("is-correct");
    button.querySelector(".choice-mark").textContent = "✓";

    Array.from(els.choices.querySelectorAll(".choice")).forEach((choice) => {
      choice.disabled = true;
      if (choice !== button) {
        choice.classList.add("is-locked");
      }
    });

    if (!state.solved.includes(stall.id)) {
      state.solved.push(stall.id);
    }

    state.phase = "playing";
    // Keep the visual scene on the current stall until the player taps next.
    els.orderNotes.hidden = true;
    els.stallScene.classList.add("is-solved");
    setSceneBadge(true);
    renderHeader();
    updateProgress();
    audio.correct();
    audio.stamp();

    const attemptNumber = state.attempts[stall.id] || 1;
    const firstTryMessage =
      attemptNumber === 1
        ? "첫 시도에 맞혔어요."
        : "다시 골라 끝까지 맞혔어요.";
    const firstTryMessageZh =
      attemptNumber === 1
        ? "第一次就答对了。"
        : "重新选择后答对了。";

    const isLast = state.step === stalls.length - 1;
    const nextLabel = isLast ? ui.finish : ui.next;

    els.feedback.className = "feedback is-correct";
    els.feedback.innerHTML =
      `<div class="feedback-top">` +
      `<span class="feedback-icon" aria-hidden="true">✓</span>` +
      `<div class="feedback-title">` +
      `<span lang="ko">${escapeHtml(ui.correct.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(ui.correct.zh)}</span>` +
      `</div>` +
      `</div>` +
      `<div class="feedback-body">` +
      `<span lang="ko">${escapeHtml(stall.explanation.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.explanation.zh)}</span>` +
      `</div>` +
      `<div class="feedback-phrase">` +
      `<span lang="ko">${escapeHtml(stall.phrase.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(stall.phrase.zh)}</span>` +
      `</div>` +
      `<div class="feedback-actions">` +
      `<p class="feedback-tip">` +
      `<span lang="ko">${firstTryMessage}</span>` +
      `<span lang="zh-CN">${firstTryMessageZh}</span>` +
      `</p>` +
      `<button class="next-button" type="button" data-next>` +
      `<span lang="ko">${escapeHtml(nextLabel.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(nextLabel.zh)}</span>` +
      `<span aria-hidden="true">→</span>` +
      `</button>` +
      `</div>`;
    els.feedback.hidden = false;
    els.hintZone.hidden = true;

    els.liveStatus.textContent = `${ui.correctLive.ko} ${ui.correctLive.zh}`;

    window.requestAnimationFrame(() => {
      const nextButton = els.feedback.querySelector("[data-next]");
      if (nextButton) {
        nextButton.focus({ preventScroll: true });
      }
      els.feedback.scrollIntoView({
        block: "nearest",
        behavior: REDUCED_MOTION.matches ? "auto" : "smooth"
      });
    });
  }

  function handleWrongAnswer(button, stall) {
    els.orderNotes.hidden = true;
    button.classList.add("is-wrong");
    button.disabled = true;
    button.querySelector(".choice-mark").textContent = "×";

    els.feedback.className = "feedback is-wrong";
    els.feedback.innerHTML =
      `<div class="feedback-top">` +
      `<span class="feedback-icon" aria-hidden="true">×</span>` +
      `<div class="feedback-title">` +
      `<span lang="ko">${escapeHtml(ui.wrong.ko)}</span>` +
      `<span lang="zh-CN">${escapeHtml(ui.wrong.zh)}</span>` +
      `</div>` +
      `</div>` +
      `<div class="feedback-body">` +
      `<span lang="ko">선택한 카드는 손님의 부탁과 맞지 않아요. 남은 카드를 다시 살펴보세요.</span>` +
      `<span lang="zh-CN">所选的卡片与顾客的请求不符。请再看看其他卡片。</span>` +
      `</div>`;
    els.feedback.hidden = false;
    els.hintZone.hidden = false;

    if ((state.attempts[stall.id] || 0) >= 2) {
      setHint(true);
    }

    els.liveStatus.textContent = `${ui.wrongLive.ko} ${ui.wrongLive.zh}`;
    audio.wrong();

    window.requestAnimationFrame(() => {
      els.feedback.scrollIntoView({
        block: "nearest",
        behavior: REDUCED_MOTION.matches ? "auto" : "smooth"
      });
      const nextChoice = els.choices.querySelector(".choice:not(:disabled)");
      if (nextChoice) {
        nextChoice.focus({ preventScroll: true });
      }
    });
  }

  function advance() {
    if (!state.locked) {
      return;
    }

    if (state.step >= stalls.length - 1) {
      finishJourney();
      return;
    }

    state.step += 1;
    state.phase = "playing";
    state.locked = false;
    saveState();
    renderChallenge();
    window.scrollTo({ top: 0, behavior: "auto" });
    window.setTimeout(focusChallengeHeading, 80);
    audio.ui();
  }

  function finishJourney() {
    state.phase = "result";
    state.step = stalls.length;
    state.locked = true;
    saveState();
    renderResult();
    showView("result");
    window.scrollTo({ top: 0, behavior: "auto" });
    audio.finish();
    launchConfetti();

    window.setTimeout(() => {
      els.resultTitle.setAttribute("tabindex", "-1");
      els.resultTitle.focus({ preventScroll: true });
    }, 80);
  }

  function focusChallengeHeading() {
    if (els.gameView.hidden) {
      return;
    }
    els.challengeTitle.setAttribute("tabindex", "-1");
    els.challengeTitle.focus({ preventScroll: true });
  }

  /* ── Hints ───────────────────────────────────────────────── */

  function setHint(open) {
    const shouldOpen = Boolean(open);
    els.hintText.hidden = !shouldOpen;
    els.hintButton.setAttribute("aria-expanded", String(shouldOpen));
    const label = shouldOpen ? ui.hintHide : ui.hintToggle;
    els.hintButton.innerHTML =
      `<span class="hint-icon" aria-hidden="true">?</span>` +
      bilingual(label.ko, label.zh);
  }

  /* ── Result ──────────────────────────────────────────────── */

  function getRank() {
    return ranks.find((rank) => state.retries <= rank.maxRetries) || ranks[ranks.length - 1];
  }

  function renderResult() {
    const rank = getRank();
    const firstTry = stalls.filter((stall) => state.attempts[stall.id] === 1).length;

    els.resultRank.innerHTML = bilingual(rank.title.ko, rank.title.zh);
    els.resultNote.innerHTML = bilingual(rank.note.ko, rank.note.zh);
    els.firstTryCount.textContent = `${firstTry} / 6`;
    els.retryCount.textContent = String(state.retries);

    els.resultStamps.innerHTML = stalls
      .map((stall, index) => {
        const rotation = index % 2 === 0 ? -3.2 + index * 0.35 : 2.4 - index * 0.2;
        return (
          `<div class="result-stamp" style="--stamp-color:${escapeHtml(stall.accent)};--stamp-rotate:${rotation.toFixed(2)}deg">` +
          `<div class="stamp-ring">` +
          `<span class="stamp-city">${escapeHtml(stall.city.ko)} / ${escapeHtml(stall.city.zh)}</span>` +
          `<img src="${escapeHtml(stall.art)}" alt="" width="35" height="35">` +
          `<strong><span lang="ko">${escapeHtml(stall.dish.ko)}</span><span lang="zh-CN">${escapeHtml(stall.dish.zh)}</span></strong>` +
          `</div>` +
          `<span lang="ko">${escapeHtml(stall.market.ko)}</span>` +
          `<span lang="zh-CN">${escapeHtml(stall.market.zh)}</span>` +
          `</div>`
        );
      })
      .join("");

    els.phraseGrid.innerHTML = stalls
      .map(
        (stall) =>
          `<article class="phrase-card" style="--card-accent:${escapeHtml(stall.accent)}">` +
          `<div class="phrase-card-top">` +
          `<img class="phrase-icon" src="${escapeHtml(stall.art)}" alt="" width="42" height="42">` +
          `<span class="phrase-num" aria-hidden="true">${escapeHtml(stall.number)}</span>` +
          `</div>` +
          `<h3>` +
          `<span lang="ko">${escapeHtml(stall.phrase.ko)}</span>` +
          `<span lang="zh-CN">${escapeHtml(stall.phrase.zh)}</span>` +
          `</h3>` +
          `<p class="phrase-card-location">` +
          `<span lang="ko">${escapeHtml(stall.city.ko)} · ${escapeHtml(stall.market.ko)}</span>` +
          `<span lang="zh-CN">${escapeHtml(stall.city.zh)} · ${escapeHtml(stall.market.zh)}</span>` +
          `</p>` +
          `<p class="phrase-note">` +
          `<span lang="ko">${escapeHtml(stall.note.ko)}</span>` +
          `<span lang="zh-CN">${escapeHtml(stall.note.zh)}</span>` +
          `</p>` +
          `</article>`
      )
      .join("");

    renderHeader();
    els.liveStatus.textContent = `${ui.allStamps.ko} ${ui.allStamps.zh}`;
  }

  function buildShareText() {
    const rank = getRank();
    const lines = [
      "두 도시 야시장 · 双城夜市",
      "미식 여권 / 美食护照: 6 / 6",
      `칭호 / 称号: ${rank.title.ko} / ${rank.title.zh}`,
      `한 번에 맞힌 주문 / 一次答对的订单: ${stalls.filter((stall) => state.attempts[stall.id] === 1).length} / 6`,
      "",
      "오늘의 한마디 / 今日实用句"
    ];

    stalls.forEach((stall, index) => {
      lines.push(`${index + 1}. ${stall.phrase.ko} / ${stall.phrase.zh}`);
    });

    return lines.join("\n");
  }

  async function copyResult() {
    const text = buildShareText();
    let copied = false;

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (error) {
      copied = false;
    }

    if (!copied) {
      copied = legacyCopy(text);
    }

    showToast(copied ? ui.copySuccess : ui.copyFail);
  }

  function legacyCopy(text) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-9999px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch (error) {
      return false;
    }
  }

  /* ── Passport dialog ─────────────────────────────────────── */

  function renderPassportDialog() {
    const count = state.solved.length;
    els.dialogCount.textContent = `${count} / 6`;
    els.dialogProgressFill.style.width = `${(count / 6) * 100}%`;

    const entries = [];

    if (count === 0) {
      entries.push(
        `<p class="empty-state">` +
          `<span lang="ko">${escapeHtml(ui.emptyPassport.ko)}</span>` +
          `<span lang="zh-CN">${escapeHtml(ui.emptyPassport.zh)}</span>` +
          `</p>`
      );
    }

    stalls.forEach((stall) => {
      const done = state.solved.includes(stall.id);
      if (done) {
        entries.push(
          `<article class="passport-entry" style="--entry-accent:${escapeHtml(stall.accent)}">` +
            `<div class="entry-top">` +
            `<span class="entry-num" aria-hidden="true">${escapeHtml(stall.number)}</span>` +
            `<span class="entry-location">` +
            `<span lang="ko">${escapeHtml(stall.city.ko)} · ${escapeHtml(stall.market.ko)}</span>` +
            `<span lang="zh-CN">${escapeHtml(stall.city.zh)} · ${escapeHtml(stall.market.zh)}</span>` +
            `</span>` +
            `</div>` +
            `<p class="entry-dish">` +
            `<span lang="ko">${escapeHtml(stall.dish.ko)}</span>` +
            `<span lang="zh-CN">${escapeHtml(stall.dish.zh)}</span>` +
            `</p>` +
            `<p class="entry-phrase">` +
            `<span lang="ko">${escapeHtml(stall.phrase.ko)}</span>` +
            `<span lang="zh-CN">${escapeHtml(stall.phrase.zh)}</span>` +
            `</p>` +
            `</article>`
        );
      } else {
        entries.push(
          `<div class="passport-entry is-locked">` +
            `<span class="entry-num" aria-hidden="true">${escapeHtml(stall.number)}</span>` +
            `<span class="entry-lock-icon" aria-hidden="true">?</span>` +
            `<p class="entry-locked-copy">` +
            `<span lang="ko">${escapeHtml(ui.lockedStamp.ko)}</span>` +
            `<span lang="zh-CN">${escapeHtml(ui.lockedStamp.zh)}</span>` +
            `</p>` +
            `</div>`
        );
      }
    });

    els.passportEntries.innerHTML = entries.join("");
  }

  function openPassport(event) {
    dialogTrigger =
      event && event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement;
    renderPassportDialog();
    document.body.classList.add("is-dialog-open");
    if (typeof els.passportDialog.showModal === "function") {
      if (!els.passportDialog.open) {
        els.passportDialog.showModal();
      }
    } else {
      els.passportDialog.setAttribute("open", "");
    }
  }

  function closePassport() {
    if (typeof els.passportDialog.close === "function" && els.passportDialog.open) {
      els.passportDialog.close();
    } else {
      els.passportDialog.removeAttribute("open");
      document.body.classList.remove("is-dialog-open");
    }
  }

  /* ── Sound ───────────────────────────────────────────────── */

  function createAudioController() {
    let context = null;

    function ensureContext() {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          return null;
        }
        try {
          context = new AudioContextClass();
        } catch (error) {
          return null;
        }
      }
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }
      return context;
    }

    function tone(frequency, startOffset, duration, type, volume) {
      if (!state.sound) {
        return;
      }
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }
      const start = ctx.currentTime + startOffset;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume || 0.035, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    }

    return {
      ensure() {
        if (state.sound) {
          ensureContext();
        }
      },
      ui() {
        tone(660, 0, 0.08, "sine", 0.018);
      },
      correct() {
        tone(523.25, 0, 0.2, "triangle", 0.03);
        tone(659.25, 0.09, 0.22, "triangle", 0.035);
        tone(783.99, 0.18, 0.3, "triangle", 0.04);
      },
      stamp() {
        tone(146.83, 0.24, 0.16, "sine", 0.05);
      },
      wrong() {
        tone(220, 0, 0.16, "sine", 0.028);
        tone(164.81, 0.13, 0.22, "sine", 0.025);
      },
      finish() {
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          tone(frequency, index * 0.12, 0.35, "triangle", 0.035);
        });
      }
    };
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (state.sound) {
      audio.ensure();
      audio.ui();
    }
    renderSound();
    saveState();
  }

  /* ── Confetti & toast ────────────────────────────────────── */

  function launchConfetti() {
    if (REDUCED_MOTION.matches) {
      return;
    }
    window.clearTimeout(confettiTimer);
    const colors = ["#ff7455", "#f4c95d", "#8fe0c0", "#8fb8ff", "#d8a6ff", "#fff5e2"];
    const pieces = [];

    for (let index = 0; index < 34; index += 1) {
      const left = Math.random() * 100;
      const duration = 2.8 + Math.random() * 1.8;
      const delay = Math.random() * 0.45;
      const drift = (Math.random() - 0.5) * 160;
      const spin = 320 + Math.random() * 720;
      const color = colors[index % colors.length];
      pieces.push(
        `<span class="confetti" style="left:${left.toFixed(1)}%;--fall-duration:${duration.toFixed(2)}s;--fall-delay:${delay.toFixed(2)}s;--drift:${drift.toFixed(1)}px;--spin:${spin.toFixed(0)}deg;background:${color}"></span>`
      );
    }

    els.confettiLayer.innerHTML = pieces.join("");
    confettiTimer = window.setTimeout(() => {
      els.confettiLayer.innerHTML = "";
    }, 5200);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.innerHTML = bilingual(message.ko, message.zh);
    els.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 3400);
  }

  /* ── Events ──────────────────────────────────────────────── */

  function bindEvents() {
    els.startButton.addEventListener("click", handleStart);
    els.homeButton.addEventListener("click", handleHome);
    els.previewPassportButton.addEventListener("click", openPassport);
    els.introResetButton.addEventListener("click", handleResetFromIntro);
    els.openPassport.addEventListener("click", openPassport);
    els.closePassport.addEventListener("click", closePassport);
    els.soundToggle.addEventListener("click", toggleSound);
    els.choices.addEventListener("click", handleChoiceClick);
    els.restartButton.addEventListener("click", handleRestart);
    els.copyResultButton.addEventListener("click", copyResult);
    els.printResultButton.addEventListener("click", () => window.print());

    els.hintButton.addEventListener("click", () => {
      setHint(els.hintButton.getAttribute("aria-expanded") !== "true");
    });

    els.feedback.addEventListener("click", (event) => {
      const nextButton = event.target.closest("[data-next]");
      if (nextButton) {
        advance();
      }
    });

    els.passportDialog.addEventListener("click", (event) => {
      if (event.target === els.passportDialog) {
        closePassport();
      }
    });

    els.passportDialog.addEventListener("close", () => {
      document.body.classList.remove("is-dialog-open");
      const returnTarget =
        dialogTrigger instanceof HTMLElement && document.contains(dialogTrigger)
          ? dialogTrigger
          : els.openPassport;
      returnTarget.focus({ preventScroll: true });
      dialogTrigger = null;
    });

    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || els.passportDialog.open) {
        return;
      }
      if (els.gameView.hidden || state.locked) {
        return;
      }
      if (!["1", "2", "3"].includes(event.key)) {
        return;
      }
      const choices = Array.from(els.choices.querySelectorAll(".choice"));
      const target = choices[Number(event.key) - 1];
      if (target && !target.disabled) {
        event.preventDefault();
        target.click();
      }
    });
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  function bilingual(ko, zh) {
    return `<span lang="ko">${escapeHtml(ko)}</span><span lang="zh-CN">${escapeHtml(zh)}</span>`;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };
      return map[character];
    });
  }
})();
