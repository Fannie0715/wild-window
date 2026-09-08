(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.WildObservation = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ANIMALS = Object.freeze([
    Object.freeze({ id: "elephant", name: "大象", clue: "它用灵活的长鼻子取食、饮水，还有一对宽大的耳朵。", fact: "大象的长鼻子由鼻子和上唇延伸而成，既能呼吸，也能抓取食物。" }),
    Object.freeze({ id: "zebra", name: "斑马", clue: "它身上有醒目的黑白条纹，外形像马，常在草地上吃草。", fact: "斑马身上的条纹分布各不相同，就像各有一套自己的花纹。" }),
    Object.freeze({ id: "giraffe", name: "长颈鹿", clue: "它有很长的脖子和腿，身上带着斑块，能吃到树上高处的叶子。", fact: "长颈鹿主要吃树木和灌木的叶子，长脖子能帮助它够到高处的食物。" }),
    Object.freeze({ id: "albatross", name: "信天翁", clue: "它是一种海鸟，翅膀修长，常张开双翼，借风在海面上滑翔。", fact: "信天翁善于利用风在海上滑翔，寻找鱼类、鱿鱼等食物。" }),
    Object.freeze({ id: "panda", name: "大熊猫", clue: "它有黑眼圈、黑耳朵和黑色四肢，身体大部分是白色，最常吃竹子。", fact: "野生大熊猫生活在中国的山地森林中，竹子是它们的主要食物。" }),
    Object.freeze({ id: "milu", name: "麋鹿", clue: "它是一种鹿，雄性长角，尾巴较长，宽大的蹄子适合在湿地活动。", fact: "麋鹿又叫“四不像”，喜欢在湿地生活，也会游泳。" })
  ]);

  function shuffle(items, random) {
    var result = items.slice();
    var rng = random || Math.random;
    for (var i = result.length - 1; i > 0; i -= 1) {
      var value = rng();
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError("Random source must return a number from 0 (inclusive) to 1 (exclusive).");
      }
      var j = Math.floor(value * (i + 1));
      var temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  function createGame(random) {
    var rng = random || Math.random;
    var rounds = shuffle(ANIMALS, rng).map(function (animal) {
      var alternatives = shuffle(ANIMALS.filter(function (candidate) { return candidate.id !== animal.id; }), rng).slice(0, 2);
      return Object.freeze({ animal: animal, choices: Object.freeze(shuffle([animal].concat(alternatives), rng)) });
    });
    return Object.freeze({ rounds: Object.freeze(rounds), index: 0, score: 0, answers: Object.freeze([]), phase: "question" });
  }

  function answerQuestion(state, selectedId) {
    if (state.phase !== "question") { return state; }
    var round = state.rounds[state.index];
    if (!round.choices.some(function (choice) { return choice.id === selectedId; })) { return state; }
    var correct = selectedId === round.animal.id;
    var answer = Object.freeze({ animalId: round.animal.id, selectedId: selectedId, correct: correct });
    return Object.freeze({ rounds: state.rounds, index: state.index, score: state.score + (correct ? 1 : 0), answers: Object.freeze(state.answers.concat([answer])), phase: "feedback" });
  }

  function nextRound(state) {
    if (state.phase !== "feedback") { return state; }
    if (state.index === state.rounds.length - 1) {
      return Object.freeze({ rounds: state.rounds, index: state.index, score: state.score, answers: state.answers, phase: "complete" });
    }
    return Object.freeze({ rounds: state.rounds, index: state.index + 1, score: state.score, answers: state.answers, phase: "question" });
  }

  function resultCopy(score) {
    if (score === ANIMALS.length) { return { rank: "观察员 · 目光如炬", message: "六位动物朋友，你都认出来了。带着这份好奇心，再翻一遍观察笔记吧。" }; }
    if (score >= 4) { return { rank: "观察员 · 渐入佳境", message: "你已经记住了不少特征。把刚刚错过的线索记下来，下次会更熟悉。" }; }
    return { rank: "观察员 · 新鲜眼光", message: "每认识一位动物，都是一次新发现。看看这次的记录，再来慢慢观察。" };
  }

  return Object.freeze({ animals: ANIMALS, shuffle: shuffle, createGame: createGame, answerQuestion: answerQuestion, nextRound: nextRound, resultCopy: resultCopy });
}));
