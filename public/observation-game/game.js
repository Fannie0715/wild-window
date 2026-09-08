(function () {
  "use strict";
  var core = window.WildObservation;
  var state = core.createGame();
  var BEST_KEY = "wild-window-observation-best-v1";
  var ids = ["game-screen", "result-screen", "round-number", "current-score", "round-progress", "clue-kicker", "clue-heading", "clue-text", "choices", "feedback", "feedback-symbol", "feedback-title", "feedback-fact", "next-button", "next-label", "choice-hint", "result-heading", "result-rank", "final-score", "result-message", "best-score", "storage-note", "review-list", "replay-button"];
  var ui = {};
  ids.forEach(function (id) { ui[id] = document.getElementById(id); });

  function twoDigits(value) { return String(value).padStart(2, "0"); }
  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) { element.className = className; }
    if (text !== undefined) { element.textContent = text; }
    return element;
  }
  function clear(element) {
    while (element.firstChild) { element.removeChild(element.firstChild); }
  }
  function focusHeading(element) {
    element.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function renderProgress() {
    ui["round-progress"].setAttribute("aria-valuenow", String(state.answers.length));
    ui["round-progress"].setAttribute("aria-valuetext", "已完成 " + state.answers.length + " 轮，共 6 轮");
    Array.prototype.forEach.call(ui["round-progress"].children, function (segment, index) {
      segment.className = index < state.answers.length ? "is-complete" : (index === state.index ? "is-current" : "");
    });
    ui["current-score"].textContent = state.score;
  }
  function renderQuestion(shouldFocus) {
    var round = state.rounds[state.index];
    ui["game-screen"].hidden = false;
    ui["result-screen"].hidden = true;
    ui["round-number"].textContent = twoDigits(state.index + 1);
    ui["clue-kicker"].textContent = "观察记录 · " + twoDigits(state.index + 1);
    ui["clue-heading"].textContent = "仔细看看，这是谁？";
    ui["clue-heading"].setAttribute("aria-label", "第 " + (state.index + 1) + " 轮，共 6 轮。仔细看看，这是谁？");
    ui["clue-text"].textContent = round.animal.clue;
    ui["feedback"].hidden = true;
    ui["next-button"].hidden = true;
    ui["choice-hint"].hidden = false;
    clear(ui["choices"]);
    round.choices.forEach(function (animal, index) {
      var button = node("button", "choice");
      button.type = "button";
      button.dataset.animalId = animal.id;
      var key = node("span", "choice-key", String.fromCharCode(65 + index));
      key.setAttribute("aria-hidden", "true");
      button.appendChild(key);
      button.appendChild(node("span", "choice-name", animal.name));
      button.addEventListener("click", function () { selectAnswer(animal.id); });
      ui["choices"].appendChild(button);
    });
    renderProgress();
    if (shouldFocus) { focusHeading(ui["clue-heading"]); }
  }
  function selectAnswer(animalId) {
    var nextState = core.answerQuestion(state, animalId);
    if (nextState === state) { return; }
    state = nextState;
    var round = state.rounds[state.index];
    var answer = state.answers[state.answers.length - 1];
    Array.prototype.forEach.call(ui["choices"].children, function (button) {
      button.disabled = true;
      var id = button.dataset.animalId;
      if (id === round.animal.id) {
        button.classList.add("is-correct");
        button.appendChild(node("span", "choice-mark", "✓ 正确"));
      } else if (id === animalId) {
        button.classList.add("is-wrong");
        button.appendChild(node("span", "choice-mark", "× 已选"));
      } else {
        button.classList.add("is-muted");
      }
    });
    ui["feedback-symbol"].textContent = answer.correct ? "✓" : "↳";
    ui["feedback-title"].textContent = answer.correct ? "认出来了，是" + round.animal.name : "这位朋友是" + round.animal.name;
    ui["feedback-fact"].textContent = round.animal.fact;
    ui["feedback"].hidden = false;
    ui["next-label"].textContent = state.index === state.rounds.length - 1 ? "查看值班记录" : "下一条线索";
    ui["next-button"].hidden = false;
    ui["choice-hint"].hidden = true;
    renderProgress();
  }
  function saveBest(score) {
    var best = score;
    var saved = true;
    try {
      var raw = window.localStorage.getItem(BEST_KEY);
      var previous = raw === null ? null : Number(raw);
      if (raw !== null && raw.trim() !== "" && Number.isInteger(previous) && previous >= 0 && previous <= 6) {
        best = Math.max(score, previous);
      }
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch (error) { saved = false; }
    return { best: best, saved: saved };
  }
  function renderResult() {
    var copy = core.resultCopy(state.score);
    var record = saveBest(state.score);
    ui["game-screen"].hidden = true;
    ui["result-screen"].hidden = false;
    ui["result-rank"].textContent = copy.rank;
    ui["final-score"].textContent = state.score;
    ui["result-message"].textContent = copy.message;
    ui["best-score"].textContent = record.best + " / 6";
    ui["storage-note"].hidden = record.saved;
    clear(ui["review-list"]);
    state.rounds.forEach(function (round, index) {
      var answer = state.answers[index];
      var item = node("li", "review-item");
      item.appendChild(node("span", "review-number", twoDigits(index + 1)));
      item.appendChild(node("span", "review-name", round.animal.name));
      item.appendChild(node("span", "review-result" + (answer.correct ? "" : " was-wrong"), answer.correct ? "✓ 认出来了" : "↳ 新认识"));
      if (!answer.correct) {
        var selected = round.choices.find(function (animal) { return animal.id === answer.selectedId; });
        item.appendChild(node("span", "review-detail", "你选了" + selected.name + "。" + round.animal.fact));
      }
      ui["review-list"].appendChild(item);
    });
    focusHeading(ui["result-heading"]);
  }
  ui["next-button"].addEventListener("click", function () {
    var nextState = core.nextRound(state);
    if (nextState === state) { return; }
    state = nextState;
    if (state.phase === "complete") { renderResult(); } else { renderQuestion(true); }
  });
  ui["replay-button"].addEventListener("click", function () {
    state = core.createGame();
    renderQuestion(true);
  });
  renderQuestion(false);
}());
