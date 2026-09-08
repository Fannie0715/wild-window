"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sandbox = { module: { exports: {} }, RangeError };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../public/observation-game/game-core.js"), "utf8"), sandbox, { filename: "game-core.js" });
const game = sandbox.module.exports;

function seeded(seed) {
  return function () {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("every game contains each animal once and exactly three distinct choices per round", () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const state = game.createGame(seeded(seed));
    assert.equal(state.rounds.length, 6);
    assert.equal(new Set(state.rounds.map(round => round.animal.id)).size, 6);
    state.rounds.forEach(round => {
      assert.equal(round.choices.length, 3);
      assert.equal(new Set(round.choices.map(choice => choice.id)).size, 3);
      assert.equal(round.choices.filter(choice => choice.id === round.animal.id).length, 1);
    });
    assert.equal(state.phase, "question");
    assert.equal(state.score, 0);
    assert.equal(state.index, 0);
    assert.equal(state.answers.length, 0);
  }
});

test("seeded randomness changes round order and answer positions", () => {
  const first = game.createGame(seeded(11));
  const second = game.createGame(seeded(92));
  assert.notDeepEqual(first.rounds.map(r => r.animal.id), second.rounds.map(r => r.animal.id));
  const positions = new Set();
  for (let seed = 0; seed < 30; seed += 1) {
    game.createGame(seeded(seed)).rounds.forEach(round => positions.add(round.choices.findIndex(c => c.id === round.animal.id)));
  }
  assert.equal(positions.size, 3);
});

test("cannot advance an unanswered question or submit an unavailable answer", () => {
  const state = game.createGame(seeded(10));
  assert.strictEqual(game.nextRound(state), state);
  assert.strictEqual(game.answerQuestion(state, "not-an-animal"), state);
  const unavailable = game.animals.find(a => !state.rounds[0].choices.some(c => c.id === a.id));
  assert.strictEqual(game.answerQuestion(state, unavailable.id), state);
});

test("correct answers score once, preserve input state and lock the answer", () => {
  const original = game.createGame(seeded(1));
  const answered = game.answerQuestion(original, original.rounds[0].animal.id);
  assert.equal(answered.score, 1);
  assert.equal(answered.phase, "feedback");
  assert.equal(answered.answers.length, 1);
  assert.equal(answered.answers[0].correct, true);
  assert.equal(original.score, 0);
  assert.equal(original.answers.length, 0);
  assert.strictEqual(game.answerQuestion(answered, answered.rounds[0].choices[0].id), answered);
  assert.strictEqual(game.answerQuestion(answered, answered.rounds[0].animal.id), answered);
});

test("wrong answers record the chosen animal without increasing score", () => {
  const state = game.createGame(seeded(5));
  const wrong = state.rounds[0].choices.find(c => c.id !== state.rounds[0].animal.id);
  const answered = game.answerQuestion(state, wrong.id);
  assert.equal(answered.score, 0);
  assert.equal(answered.answers[0].selectedId, wrong.id);
  assert.equal(answered.answers[0].correct, false);
  assert.equal(game.nextRound(answered).index, 1);
});

test("six mixed rounds produce exact score and complete only after last feedback", () => {
  let state = game.createGame(seeded(18));
  for (let index = 0; index < 6; index += 1) {
    assert.equal(state.index, index);
    assert.equal(state.phase, "question");
    const round = state.rounds[index];
    const choice = index % 2 === 0 ? round.animal : round.choices.find(c => c.id !== round.animal.id);
    state = game.answerQuestion(state, choice.id);
    assert.equal(state.phase, "feedback");
    assert.equal(state.answers.length, index + 1);
    state = game.nextRound(state);
  }
  assert.equal(state.phase, "complete");
  assert.equal(state.score, 3);
  assert.equal(state.index, 5);
  assert.equal(state.answers.length, 6);
  assert.strictEqual(game.nextRound(state), state);
  assert.strictEqual(game.answerQuestion(state, state.rounds[5].animal.id), state);
});

test("perfect and all-wrong sessions remain in the expected score range; replay resets", () => {
  for (const correct of [true, false]) {
    let state = game.createGame(seeded(33));
    for (let i = 0; i < 6; i += 1) {
      const round = state.rounds[state.index];
      const choice = correct ? round.animal : round.choices.find(c => c.id !== round.animal.id);
      state = game.nextRound(game.answerQuestion(state, choice.id));
    }
    assert.equal(state.score, correct ? 6 : 0);
    assert.equal(state.phase, "complete");
    const replay = game.createGame(seeded(34));
    assert.equal(replay.score, 0);
    assert.equal(replay.answers.length, 0);
    assert.equal(replay.phase, "question");
    assert.notDeepEqual(replay.rounds.map(r => r.animal.id), state.rounds.map(r => r.animal.id));
  }
});

test("shuffle never mutates its input and rejects invalid random sources", () => {
  const items = Object.freeze([1, 2, 3, 4]);
  assert.deepEqual(game.shuffle(items, () => 0), [2, 3, 4, 1]);
  assert.deepEqual(items, [1, 2, 3, 4]);
  for (const invalid of [1, -0.1, NaN, Infinity, "0.5"]) {
    assert.throws(() => game.shuffle(items, () => invalid), RangeError);
  }
});

test("offline entry uses only local external scripts and has all required assets", () => {
  const root = path.resolve(__dirname, "../public/observation-game");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  const js = fs.readFileSync(path.join(root, "game.js"), "utf8") + fs.readFileSync(path.join(root, "game-core.js"), "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  scripts.forEach(match => {
    assert.equal(match[2].trim(), "");
    const source = match[1].match(/src="(\.\/[^\"]+\.js)"/);
    assert.ok(source);
    assert.ok(fs.existsSync(path.join(root, source[1])));
  });
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<iframe|javascript:/i);
  assert.doesNotMatch(html + css + js, /https?:\/\/|\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(|new\s+Function|WebAssembly|new\s+(?:Shared)?Worker/);
  assert.ok(fs.existsSync(path.join(root, "icon.svg")));
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /lang="zh-CN"/);
  assert.match(css, /min-height: 58px/);
});
