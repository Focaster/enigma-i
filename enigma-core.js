/*
 * enigma-core.js — a faithful software model of the Enigma I (M3)
 *
 * Rotor wiring, notches, reflectors and the stepping mechanism follow the
 * historical Wehrmacht machine:
 *   - five exchangeable rotors (I–V) with ring settings (Ringstellung)
 *   - reflectors B and C (UKW-B / UKW-C)
 *   - a 26-jack plugboard with up to 10 cables (Steckerbrett)
 *   - the famous double step of the middle rotor
 *
 * The model is pure: it has no DOM dependencies, so it can be unit tested in
 * Node and reused anywhere.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Enigma = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LETTER_A = 65;
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const mod = (n, m) => ((n % m) + m) % m;
  const toIndex = (letter) => letter.charCodeAt(0) - LETTER_A;
  const toLetter = (index) => String.fromCharCode(LETTER_A + mod(index, 26));

  /* Historical wiring, left to right as seen from the operator's side.
     The notch letter is the window letter at which a rotor turns over. */
  const ROTOR_DATA = {
    I: { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
    II: { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
    III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
    IV: { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' },
    V: { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z' },
  };

  const REFLECTOR_DATA = {
    B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
    C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL',
  };

  const ROTOR_IDS = Object.keys(ROTOR_DATA);
  const REFLECTOR_IDS = Object.keys(REFLECTOR_DATA);
  const MAX_PLUGS = 10;

  function invert(wiring) {
    const inverse = new Array(26);
    for (let i = 0; i < 26; i += 1) inverse[toIndex(wiring[i])] = i;
    return inverse;
  }

  const ROTORS = Object.create(null);
  ROTOR_IDS.forEach((id) => {
    const { wiring, notch } = ROTOR_DATA[id];
    ROTORS[id] = Object.freeze({
      id,
      wiring,
      notch,
      notchIndex: toIndex(notch),
      forward: Object.freeze(Array.from(wiring, toIndex)),
      backward: Object.freeze(invert(wiring)),
    });
  });

  const REFLECTORS = Object.create(null);
  REFLECTOR_IDS.forEach((id) => {
    REFLECTORS[id] = Object.freeze({
      id,
      wiring: REFLECTOR_DATA[id],
      map: Object.freeze(Array.from(REFLECTOR_DATA[id], toIndex)),
    });
  });

  function isLetter(value) {
    return typeof value === 'string' && /^[A-Za-z]$/.test(value);
  }

  function normalizeLetter(value) {
    if (typeof value === 'number' && Number.isInteger(value)) return toLetter(value);
    if (isLetter(value)) return value.toUpperCase();
    throw new Error('Expected a single letter A–Z, got: ' + String(value));
  }

  function normalizeTriplet(value, fallback) {
    let source = value == null ? fallback : value;
    if (typeof source === 'string') {
      if (!/^[A-Za-z]{3}$/.test(source)) {
        throw new Error('Expected three letters, got: ' + source);
      }
      source = Array.from(source.toUpperCase());
    }
    if (!Array.isArray(source) || source.length !== 3) {
      throw new Error('Expected an array or string of three letters');
    }
    return source.map(normalizeLetter);
  }

  function normalizePlugboard(value) {
    let pairs = [];
    if (value == null || value === '') pairs = [];
    else if (typeof value === 'string') pairs = value.toUpperCase().split(/[\s,;]+/).filter(Boolean);
    else if (Array.isArray(value)) pairs = value.map((pair) => String(pair).toUpperCase());
    else throw new Error('Plugboard must be a string or an array of pairs');

    const seen = new Set();
    const normalized = [];
    pairs.forEach((pair) => {
      if (!/^[A-Z]{2}$/.test(pair)) throw new Error('Invalid plugboard pair: ' + pair);
      const [a, b] = pair.split('');
      if (a === b) throw new Error('A cable cannot connect a letter to itself: ' + pair);
      if (seen.has(a) || seen.has(b)) {
        throw new Error('A letter is used by more than one cable: ' + a + '/' + b);
      }
      seen.add(a);
      seen.add(b);
      normalized.push([a, b].sort().join(''));
    });
    if (normalized.length > MAX_PLUGS) {
      throw new Error('The plugboard accepts at most ' + MAX_PLUGS + ' cables');
    }
    return normalized;
  }

  function buildPlugMap(pairs) {
    const map = Array.from({ length: 26 }, (_, i) => i);
    pairs.forEach((pair) => {
      const a = toIndex(pair[0]);
      const b = toIndex(pair[1]);
      map[a] = b;
      map[b] = a;
    });
    return map;
  }

  /* Accept the many shapes a key sheet can take and return a clean config. */
  function normalizeConfig(input) {
    const source = input || {};
    const rotors = (source.rotors || ['I', 'II', 'III']).map((id) => String(id).toUpperCase());
    if (rotors.length !== 3) throw new Error('Exactly three rotors are required');
    rotors.forEach((id) => {
      if (!ROTORS[id]) throw new Error('Unknown rotor: ' + id);
    });
    if (new Set(rotors).size !== 3) throw new Error('Each rotor can only be used once');

    const reflector = String(source.reflector || 'B').toUpperCase();
    if (!REFLECTORS[reflector]) throw new Error('Unknown reflector: ' + reflector);

    return {
      rotors,
      reflector,
      rings: normalizeTriplet(source.rings, 'AAA'),
      positions: normalizeTriplet(source.positions, 'AAA'),
      plugboard: normalizePlugboard(source.plugboard),
    };
  }

  /* A rotor transforms a contact index from its right-hand face to its
     left-hand face. `shift` is the position of the wiring relative to the
     fixed ring: position P with ring R means the wiring is rotated by P − R. */
  function forwardThrough(spec, contact, shift) {
    return mod(spec.forward[mod(contact + shift, 26)] - shift, 26);
  }

  function backwardThrough(spec, contact, shift) {
    return mod(spec.backward[mod(contact + shift, 26)] - shift, 26);
  }

  class Machine {
    constructor(config) {
      this.setConfig(config);
    }

    setConfig(config) {
      this.config = normalizeConfig(config);
      this.specs = this.config.rotors.map((id) => ROTORS[id]);
      this.reflector = REFLECTORS[this.config.reflector];
      this.ringOffsets = this.config.rings.map(toIndex);
      this.contacts = this.config.positions.map(toIndex);
      this.plugMap = buildPlugMap(this.config.plugboard);
      this.steps = 0;
      this.resetPositions(this.config.positions);
      return this;
    }

    resetPositions(value) {
      this.config.positions = normalizeTriplet(value, 'AAA');
      this.contacts = this.config.positions.map(toIndex);
      this.steps = 0;
      return this;
    }

    setPositions(value) {
      const letters = normalizeTriplet(value, 'AAA');
      this.contacts = letters.map(toIndex);
      this.config.positions = letters;
      return this;
    }

    get positions() {
      return this.contacts.map(toLetter);
    }

    get positionString() {
      return this.positions.join('');
    }

    get ringString() {
      return this.config.rings.join('');
    }

    isAtNotch(slot) {
      return this.contacts[slot] === this.specs[slot].notchIndex;
    }

    get notchFlags() {
      return [0, 1, 2].map((slot) => this.isAtNotch(slot));
    }

    /* Step the rotors BEFORE the current key is enciphered, exactly like the
       real machine. Returns which of the three wheels moved.
       Double stepping: if the middle wheel sits in its notch it advances and
       pushes the left wheel along, no matter what the right wheel does. */
    step() {
      const moved = [false, false, false];
      const middleNotch = this.specs[1].notchIndex;
      const rightNotch = this.specs[2].notchIndex;

      if (this.contacts[1] === middleNotch) {
        this.contacts[1] = mod(this.contacts[1] + 1, 26);
        moved[1] = true;
        this.contacts[0] = mod(this.contacts[0] + 1, 26);
        moved[0] = true;
      } else if (this.contacts[2] === rightNotch) {
        this.contacts[1] = mod(this.contacts[1] + 1, 26);
        moved[1] = true;
      }
      this.contacts[2] = mod(this.contacts[2] + 1, 26);
      moved[2] = true;

      this.steps += 1;
      return moved;
    }

    /* Pure electrical path for one letter (no stepping, no plugboard state
       change). Returns the output letter and every transformation. */
    encipherLetter(letter) {
      const input = normalizeLetter(letter);
      let contact = toIndex(input);
      const trace = [{ stage: 'input', from: input, to: input }];

      const afterPlugIn = this.plugMap[contact];
      trace.push({
        stage: 'plug',
        pass: 'in',
        from: toLetter(contact),
        to: toLetter(afterPlugIn),
      });
      contact = afterPlugIn;

      for (let slot = 2; slot >= 0; slot -= 1) {
        const before = contact;
        const shift = mod(this.contacts[slot] - this.ringOffsets[slot], 26);
        contact = forwardThrough(this.specs[slot], contact, shift);
        trace.push({
          stage: 'rotor',
          slot,
          direction: 'forward',
          rotor: this.specs[slot].id,
          from: toLetter(before),
          to: toLetter(contact),
        });
      }

      const beforeReflector = contact;
      contact = this.reflector.map[contact];
      trace.push({
        stage: 'reflector',
        reflector: this.reflector.id,
        from: toLetter(beforeReflector),
        to: toLetter(contact),
      });

      for (let slot = 0; slot <= 2; slot += 1) {
        const before = contact;
        const shift = mod(this.contacts[slot] - this.ringOffsets[slot], 26);
        contact = backwardThrough(this.specs[slot], contact, shift);
        trace.push({
          stage: 'rotor',
          slot,
          direction: 'backward',
          rotor: this.specs[slot].id,
          from: toLetter(before),
          to: toLetter(contact),
        });
      }

      const beforePlugOut = contact;
      contact = this.plugMap[contact];
      trace.push({
        stage: 'plug',
        pass: 'out',
        from: toLetter(beforePlugOut),
        to: toLetter(contact),
      });

      trace.push({ stage: 'lamp', from: toLetter(contact), to: toLetter(contact) });

      return { input, output: toLetter(contact), trace };
    }

    /* The real interaction: step, then encipher one letter. */
    processLetter(letter) {
      const stepped = this.step();
      const result = this.encipherLetter(letter);
      return {
        ...result,
        stepped,
        positions: this.positions,
        positionString: this.positionString,
        atNotch: this.notchFlags,
      };
    }

    /* Encipher a whole string from the current positions. Characters other
       than A–Z are ignored. */
    encrypt(text) {
      let out = '';
      for (const char of String(text)) {
        if (/^[A-Za-z]$/.test(char)) out += this.processLetter(char).output;
      }
      return out;
    }

    getConfig() {
      return {
        rotors: [...this.config.rotors],
        reflector: this.config.reflector,
        rings: [...this.config.rings],
        positions: this.positions,
        plugboard: [...this.config.plugboard],
      };
    }
  }

  /* The classic published test vector: rotors I-II-III, UKW-B, all rings and
     positions at A, no cables, "AAAAA" must produce "BDZGO". */
  const KNOWN_VECTOR = Object.freeze({
    plaintext: 'AAAAA',
    ciphertext: 'BDZGO',
    config: Object.freeze({
      rotors: ['I', 'II', 'III'],
      reflector: 'B',
      rings: 'AAA',
      positions: 'AAA',
      plugboard: [],
    }),
  });

  function runSelfTest() {
    const machine = new Machine(KNOWN_VECTOR.config);
    const ciphertext = machine.encrypt(KNOWN_VECTOR.plaintext);
    const reciprocal = new Machine({
      ...KNOWN_VECTOR.config,
      positions: 'AAA',
    }).encrypt(ciphertext);
    return {
      pass: ciphertext === KNOWN_VECTOR.ciphertext && reciprocal === KNOWN_VECTOR.plaintext,
      ciphertext,
      expected: KNOWN_VECTOR.ciphertext,
      reciprocal,
    };
  }

  return Object.freeze({
    Machine,
    ROTORS,
    REFLECTORS,
    ROTOR_IDS: [...ROTOR_IDS],
    REFLECTOR_IDS: [...REFLECTOR_IDS],
    MAX_PLUGS,
    KNOWN_VECTOR,
    runSelfTest,
    normalizeConfig,
    normalizePlugboard,
    normalizeLetter,
    toIndex,
    toLetter,
  });
});
