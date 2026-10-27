'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Enigma = require('../enigma-core.js');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

const baseConfig = {
  rotors: ['I', 'II', 'III'],
  reflector: 'B',
  rings: 'AAA',
  positions: 'AAA',
  plugboard: [],
};

test('published test vector: AAAAA -> BDZGO', () => {
  const machine = new Enigma.Machine(baseConfig);
  assert.equal(machine.encrypt('AAAAA'), 'BDZGO');
});

test('self test reports pass', () => {
  const result = Enigma.runSelfTest();
  assert.equal(result.pass, true);
  assert.equal(result.ciphertext, 'BDZGO');
  assert.equal(result.reciprocal, 'AAAAA');
});

test('encryption is reciprocal when positions are restored', () => {
  const config = { ...baseConfig, rings: 'QWE', plugboard: ['AB', 'CD', 'EF'] };
  const plain = 'THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG';
  const cipher = new Enigma.Machine(config).encrypt(plain);
  assert.notEqual(cipher, plain);
  const again = new Enigma.Machine(config).encrypt(cipher);
  assert.equal(again, plain);
});

test('right rotor always steps', () => {
  const machine = new Enigma.Machine(baseConfig);
  const moved = machine.step();
  assert.deepEqual(moved, [false, false, true]);
  assert.equal(machine.positionString, 'AAB');
});

test('right rotor at notch advances the middle rotor', () => {
  const machine = new Enigma.Machine({ ...baseConfig, positions: 'AAV' });
  const moved = machine.step();
  assert.deepEqual(moved, [false, true, true]);
  assert.equal(machine.positionString, 'ABW');
});

test('middle rotor at notch performs the double step', () => {
  const machine = new Enigma.Machine({ ...baseConfig, positions: 'AEV' });
  const moved = machine.step();
  assert.deepEqual(moved, [true, true, true]);
  assert.equal(machine.positionString, 'BFW');
});

test('rotor notch depends on the selected wheel', () => {
  const machine = new Enigma.Machine({
    ...baseConfig,
    rotors: ['III', 'II', 'I'],
    positions: 'AAQ',
  });
  const moved = machine.step();
  assert.deepEqual(moved, [false, true, true]);
});

test('fixed-position enciphering is a bijection and an involution', () => {
  const machine = new Enigma.Machine({ ...baseConfig, positions: 'KDO' });
  const outputs = [];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const out = machine.encipherLetter(letter).output;
    outputs.push(out);
    assert.equal(machine.encipherLetter(out).output, letter);
  }
  assert.equal(new Set(outputs).size, 26);
});

test('all five rotors and both reflectors are usable', () => {
  for (const rotor of Enigma.ROTOR_IDS) {
    for (const reflector of Enigma.REFLECTOR_IDS) {
      const others = Enigma.ROTOR_IDS.filter((id) => id !== rotor);
      const machine = new Enigma.Machine({
        ...baseConfig,
        rotors: [rotor, others[0], others[1]],
        reflector,
      });
      const out = machine.encrypt('ENIGMA');
      assert.match(out, /^[A-Z]{6}$/);
    }
  }
});

test('ring settings change the electrical path', () => {
  const a = new Enigma.Machine({ ...baseConfig, rings: 'AAA' }).encrypt('AAAAA');
  const b = new Enigma.Machine({ ...baseConfig, rings: 'ABC' }).encrypt('AAAAA');
  assert.notEqual(a, b);
});

test('plugboard is applied at both ends and canonicalises pairs', () => {
  const machine = new Enigma.Machine({ ...baseConfig, plugboard: 'ba dc' });
  assert.deepEqual(machine.getConfig().plugboard, ['AB', 'CD']);
  const plain = 'PLUGBOARD';
  const cipher = machine.encrypt(plain);
  const withPlugs = new Enigma.Machine({ ...baseConfig, plugboard: ['AB', 'CD'] });
  assert.equal(withPlugs.encrypt(cipher), plain);
});

test('plugboard validation rejects bad cables', () => {
  assert.throws(() => Enigma.normalizePlugboard(['AA']));
  assert.throws(() => Enigma.normalizePlugboard(['AB', 'BA']));
  assert.throws(() => Enigma.normalizePlugboard(['AB', 'BC']));
  assert.throws(() => Enigma.normalizePlugboard(Array.from({ length: 11 }, (_, i) => {
    const a = String.fromCharCode(65 + i * 2);
    const b = String.fromCharCode(66 + i * 2);
    return a + b;
  })));
});

test('config validation rejects invalid rotors and reflectors', () => {
  assert.throws(() => new Enigma.Machine({ ...baseConfig, rotors: ['I', 'II', 'VI'] }));
  assert.throws(() => new Enigma.Machine({ ...baseConfig, rotors: ['I', 'I', 'II'] }));
  assert.throws(() => new Enigma.Machine({ ...baseConfig, reflector: 'D' }));
  assert.throws(() => new Enigma.Machine({ ...baseConfig, rings: 'AA' }));
});

test('non letters are ignored by encrypt()', () => {
  const machine = new Enigma.Machine(baseConfig);
  assert.equal(machine.encrypt('A A-A\nA'), 'BDZG');
  assert.equal(new Enigma.Machine(baseConfig).encrypt('AAAAA'), 'BDZGO');
});

test('positions wrap from Z to A', () => {
  const machine = new Enigma.Machine({ ...baseConfig, positions: 'AAZ' });
  machine.step();
  assert.equal(machine.positionString, 'AAA');
  machine.step();
  assert.equal(machine.positionString, 'AAB');
});

test('a long run keeps every letter in A-Z and stays reciprocal', () => {
  const config = {
    ...baseConfig,
    rotors: ['V', 'III', 'II'],
    reflector: 'C',
    rings: 'XYZ',
    plugboard: 'AT BL DF GJ HM NW OP QY RZ VX',
  };
  const plain = 'ATTACKATDAWN'.repeat(20);
  const cipher = new Enigma.Machine(config).encrypt(plain);
  assert.equal(cipher.length, plain.length);
  assert.match(cipher, /^[A-Z]+$/);
  assert.equal(new Enigma.Machine(config).encrypt(cipher), plain);
});

test('matches an independent reference implementation on random settings', () => {
  fixtures.forEach((fixture) => {
    const machine = new Enigma.Machine(fixture.config);
    assert.equal(
      machine.encrypt(fixture.plaintext),
      fixture.ciphertext,
      `mismatch for ${JSON.stringify(fixture.config)}`
    );
  });
});
