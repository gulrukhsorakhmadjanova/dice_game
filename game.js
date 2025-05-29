const crypto = require('crypto');
const readline = require('readline');
const { table } = require('table');

// ==================== Error Handling ====================
class ValidationError {
  constructor(message, example = "Example: 1,2,3,4,5,6 2,2,4,4,6,6 3,3,3,5,5,5") {
    this.message = message;
    this.example = example;
  }

  toString() {
    return `Error: ${this.message}\n${this.example}`;
  }

  static get NotEnoughDice() {
    return new ValidationError(
      "Please specify at least three dice.",
      "Example: 1,2,3,4,5,6 2,2,4,4,6,6 3,3,3,5,5,5"
    );
  }

  static get InvalidDieFormat() {
    return new ValidationError(
      "Each die must be comma-separated integers.",
      "Valid: 1,2,3,4,5,6\nInvalid: 1, 2, 3 or 1.2.3"
    );
  }

  static get NonIntegerFace() {
    return new ValidationError(
      "All die faces must be integers.",
      "Valid: 1,2,3,4,5,6\nInvalid: 1,two,3 or 1.5,2,3"
    );
  }
}

// ==================== Core Game Classes ====================
class Dice {
  constructor(values) {
    this.values = values;
    this.size = values.length;
  }

  toString() {
    return `[${this.values.join(',')}]`;
  }

  roll(index) {
    return this.values[index];
  }
}

class FairRandomProtocol {
  constructor(min, max) {
    this.min = min;
    this.max = max;
    this.range = max - min + 1;
    this.key = crypto.randomBytes(32);
    this.number = null;
    this.hmac = null;
  }

  getHmac() {
    if (this.number === null) {
      this.number = this.generateSecureNumber();
      const hmac = crypto.createHmac('sha3-256', this.key);
      hmac.update(this.number.toString());
      this.hmac = hmac.digest('hex');
    }
    return this.hmac;
  }

  getResult(userNumber) {
    return {
      result: this.number,
      key: this.key.toString('hex')
    };
  }

  generateSecureNumber() {
    const range = this.max - this.min + 1;
    const randomBytes = crypto.randomBytes(4).readUInt32BE(0);
    return this.min + (randomBytes % range);
  }
} 

class ProbabilityCalculator {
  static calculate(dice) {
    const probabilities = {};
    for (let i = 0; i < dice.length; i++) {
      for (let j = 0; j < dice.length; j++) {
        if (i === j) continue;

        let wins = 0;
        let total = 0;

        for (const val1 of dice[i].values) {
          for (const val2 of dice[j].values) {
            if (val1 > val2) wins++;
            total++;
          }
        }

        probabilities[`${i},${j}`] = wins / total;
      }
    }
    return probabilities;
  }
}

// ==================== Game Logic ====================
class DiceGame {
  constructor(diceConfigs) {
    this.dice = diceConfigs.map(config => new Dice(config));
    this.currentPlayer = null;
    this.selectedDice = {};
    this.probabilities = ProbabilityCalculator.calculate(this.dice);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    try {
      console.log("Let's determine who makes the first move.");
      await this.determineFirstPlayer();
      await this.playRound();
    } catch (err) {
      if (err !== 'USER_EXIT') {
        console.error('An error occurred:', err);
      }
    } finally {
      this.rl.close();
    }
  }

  async determineFirstPlayer() {
    const protocol = new FairRandomProtocol(0, 1);
    const hmac = protocol.getHmac();

    console.log(`I selected a random value in the range 0..1 (HMAC=${hmac}).`);
    console.log("Try to guess my selection.");
    console.log("0 - 0");
    console.log("1 - 1");
    console.log("X - exit");
    console.log("? - help");

    const choice = await this.getInput("Your selection: ");
    if (choice === '?') {
      await this.showHelp();
      return this.determineFirstPlayer();
    }
    if (choice === 'X') throw 'USER_EXIT';

    const { result, key } = protocol.getResult(parseInt(choice, 10));
    console.log(`My selection: ${result} (KEY=${key}).`);

    this.currentPlayer = choice === result.toString() ? 'user' : 'computer';
    console.log(`${this.currentPlayer === 'user' ? 'You' : 'I'} make the first move.`);
  }

  async playRound() {
    if (this.currentPlayer === 'computer') {
      await this.computerSelectDice();
      await this.userSelectDice();
    } else {
      await this.userSelectDice();
      await this.computerSelectDice();
    }

    await this.performRolls();
    this.compareResults();

    const playAgain = await this.getInput("\nPlay another round? (y/n): ");
    if (playAgain.toLowerCase() === 'y') {
      this.selectedDice = {};
      return this.playRound();
    }
  }

  async computerSelectDice() {
    const available = this.getAvailableDice();
    const opponentDie = this.selectedDice.user;

    let bestDie = available[0];
    let bestProb = opponentDie !== undefined
      ? this.probabilities[`${bestDie},${opponentDie}`] || 0
      : 0.5;

    for (const die of available.slice(1)) {
      const prob = opponentDie !== undefined
        ? this.probabilities[`${die},${opponentDie}`] || 0
        : 0.5;

      if (prob > bestProb) {
        bestProb = prob;
        bestDie = die;
      }
    }

    this.selectedDice.computer = bestDie;
    console.log(`I choose the ${this.dice[bestDie].toString()} dice.`);
  }

  async userSelectDice() {
    const available = this.getAvailableDice();

    console.log("Choose your dice:");
    available.forEach((dieIdx, i) => {
      console.log(`${i} - ${this.dice[dieIdx].toString()}`);
    });
    console.log("X - exit");
    console.log("? - help");

    const choice = await this.getInput("Your selection: ");
    if (choice === '?') {
      await this.showHelp();
      return this.userSelectDice();
    }
    if (choice === 'X') throw 'USER_EXIT';

    const selected = available[parseInt(choice, 10)];
    this.selectedDice.user = selected;
    console.log(`You choose the ${this.dice[selected].toString()} dice.`);
  }

  async performRolls() {
    if (this.currentPlayer === 'computer') {
      this.computerRoll = await this.performRoll(this.selectedDice.computer, "computer");
      this.userRoll = await this.performRoll(this.selectedDice.user, "user");
    } else {
      this.userRoll = await this.performRoll(this.selectedDice.user, "user");
      this.computerRoll = await this.performRoll(this.selectedDice.computer, "computer");
    }
  }

  async performRoll(dieIdx, player) {
    const die = this.dice[dieIdx];
    const protocol = new FairRandomProtocol(0, die.size - 1);
    const hmac = protocol.getHmac();

    console.log(`It's time for ${player === 'user' ? 'your' : 'my'} roll.`);
    console.log(`I selected a random value in the range 0..${die.size - 1} (HMAC=${hmac}).`);
    console.log(`Add your number modulo ${die.size}.`);
    for (let i = 0; i < die.size; i++) console.log(`${i} - ${i}`);
    console.log("X - exit");
    console.log("? - help");

    const choice = await this.getInput("Your selection: ");
    if (choice === '?') {
      await this.showHelp();
      return this.performRoll(dieIdx, player);
    }
    if (choice === 'X') throw 'USER_EXIT';

    const { result, key } = protocol.getResult(parseInt(choice, 10));
    const rollResult = (result + parseInt(choice, 10)) % die.size;
    console.log(`My number is ${result} (KEY=${key}).`);
    console.log(`The fair number generation result is ${result} + ${choice} = ${rollResult} (mod ${die.size}).`);

    const faceValue = die.roll(rollResult);
    console.log(`${player === 'user' ? 'Your' : 'My'} roll result is ${faceValue}.`);
    return faceValue;
  }

  compareResults() {
    if (this.userRoll > this.computerRoll) {
      console.log(`You win (${this.userRoll} > ${this.computerRoll})!`);
    } else if (this.userRoll < this.computerRoll) {
      console.log(`You lose (${this.userRoll} < ${this.computerRoll})!`);
    } else {
      console.log(`It's a tie (${this.userRoll} = ${this.computerRoll})!`);
    }
  }

  async showHelp() {
    const tableData = [
      ['Dice'].concat(this.dice.map((_, i) => `Die ${i + 1}`)),
      ...this.dice.map((_, i) => [
        `Die ${i + 1}`,
        ...this.dice.map((_, j) =>
          i === j ? '-' : this.probabilities[`${i},${j}`].toFixed(4)
        )
      ])
    ];

    console.log("\nProbability of the win for the user:");
    console.log(table(tableData));
    console.log("\nGame rules:\n- Each player picks one die.\n- Both roll their dice.\n- Higher roll wins the round.");
  }

  getInput(prompt) {
    return new Promise(resolve => {
      this.rl.question(prompt, answer => resolve(answer));
    });
  }

  getAvailableDice() {
    const all = Array.from({ length: this.dice.length }, (_, i) => i);
    const used = Object.values(this.selectedDice);
    return all.filter(i => !used.includes(i));
  }
}

// ==================== Entry Point ====================
function parseDiceInput(input) {
  const parts = input.trim().split(/\s+/);
  if (parts.length < 3) throw ValidationError.NotEnoughDice;

  const diceConfigs = parts.map(part => {
    const faces = part.split(',').map(x => {
      if (!/^\d+$/.test(x)) throw ValidationError.NonIntegerFace;
      return parseInt(x, 10);
    });
    if (faces.length === 0) throw ValidationError.InvalidDieFormat;
    return faces;
  });

  return diceConfigs;
}

// Accept input from command line arguments
try {
  const args = process.argv.slice(2).join(' ');
  const diceConfigs = parseDiceInput(args);
  const game = new DiceGame(diceConfigs);
  game.start();
} catch (err) {
  console.error(err.toString?.() || err);
  process.exit(1);
}
