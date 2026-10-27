(function () {
  'use strict';

  const E = window.Enigma;
  if (!E) {
    console.error('Enigma core failed to load.');
    return;
  }

  const STORAGE_KEY = 'enigma-m3-state-v1';
  const MAX_TAPE = 240;
  const MAX_LOG = 60;
  const CABLE_COLORS = [
    '#d9a45b', '#8fbfa2', '#7fa9cf', '#cf8fa4', '#c0ad6a',
    '#a693d1', '#6fbdb4', '#d18f63', '#a9b86f', '#8f9cdb',
  ];
  const SIDE_LABELS = ['左', '中', '右'];
  const KEY_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'].map((row) => row.split(''));
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const els = {
    rotorDeck: $('#rotorDeck'),
    lampboard: $('#lampboard'),
    keyboard: $('#keyboard'),
    tape: $('#tape'),
    rotorControls: $('#rotorControls'),
    reflectorControl: $('#reflectorControl'),
    reflectorNote: $('[data-reflector-note]'),
    keySheet: $('#keySheet'),
    keySheetText: $('#keySheetText'),
    keyBadge: $('[data-key-badge]'),
    messageInput: $('#messageInput'),
    charCount: $('[data-char-count]'),
    output: $('#output'),
    outputMeta: $('[data-output-meta]'),
    trace: $('#trace'),
    tracePos: $('[data-trace-pos]'),
    logBody: $('#logBody'),
    logCount: $('[data-log-count]'),
    plugRows: $('#plugRows'),
    plugboard: $('#plugboard'),
    cables: $('#cables'),
    plugPairs: $('#plugPairs'),
    plugCount: $('[data-plug-count]'),
    headerUkw: $('[data-header-ukw]'),
    status: $('[data-status]'),
    soundBtn: $('[data-action="sound"]'),
    soundLabel: $('[data-sound-label]'),
    runBtn: $('[data-action="run"]'),
    runLabel: $('[data-run-label]'),
    toasts: $('#toasts'),
    srStatus: $('#srStatus'),
    helpDialog: $('#helpDialog'),
    selfTestResult: $('#selfTestResult'),
    groupToggle: $('[data-action="grouping"]'),
    machine: $('.machine'),
  };

  const state = {
    rotors: ['I', 'II', 'III'],
    reflector: 'B',
    rings: ['A', 'A', 'A'],
    start: ['A', 'A', 'A'],
    plugboard: [],
    sound: true,
    grouping: true,
    tape: '',
    output: '',
    log: [],
    logTotal: 0,
    running: false,
    lastResult: null,
  };

  let machine = null;
  let selectedPlug = null;
  let newCablePairs = new Set();
  let audioContext = null;
  let noiseBuffer = null;
  let resizeTimer = 0;

  /* -----------------------------------------------------------------------
     Build the static machine furniture
     ----------------------------------------------------------------------- */

  function buildRotorDeck() {
    const rotors = SIDE_LABELS.map((label, slot) => `
      <div class="rotor" data-slot="${slot}" role="group" aria-label="${label}转子">
        <div class="rotor-cap">
          <span>${label} · ${slot === 0 ? 'LEFT' : slot === 1 ? 'MIDDLE' : 'RIGHT'}</span>
          <span class="rotor-id" data-rotor-id>—</span>
        </div>
        <div class="rotor-window" aria-hidden="true">
          <span class="ghost ghost--prev" data-prev>Z</span>
          <span class="rotor-letter" data-letter>A</span>
          <span class="ghost ghost--next" data-next>B</span>
          <span class="rotor-notch" data-notch title="缺口"></span>
        </div>
        <div class="rotor-meta">
          <span>RING <b data-ring>01</b></span>
          <span>POS <b data-pos>A</b></span>
        </div>
      </div>
    `).join('');

    els.rotorDeck.innerHTML = rotors + `
      <button type="button" class="reflector-card" data-action="toggle-reflector"
        title="点击切换 UKW-B / UKW-C" aria-label="反射器 UKW-B，点击切换">
        <span class="ref-cap">UKW</span>
        <span class="ref-letter" data-reflector-letter>B</span>
        <span class="ref-name">反射器</span>
      </button>
    `;
  }

  function buildLampsAndKeys() {
    els.lampboard.innerHTML = KEY_ROWS.map((row) => `
      <div class="lamp-row">
        ${row.map((letter) => `<span class="lamp" data-lamp="${letter}" aria-hidden="true">${letter}</span>`).join('')}
      </div>
    `).join('');

    els.keyboard.innerHTML = KEY_ROWS.map((row) => `
      <div class="key-row">
        ${row.map((letter) => `
          <button type="button" class="key" data-key="${letter}" aria-label="按键 ${letter}">${letter}</button>
        `).join('')}
      </div>
    `).join('');
  }

  function buildRotorControls() {
    els.rotorControls.innerHTML = SIDE_LABELS.map((label, slot) => `
      <div class="rc" data-slot="${slot}">
        <div class="rc-top">
          <span class="rc-side">${label}</span>
          <span class="rc-roman" data-live-rotor>I</span>
        </div>
        <label class="rc-field">
          <span>转子 <i>Walze</i></span>
          <select data-rotor-select aria-label="${label}转子型号">
            ${E.ROTOR_IDS.map((id) => `<option value="${id}">${id} · ${E.ROTORS[id].notch}</option>`).join('')}
          </select>
        </label>
        <div class="rc-field">
          <span>环设置 <i>Ring</i></span>
          <div class="stepper">
            <button type="button" data-ring-step="-1" aria-label="${label}转子环设置减一">−</button>
            <b data-ring-value>01</b>
            <button type="button" data-ring-step="1" aria-label="${label}转子环设置加一">+</button>
          </div>
        </div>
        <div class="rc-field">
          <span>起始位置 <i>Grund</i></span>
          <div class="stepper">
            <button type="button" data-start-step="-1" aria-label="${label}转子起始位置减一">−</button>
            <b data-start-value>A</b>
            <button type="button" data-start-step="1" aria-label="${label}转子起始位置加一">+</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  function buildPlugboard() {
    els.plugRows.innerHTML = LETTERS.map((letter) => `
      <button type="button" class="plug" data-plug="${letter}" aria-label="插孔 ${letter}" aria-pressed="false">
        <span class="plug-letter">${letter}</span>
        <span class="plug-mate" aria-hidden="true"></span>
      </button>
    `).join('');
  }

  /* -----------------------------------------------------------------------
     Machine construction and configuration
     ----------------------------------------------------------------------- */

  function createMachine(config, positions) {
    return new E.Machine({
      rotors: config.rotors,
      reflector: config.reflector,
      rings: config.rings,
      positions: positions || config.start || config.positions || 'AAA',
      plugboard: config.plugboard,
    });
  }

  function rebuildMachine(reset) {
    const live = reset || !machine ? state.start : machine.positions;
    machine = createMachine(state, live);
    state.plugboard = machine.getConfig().plugboard;
  }

  function installConfig(config, options) {
    const opts = options || {};
    const next = E.normalizeConfig(config);
    state.rotors = [...next.rotors];
    state.reflector = next.reflector;
    state.rings = [...next.rings];
    state.start = [...next.positions];
    state.plugboard = [...next.plugboard];
    selectedPlug = null;
    rebuildMachine(opts.reset !== false);
    if (opts.clear) resetSession({ render: false });
    renderAll();
    saveState();
  }

  function applyKeyChange(options) {
    rebuildMachine(Boolean(options && options.reset));
    if (options && options.clearTrace !== false) clearTrace();
    clearLamp();
    renderRotors();
    renderSettings();
    saveState();
  }

  function applyPlugboardChange(animatePair) {
    if (animatePair) newCablePairs.add(animatePair);
    rebuildMachine(false);
    clearLamp();
    renderPlugboard();
    clearTrace();
    saveState();
  }

  function setRotorType(slot, id) {
    if (guardBusy()) {
      renderSettings();
      return;
    }
    const next = [...state.rotors];
    next[slot] = id;
    if (new Set(next).size !== 3) {
      toast('同一型号的转子不能重复使用', 'error');
      renderSettings();
      return;
    }
    state.rotors = next;
    applyKeyChange();
    playClick({ frequency: 1200, gain: 0.022 });
  }

  function stepRing(slot, direction) {
    if (guardBusy()) return;
    const index = E.toIndex(state.rings[slot]);
    state.rings[slot] = E.toLetter(index + direction);
    applyKeyChange();
    playClick({ frequency: 1750, gain: 0.018 });
  }

  function stepStart(slot, direction) {
    if (guardBusy()) return;
    const index = E.toIndex(state.start[slot]);
    state.start[slot] = E.toLetter(index + direction);
    applyKeyChange({ reset: true });
    playClick({ frequency: 900, gain: 0.024 });
  }

  function setReflector(id) {
    if (guardBusy()) return;
    if (state.reflector === id) return;
    state.reflector = id;
    applyKeyChange();
    playClick({ frequency: 700, gain: 0.03 });
  }

  function toggleReflector() {
    setReflector(state.reflector === 'B' ? 'C' : 'B');
  }

  function resetPositions() {
    if (guardBusy()) return;
    machine.setPositions(state.start);
    clearLamp();
    renderRotors();
    clearTrace('转子已复位到起始位置 · 按下一个键查看新的信号路径');
    playClick({ frequency: 620, gain: 0.03 });
    toast(`转子已复位至 ${state.start.join('')}`);
  }

  function randomKey() {
    if (guardBusy()) return;
    const rotors = shuffle([...E.ROTOR_IDS]).slice(0, 3);
    const config = {
      rotors,
      reflector: Math.random() < 0.5 ? 'B' : 'C',
      rings: randomLetters(3),
      positions: randomLetters(3),
      plugboard: randomPlugs(10),
    };
    newCablePairs = new Set(config.plugboard);
    installConfig(config, { reset: true, clear: true });
    els.keySheet.open = true;
    playPlugSound();
    toast('已生成新密钥，密钥单已展开');
  }

  function randomizePlugs() {
    if (guardBusy()) return;
    const pairs = randomPlugs(10);
    newCablePairs = new Set(pairs);
    state.plugboard = pairs;
    applyPlugboardChange();
    playPlugSound();
    toast('已随机插满 10 对连线');
  }

  function clearPlugs() {
    if (guardBusy()) return;
    if (!state.plugboard.length) {
      toast('插线板已经是空的');
      return;
    }
    state.plugboard = [];
    selectedPlug = null;
    applyPlugboardChange();
    playPlugSound(300);
    toast('已拔除全部连线');
  }

  /* -----------------------------------------------------------------------
     Plugboard interaction
     ----------------------------------------------------------------------- */

  function pairContaining(letter) {
    return state.plugboard.find((pair) => pair.includes(letter)) || null;
  }

  function handlePlugClick(letter) {
    if (guardBusy()) return;

    const existing = pairContaining(letter);
    if (existing) {
      state.plugboard = state.plugboard.filter((pair) => pair !== existing);
      selectedPlug = null;
      applyPlugboardChange();
      playPlugSound(280);
      return;
    }

    if (selectedPlug === letter) {
      selectedPlug = null;
      renderPlugboard();
      return;
    }

    if (!selectedPlug) {
      selectedPlug = letter;
      renderPlugboard();
      playClick({ frequency: 2200, gain: 0.018 });
      return;
    }

    if (state.plugboard.length >= E.MAX_PLUGS) {
      toast('最多只能连接 10 对线', 'error');
      selectedPlug = null;
      renderPlugboard();
      playError();
      return;
    }

    const pair = [selectedPlug, letter].sort().join('');
    state.plugboard = E.normalizePlugboard([...state.plugboard, pair]);
    selectedPlug = null;
    applyPlugboardChange(pair);
    playPlugSound();
  }

  function removePlugPair(pair) {
    if (guardBusy()) return;
    state.plugboard = state.plugboard.filter((item) => item !== pair);
    selectedPlug = null;
    applyPlugboardChange();
    playPlugSound(280);
  }

  function renderPlugboard() {
    const pairColor = new Map();
    state.plugboard.forEach((pair, index) => {
      pairColor.set(pair, CABLE_COLORS[index % CABLE_COLORS.length]);
    });

    $$('.plug', els.plugRows).forEach((button) => {
      const letter = button.dataset.plug;
      const pair = pairContaining(letter);
      const mate = pair ? pair.replace(letter, '') : '';
      const color = pair ? pairColor.get(pair) : null;
      const selected = selectedPlug === letter;

      button.classList.toggle('is-connected', Boolean(pair));
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.setAttribute('aria-label', pair
        ? `插孔 ${letter}，已连接 ${mate}，点击拔除`
        : `插孔 ${letter}${selected ? '，已选中，请选择另一个字母' : ''}`);
      if (color) button.style.setProperty('--plug-color', color);
      else button.style.removeProperty('--plug-color');

      const mateEl = $('.plug-mate', button);
      if (mateEl) mateEl.textContent = mate;
    });

    els.plugCount.textContent = `${state.plugboard.length} / ${E.MAX_PLUGS} 对`;
    els.plugCount.classList.toggle('chip--count', state.plugboard.length < E.MAX_PLUGS);
    els.plugboard.classList.toggle('is-empty', state.plugboard.length === 0);

    if (!state.plugboard.length) {
      els.plugPairs.innerHTML = '<span class="plug-empty">尚未插线 — 点击两个字母建立连线</span>';
    } else {
      els.plugPairs.innerHTML = state.plugboard.map((pair) => {
        const color = pairColor.get(pair);
        return `
          <button type="button" class="plug-chip" data-unplug="${pair}"
            style="--chip-color:${color}" aria-label="拔除插线 ${pair}" title="拔除 ${pair}">
            <span class="chip-dot" aria-hidden="true"></span>${pair}<span class="chip-x" aria-hidden="true">×</span>
          </button>
        `;
      }).join('');
    }

    drawCables();
  }

  function drawCables() {
    if (!els.cables) return;
    const svgRect = els.cables.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) return;

    els.cables.setAttribute('viewBox', `0 0 ${svgRect.width.toFixed(1)} ${svgRect.height.toFixed(1)}`);

    const centers = new Map();
    $$('.plug', els.plugRows).forEach((button) => {
      const rect = button.getBoundingClientRect();
      centers.set(button.dataset.plug, {
        x: rect.left - svgRect.left + rect.width / 2,
        y: rect.top - svgRect.top + rect.height / 2,
      });
    });

    const all = Array.from(centers.values());
    if (!all.length) return;
    const channelY = (Math.min(...all.map((point) => point.y)) + Math.max(...all.map((point) => point.y))) / 2;

    const paths = [];
    state.plugboard.forEach((pair, index) => {
      const a = centers.get(pair[0]);
      const b = centers.get(pair[1]);
      if (!a || !b) return;
      const color = CABLE_COLORS[index % CABLE_COLORS.length];
      const dx = b.x - a.x;
      const c1x = a.x + dx * 0.16;
      const c2x = b.x - dx * 0.16;
      const d = [
        'M', a.x.toFixed(1), a.y.toFixed(1),
        'C', c1x.toFixed(1), channelY.toFixed(1),
        c2x.toFixed(1), channelY.toFixed(1),
        b.x.toFixed(1), b.y.toFixed(1),
      ].join(' ');
      paths.push(`<path class="cable-halo" d="${d}" stroke="${color}"></path>`);
      paths.push(`<path class="cable" d="${d}" stroke="${color}" data-pair="${pair}"></path>`);
    });

    els.cables.innerHTML = paths.join('');

    if (newCablePairs.size) {
      $$('.cable', els.cables).forEach((path) => {
        if (!newCablePairs.has(path.dataset.pair)) return;
        if (typeof path.getTotalLength !== 'function' || typeof path.animate !== 'function') return;
        const length = path.getTotalLength();
        path.style.strokeDasharray = String(length);
        path.animate(
          [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
          { duration: 480, easing: 'ease-out' }
        );
      });
      newCablePairs.clear();
    }
  }

  /* -----------------------------------------------------------------------
     Rendering
     ----------------------------------------------------------------------- */

  function renderAll() {
    renderRotors();
    renderSettings();
    renderPlugboard();
    renderTape();
    renderOutput();
    renderLog();
    updateCharCount();
    updateSoundButton();
    updateStatus();
  }

  function renderRotors() {
    const positions = machine.positions;

    $$('.rotor', els.rotorDeck).forEach((card) => {
      const slot = Number(card.dataset.slot);
      const position = positions[slot];
      const ringNumber = String(E.toIndex(state.rings[slot]) + 1).padStart(2, '0');
      card.classList.toggle('is-notch', machine.isAtNotch(slot));
      card.setAttribute('aria-label', `${SIDE_LABELS[slot]}转子 ${state.rotors[slot]}，当前位置 ${position}，环设置 ${ringNumber}`);

      $('[data-rotor-id]', card).textContent = state.rotors[slot];
      $('[data-letter]', card).textContent = position;
      $('[data-prev]', card).textContent = E.toLetter(E.toIndex(position) - 1);
      $('[data-next]', card).textContent = E.toLetter(E.toIndex(position) + 1);
      $('[data-ring]', card).textContent = ringNumber;
      $('[data-pos]', card).textContent = position;
      const notch = $('[data-notch]', card);
      notch.title = `缺口 ${E.ROTORS[state.rotors[slot]].notch} · 当前 ${position}`;
    });

    const reflectorLetter = $('[data-reflector-letter]', els.rotorDeck);
    if (reflectorLetter) reflectorLetter.textContent = state.reflector;
    const reflectorCard = $('.reflector-card', els.rotorDeck);
    if (reflectorCard) {
      reflectorCard.setAttribute('aria-label', `反射器 UKW-${state.reflector}，点击切换`);
    }
    els.headerUkw.textContent = state.reflector;
  }

  function renderSettings() {
    $$('.rc', els.rotorControls).forEach((card) => {
      const slot = Number(card.dataset.slot);
      $('[data-live-rotor]', card).textContent = state.rotors[slot];
      $('[data-rotor-select]', card).value = state.rotors[slot];
      $('[data-ring-value]', card).textContent = String(E.toIndex(state.rings[slot]) + 1).padStart(2, '0');
      $('[data-start-value]', card).textContent = state.start[slot];
    });

    $$('button[data-reflector]', els.reflectorControl).forEach((button) => {
      const active = button.dataset.reflector === state.reflector;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    els.reflectorNote.textContent = state.reflector === 'B' ? '标准接线' : '替代接线';
    els.keyBadge.textContent = state.rotors.join(' · ');
    els.keySheetText.textContent = formatKeySheet();
    els.groupToggle.checked = state.grouping;
  }

  function formatKeySheet() {
    const ringNumbers = state.rings.map((letter) => String(E.toIndex(letter) + 1).padStart(2, '0')).join(' ');
    return [
      `Walzenlage:    ${state.rotors.join(' · ')}`,
      `Ringstellung:  ${ringNumbers}`,
      `Grundstellung: ${state.start.join(' ')}`,
      `Steckerbrett:  ${state.plugboard.length ? state.plugboard.join(' ') : '—'}`,
      `UKW:           ${state.reflector}`,
    ].join('\n');
  }

  function renderTape() {
    if (!state.tape) {
      els.tape.innerHTML = '<span class="tape-empty">按下按键开始加密…</span>';
      return;
    }
    const chars = Array.from(state.tape);
    const lastIndex = chars.length - 1;
    els.tape.innerHTML = chars
      .map((char, index) => `<span class="tape-char${index === lastIndex ? ' is-last' : ''}">${char}</span>`)
      .join('');
    els.tape.scrollLeft = els.tape.scrollWidth;
  }

  function groupLetters(text) {
    const groups = text.match(/.{1,5}/g);
    return groups ? groups.join(' ') : '';
  }

  function renderOutput() {
    if (!state.output) {
      els.output.textContent = '—';
      els.output.classList.add('is-empty');
      return;
    }
    els.output.classList.remove('is-empty');
    els.output.textContent = state.grouping ? groupLetters(state.output) : state.output;
    els.output.scrollTop = els.output.scrollHeight;
  }

  function renderTrace(result, quick) {
    els.trace.classList.toggle('is-quick', Boolean(quick));
    const rows = result.trace.map((entry, index) => {
      let stage = '';
      let direction = '';

      if (entry.stage === 'input') stage = '按键';
      else if (entry.stage === 'plug') stage = entry.pass === 'in' ? '插线板' : '插线板 · 回';
      else if (entry.stage === 'rotor') {
        direction = entry.direction;
        stage = `${SIDE_LABELS[entry.slot]} ${entry.rotor}${entry.direction === 'backward' ? ' · 回' : ''}`;
      } else if (entry.stage === 'reflector') stage = `反射器 ${entry.reflector}`;
      else if (entry.stage === 'lamp') stage = '灯板';

      return `
        <div class="trace-row" style="--i:${quick ? 0 : index}" data-kind="${entry.stage}" data-direction="${direction}">
          <span class="trace-stage">${stage}</span>
          <span class="trace-path">
            <b class="from">${entry.from}</b>
            <span class="arrow" aria-hidden="true">→</span>
            <b class="to">${entry.to}</b>
          </span>
        </div>
      `;
    });

    els.trace.innerHTML = rows.join('');
    els.tracePos.textContent = `${result.input} → ${result.output} · ${result.positionString}`;
  }

  function clearTrace(message) {
    els.trace.classList.remove('is-quick');
    els.trace.innerHTML = `<p class="trace-empty">${message || '按下一个键，查看电流如何穿过插线板、三只转子和反射器。金色表示去程，青色表示回程。'}</p>`;
    els.tracePos.textContent = '—';
  }

  function pushLog(result) {
    state.logTotal += 1;
    state.log.unshift({
      seq: state.logTotal,
      input: result.input,
      output: result.output,
      positionString: result.positionString,
    });
    if (state.log.length > MAX_LOG) state.log.pop();
  }

  function renderLog() {
    if (!state.log.length) {
      els.logBody.innerHTML = '<tr><td colspan="4" class="log-empty">尚无记录</td></tr>';
      els.logCount.textContent = '0 条';
      return;
    }
    els.logBody.innerHTML = state.log.map((item) => `
      <tr>
        <td>${item.seq}</td>
        <td>${item.input}</td>
        <td class="out">${item.output}</td>
        <td class="pos">${item.positionString}</td>
      </tr>
    `).join('');
    els.logCount.textContent = `${state.log.length} 条`;
  }

  function updateCharCount() {
    const raw = els.messageInput.value;
    const letters = raw.replace(/[^A-Za-z]/g, '').length;
    const ignored = raw.length - letters - (raw.match(/\s/g) || []).length;
    els.charCount.textContent = `${letters} 个字母${ignored > 0 ? ` · 忽略 ${ignored} 个符号` : ''}`;
  }

  function setLamp(letter, pulse) {
    $$('.lamp', els.lampboard).forEach((lamp) => {
      const lit = lamp.dataset.lamp === letter;
      lamp.classList.toggle('is-lit', lit);
      if (lit && pulse && typeof lamp.animate === 'function') {
        lamp.animate(
          [{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
          { duration: 280, easing: 'ease-out' }
        );
      }
    });
  }

  function clearLamp() {
    $$('.lamp', els.lampboard).forEach((lamp) => lamp.classList.remove('is-lit'));
  }

  function animateRotors(stepped) {
    stepped.forEach((moved, slot) => {
      if (!moved) return;
      const letter = $(`.rotor[data-slot="${slot}"] [data-letter]`, els.rotorDeck);
      if (!letter || typeof letter.animate !== 'function' || REDUCED_MOTION.matches) return;
      letter.animate(
        [
          { transform: 'translateY(42%)', opacity: 0.15, filter: 'blur(1px)' },
          { transform: 'translateY(0)', opacity: 1, filter: 'blur(0)' },
        ],
        { duration: 230, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    });
  }

  function animateKey(letter) {
    const key = $(`.key[data-key="${letter}"]`, els.keyboard);
    if (!key) return;
    key.classList.add('is-down');
    window.setTimeout(() => key.classList.remove('is-down'), 110);
  }

  function updateStatus() {
    els.status.textContent = state.running ? '运行中 · LAEUFT' : '待命 · BEREIT';
  }

  function setRunning(running) {
    state.running = running;
    document.body.classList.toggle('is-running', running);
    els.runBtn.disabled = running;
    els.runLabel.textContent = running ? '正在运行…' : '运行加密 / 解密';
    els.output.classList.toggle('is-running', running);
    updateStatus();
  }

  /* -----------------------------------------------------------------------
     Typing one letter
     ----------------------------------------------------------------------- */

  function pressLetter(letter) {
    if (state.running) return;
    if (!/^[A-Z]$/.test(letter)) return;

    animateKey(letter);
    const result = machine.processLetter(letter);
    state.lastResult = result;
    state.tape = (state.tape + result.output).slice(-MAX_TAPE);
    pushLog(result);

    renderRotors();
    animateRotors(result.stepped);
    setLamp(result.output, true);
    renderTrace(result);
    renderTape();
    renderLog();

    playKeySound();
    window.setTimeout(() => playLampSound(), 18);
    announce(`按键 ${letter}，加密为 ${result.output}，转子位置 ${result.positionString}`);
  }

  /* -----------------------------------------------------------------------
     Message processing
     ----------------------------------------------------------------------- */

  async function runMessage() {
    if (state.running) return;

    updateCharCount();
    const raw = els.messageInput.value;
    const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
    if (!letters) {
      toast('请先输入 A–Z 字母', 'error');
      els.messageInput.focus();
      return;
    }

    const total = letters.length;
    const startPositions = state.start.join('');
    const animate = total <= 180 && !REDUCED_MOTION.matches;
    const withSound = total <= 48;
    let lastResult = null;

    machine.setPositions(state.start);
    resetSession();
    setRunning(true);

    try {
      if (animate) {
        for (let index = 0; index < total; index += 1) {
          const result = machine.processLetter(letters[index]);
          lastResult = result;
          state.output += result.output;
          state.tape = (state.tape + result.output).slice(-MAX_TAPE);
          pushLog(result);

          renderRotors();
          animateRotors(result.stepped);
          setLamp(result.output, false);
          renderTrace(result, true);
          renderTape();
          renderOutput();
          if (index % 4 === 0 || index === total - 1) renderLog();

          if (withSound) playKeySound(0.012);
          els.outputMeta.textContent = `运行中 ${index + 1} / ${total}`;
          await sleep(25);
        }
        if (lastResult) renderTrace(lastResult);
      } else {
        let output = '';
        for (let index = 0; index < total; index += 1) {
          const result = machine.processLetter(letters[index]);
          output += result.output;
          lastResult = result;
          pushLog(result);
        }
        state.output = output;
        state.tape = output.slice(-MAX_TAPE);
        if (lastResult) {
          renderRotors();
          animateRotors(lastResult.stepped);
          setLamp(lastResult.output, false);
          renderTrace(lastResult);
        }
        renderTape();
        renderOutput();
        renderLog();
      }

      const endPositions = machine.positionString;
      els.outputMeta.textContent = `${total} 字母 · ${startPositions} → ${endPositions}`;
      announce(`处理完成，共 ${total} 个字母，结束位置 ${endPositions}`);
      playDoneSound();
    } catch (error) {
      console.error(error);
      toast('运行时出现错误：' + error.message, 'error');
    } finally {
      setRunning(false);
      saveState();
    }
  }

  function resetSession(options) {
    const opts = options || {};
    state.output = '';
    state.tape = '';
    state.log = [];
    state.logTotal = 0;
    state.lastResult = null;
    clearLamp();
    clearTrace();
    els.outputMeta.textContent = '等待输入';
    if (opts.render !== false) {
      renderOutput();
      renderTape();
      renderLog();
    }
  }

  function clearMessage() {
    if (guardBusy()) return;
    els.messageInput.value = '';
    resetSession();
    machine.setPositions(state.start);
    renderRotors();
    updateCharCount();
    els.messageInput.focus();
    toast('报文已清空，转子回到起始位置');
  }

  function useOutputAsInput() {
    if (guardBusy()) return;
    const source = state.output || state.tape;
    if (!source) {
      toast('还没有可用的输出', 'error');
      return;
    }
    els.messageInput.value = source;
    state.output = '';
    state.tape = '';
    state.log = [];
    state.logTotal = 0;
    state.lastResult = null;
    machine.setPositions(state.start);
    clearLamp();
    renderRotors();
    renderOutput();
    renderTape();
    renderLog();
    clearTrace('已把密文填入输入框 · 转子复位到起始位置 · 运行即可还原明文');
    updateCharCount();
    els.outputMeta.textContent = '已载入密文 · 等待运行';
    els.messageInput.focus();
    toast('已将密文转为输入，转子已复位');
  }

  /* -----------------------------------------------------------------------
     Helpers
     ----------------------------------------------------------------------- */

  function guardBusy() {
    if (!state.running) return false;
    toast('正在处理报文，请稍候', 'error');
    return true;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function shuffle(items) {
    const array = [...items];
    for (let index = array.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [array[index], array[swap]] = [array[swap], array[index]];
    }
    return array;
  }

  function randomLetters(count) {
    return Array.from({ length: count }, () => LETTERS[Math.floor(Math.random() * 26)]);
  }

  function randomPlugs(count) {
    const pool = shuffle([...LETTERS]);
    const pairs = [];
    for (let index = 0; index < count * 2; index += 2) {
      pairs.push([pool[index], pool[index + 1]].sort().join(''));
    }
    return pairs;
  }

  function announce(message) {
    els.srStatus.textContent = '';
    window.setTimeout(() => {
      els.srStatus.textContent = message;
    }, 30);
  }

  function toast(message, type) {
    const node = document.createElement('div');
    node.className = 'toast' + (type === 'error' ? ' is-error' : '');
    node.textContent = message;
    els.toasts.appendChild(node);
    while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
    window.setTimeout(() => {
      node.classList.add('is-leaving');
      window.setTimeout(() => node.remove(), 220);
    }, 3000);
  }

  /* -----------------------------------------------------------------------
     Sound (tiny WebAudio synth, no external assets)
     ----------------------------------------------------------------------- */

  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        audioContext = new Ctx();
      } catch (error) {
        return null;
      }
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function getNoiseBuffer(ctx) {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.18);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 3);
    }
    return noiseBuffer;
  }

  function playClick(options) {
    const opts = options || {};
    const ctx = ensureAudio();
    if (!ctx) return;
    const frequency = opts.frequency || 1600;
    const gainValue = opts.gain || 0.03;
    const duration = 0.035;
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + duration);
  }

  function playTone(frequency, duration, gainValue, type) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue || 0.02, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function playKeySound(batchGain) {
    playClick({ frequency: 1350, gain: batchGain || 0.026 });
    playTone(150, 0.055, (batchGain || 0.026) * 0.45, 'triangle');
  }

  function playLampSound() {
    playTone(880, 0.09, 0.009, 'sine');
    playTone(1320, 0.07, 0.004, 'sine');
  }

  function playPlugSound(frequency) {
    playClick({ frequency: frequency || 2100, gain: 0.035 });
  }

  function playDoneSound() {
    playTone(523.25, 0.12, 0.014, 'sine');
    window.setTimeout(() => playTone(783.99, 0.18, 0.012, 'sine'), 90);
  }

  function playError() {
    playTone(140, 0.16, 0.018, 'sawtooth');
  }

  /* -----------------------------------------------------------------------
     Clipboard
     ----------------------------------------------------------------------- */

  async function copyText(text, successMessage) {
    if (!text) {
      toast('没有可复制的内容', 'error');
      return false;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      toast(successMessage || '已复制到剪贴板');
      return true;
    } catch (error) {
      try {
        fallbackCopy(text);
        toast(successMessage || '已复制到剪贴板');
        return true;
      } catch (fallbackError) {
        toast('复制失败，请手动选择文本', 'error');
        return false;
      }
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy command failed');
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast('当前浏览器不支持读取剪贴板，请使用 Ctrl+V', 'error');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast('剪贴板是空的');
        return;
      }
      els.messageInput.value = text;
      updateCharCount();
      els.messageInput.focus();
      toast('已从剪贴板粘贴');
    } catch (error) {
      toast('无法读取剪贴板，请使用 Ctrl+V', 'error');
    }
  }

  function copyOutput() {
    if (!state.output) {
      toast('还没有输出', 'error');
      return;
    }
    const text = state.grouping ? groupLetters(state.output) : state.output;
    copyText(text, '输出已复制');
  }

  function copyTape() {
    if (!state.tape) {
      toast('纸带还是空的', 'error');
      return;
    }
    copyText(state.tape, '纸带内容已复制');
  }

  function copyKeySheet() {
    copyText(formatKeySheet(), '密钥单已复制');
  }

  function buildShareUrl() {
    const params = new URLSearchParams();
    params.set('r', state.rotors.map((id) => E.ROTOR_IDS.indexOf(id) + 1).join(''));
    params.set('u', state.reflector);
    params.set('g', state.rings.join(''));
    params.set('p', state.start.join(''));
    if (state.plugboard.length) params.set('s', state.plugboard.join(' '));
    const url = new URL(window.location.href);
    url.hash = params.toString();
    return url.toString();
  }

  function shareKey() {
    const url = buildShareUrl();
    copyText(url, '分享链接已复制').then((copied) => {
      if (!copied) window.prompt('复制此链接以分享密钥：', url);
    });
  }

  function readSharedConfig() {
    if (!window.location.hash || window.location.hash.length < 4) return null;
    try {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (!params.has('r')) return null;
      const rotorPart = params.get('r');
      if (!/^[1-5]{3}$/.test(rotorPart)) return null;
      const rotors = Array.from(rotorPart, (digit) => E.ROTOR_IDS[Number(digit) - 1]);
      return E.normalizeConfig({
        rotors,
        reflector: params.get('u') || 'B',
        rings: params.get('g') || 'AAA',
        positions: params.get('p') || 'AAA',
        plugboard: params.get('s') || '',
      });
    } catch (error) {
      console.warn('Could not read key from URL:', error);
      return null;
    }
  }

  /* -----------------------------------------------------------------------
     Persistence & preferences
     ----------------------------------------------------------------------- */

  function loadPreferences() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;
      if (typeof saved.sound === 'boolean') state.sound = saved.sound;
      if (typeof saved.grouping === 'boolean') state.grouping = saved.grouping;
      try {
        const config = E.normalizeConfig({
          rotors: saved.rotors,
          reflector: saved.reflector,
          rings: saved.rings,
          positions: saved.start,
          plugboard: saved.plugboard,
        });
        state.rotors = [...config.rotors];
        state.reflector = config.reflector;
        state.rings = [...config.rings];
        state.start = [...config.positions];
        state.plugboard = [...config.plugboard];
      } catch (error) {
        console.warn('Stored key was invalid and has been ignored:', error);
      }
    } catch (error) {
      console.warn('Could not read saved state:', error);
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 1,
        rotors: state.rotors,
        reflector: state.reflector,
        rings: state.rings,
        start: state.start,
        plugboard: state.plugboard,
        sound: state.sound,
        grouping: state.grouping,
      }));
    } catch (error) {
      /* Private mode or a full quota should never break the machine. */
    }
  }

  function updateSoundButton() {
    els.soundBtn.classList.toggle('is-muted', !state.sound);
    els.soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    els.soundLabel.textContent = state.sound ? '音效开' : '音效静音';
  }

  function toggleSound() {
    state.sound = !state.sound;
    updateSoundButton();
    if (state.sound) {
      ensureAudio();
      playClick({ frequency: 1500, gain: 0.025 });
      toast('音效已开启');
    } else {
      toast('音效已静音');
    }
    saveState();
  }

  /* -----------------------------------------------------------------------
     Help dialog and self test
     ----------------------------------------------------------------------- */

  function openHelp() {
    if (typeof els.helpDialog.showModal === 'function') {
      if (!els.helpDialog.open) els.helpDialog.showModal();
    } else {
      els.helpDialog.setAttribute('open', '');
    }
  }

  function closeHelp() {
    if (typeof els.helpDialog.close === 'function') els.helpDialog.close();
    else els.helpDialog.removeAttribute('open');
  }

  function renderSelfTest(result) {
    els.selfTestResult.dataset.state = result.pass ? 'pass' : 'fail';
    els.selfTestResult.textContent = result.pass
      ? `通过 · AAAAA → ${result.ciphertext} · 回解 ${result.reciprocal}`
      : `失败 · 得到 ${result.ciphertext}，预期 ${result.expected}`;
  }

  function performSelfTest() {
    const result = E.runSelfTest();
    renderSelfTest(result);
    if (result.pass) {
      playDoneSound();
      toast('自检通过：AAAAA → BDZGO');
    } else {
      playError();
      toast('自检失败', 'error');
    }
  }

  /* -----------------------------------------------------------------------
     Actions / events
     ----------------------------------------------------------------------- */

  function handleAction(action) {
    switch (action) {
      case 'sound': toggleSound(); break;
      case 'help': openHelp(); break;
      case 'close-help': closeHelp(); break;
      case 'reset-pos': resetPositions(); break;
      case 'random-key': randomKey(); break;
      case 'copy-key': copyKeySheet(); break;
      case 'share-key': shareKey(); break;
      case 'run': runMessage(); break;
      case 'clear-message': clearMessage(); break;
      case 'use-output': useOutputAsInput(); break;
      case 'copy-output': copyOutput(); break;
      case 'copy-tape': copyTape(); break;
      case 'clear-tape': clearTape(); break;
      case 'random-plugs': randomizePlugs(); break;
      case 'clear-plugs': clearPlugs(); break;
      case 'self-test': performSelfTest(); break;
      case 'paste': pasteFromClipboard(); break;
      case 'toggle-reflector': toggleReflector(); break;
      default: break;
    }
  }

  function clearTape() {
    if (guardBusy()) return;
    state.tape = '';
    renderTape();
    toast('纸带已清空');
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (actionEl && !(actionEl instanceof HTMLInputElement)) {
        handleAction(actionEl.dataset.action);
      }
    });

    els.keyboard.addEventListener('click', (event) => {
      const key = event.target.closest('.key');
      if (key) pressLetter(key.dataset.key);
    });

    els.rotorControls.addEventListener('change', (event) => {
      if (event.target.matches('[data-rotor-select]')) {
        const slot = Number(event.target.closest('.rc').dataset.slot);
        setRotorType(slot, event.target.value);
      }
    });

    els.rotorControls.addEventListener('click', (event) => {
      const ringButton = event.target.closest('[data-ring-step]');
      if (ringButton) {
        const slot = Number(ringButton.closest('.rc').dataset.slot);
        stepRing(slot, Number(ringButton.dataset.ringStep));
        return;
      }
      const startButton = event.target.closest('[data-start-step]');
      if (startButton) {
        const slot = Number(startButton.closest('.rc').dataset.slot);
        stepStart(slot, Number(startButton.dataset.startStep));
      }
    });

    els.reflectorControl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-reflector]');
      if (button) setReflector(button.dataset.reflector);
    });

    els.plugRows.addEventListener('click', (event) => {
      const plug = event.target.closest('[data-plug]');
      if (plug) handlePlugClick(plug.dataset.plug);
    });

    els.plugPairs.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-unplug]');
      if (chip) removePlugPair(chip.dataset.unplug);
    });

    els.messageInput.addEventListener('input', updateCharCount);

    els.groupToggle.addEventListener('change', () => {
      state.grouping = els.groupToggle.checked;
      renderOutput();
      saveState();
    });

    els.helpDialog.addEventListener('click', (event) => {
      if (event.target === els.helpDialog) closeHelp();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (els.helpDialog.open) {
          closeHelp();
          return;
        }
        if (selectedPlug) {
          selectedPlug = null;
          renderPlugboard();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (els.helpDialog.open) return;
        event.preventDefault();
        runMessage();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat || event.isComposing) return;
      if (els.helpDialog.open) return;

      const target = event.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const editing = /input|textarea|select/.test(tag) || (target && target.isContentEditable);
      if (editing) return;

      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        pressLetter(event.key.toUpperCase());
      }
    });

    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(drawCables, 80);
    });

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => drawCables());
      observer.observe(els.keyboard.closest('.machine') || document.body);
    }

    document.addEventListener('pointerdown', () => {
      if (state.sound) ensureAudio();
    }, { once: true });
  }

  /* -----------------------------------------------------------------------
     Boot
     ----------------------------------------------------------------------- */

  function init() {
    loadPreferences();
    buildRotorDeck();
    buildLampsAndKeys();
    buildRotorControls();
    buildPlugboard();
    bindEvents();

    machine = createMachine(state, state.start);
    state.plugboard = machine.getConfig().plugboard;
    els.groupToggle.checked = state.grouping;

    renderAll();
    clearTrace();
    renderSelfTest(E.runSelfTest());
    updateSoundButton();

    const shared = readSharedConfig();
    if (shared) {
      installConfig(shared, { reset: true, clear: true });
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (error) {
        try {
          window.location.hash = '';
        } catch (hashError) {
          /* The key is loaded; only the address bar could not be tidied. */
        }
      }
      toast('已从分享链接载入密钥');
    }

    saveState();
  }

  init();
})();
