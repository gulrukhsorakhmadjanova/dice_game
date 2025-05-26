# Non-Transitive Dice Game

## 📜 Description
A JavaScript implementation of a non-transitive dice game where dice relationships break normal transitivity rules (A > B > C > A). Features cryptographically secure random rolls with verifiable fairness proofs.

## 🛠 Requirements
- Node.js v16+
- npm/yarn

## 🚀 Installation
```bash
git clone https://github.com/yourusername/non-transitive-dice-game.git
cd non-transitive-dice-game
npm install
npm install table

🎮 How to Play
Run with 3+ dice configurations (comma-separated integers):

bash
node game.js 2,2,4,4,9,9 1,1,6,6,8,8 3,3,5,5,7,7
🖥 Game Flow
Guess 0/1 to determine first player

Alternate selecting dice

Make verifiable fair rolls

Compare results

⚠ Input Rules
Minimum 3 dice required

Each die: comma-separated integers

Example valid input: 1,2,3 4,5,6 7,8,9,2,1,2 1,2,3,4,5,6
