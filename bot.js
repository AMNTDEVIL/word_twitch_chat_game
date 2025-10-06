require('dotenv').config();
const tmi = require('tmi.js');
const fs = require('fs');

// Load word list
const words = JSON.parse(fs.readFileSync('wordlist.json', 'utf8'));

const client = new tmi.Client({
    options: { debug: true },
    identity: {
        username: process.env.TWITCH_BOT_USERNAME,
        password: process.env.TWITCH_OAUTH_TOKEN
    },
    channels: [process.env.TWITCH_CHANNEL]
});

// Game state
let currentWord = null;
let currentAnswer = null;
let currentHints = [];
let hintIndex = 0;
let gameActive = false;
let duelMode = false;
let duelPlayers = []; // [username1, username2]
let duelScores = {}; // { username: score }

// Utility: pick a random word
let askedWords = []; // keep track of words already asked

function getRandomWord() {
    if (askedWords.length === words.length) {
        askedWords = []; // reset after all words used
    }

    let wordObj;
    do {
        wordObj = words[Math.floor(Math.random() * words.length)];
    } while (askedWords.includes(wordObj.question));

    currentWord = wordObj.question;
    currentAnswer = wordObj.question.toLowerCase();
    currentHints = [
        wordObj["hint-1"],
        wordObj["hint-2"],
        wordObj["hint-3"],
        wordObj["hint-4"],
        wordObj["hint-5"]
    ];
    hintIndex = 0;

    askedWords.push(wordObj.question);
}

// Ask new question
function askNewWord(channel) {
    getRandomWord();
    client.say(channel, `🧩 Word Guess: Try to guess the word! Type !word <your guess>`);
}

// Show hint
function showHint(channel) {
    if (!gameActive) {
        client.say(channel, "No active game! Type !play wordfinder to start.");
        return;
    }
    if (hintIndex >= currentHints.length) {
        client.say(channel, "No more hints available!");
    } else {
        client.say(channel, `💡 Hint ${hintIndex + 1}: ${currentHints[hintIndex]}`);
        hintIndex++;
    }
}

// Handle single-player game
function startSinglePlayer(channel, username) {
    gameActive = true;
    duelMode = false;
    client.say(channel, `$${username} started Word Finder! First correct answer moves to next word.`);
    askNewWord(channel);
}

// Handle duel mode
function startDuel(channel, player1, player2) {
    gameActive = true;
    duelMode = true;
    duelPlayers = [player1, player2];
    duelScores = {};
    duelScores[player1.toLowerCase()] = 0;
    duelScores[player2.toLowerCase()] = 0;

    client.say(channel, `⚔️ Duel started between $${player1} and $${player2}! First to 5 correct answers wins.`);
    askNewWord(channel);
}

// Connect bot
client.connect();

// Chat listener
client.on('message', (channel, userstate, message, self) => {
    if (self) return;
    const msg = message.trim();
    const username = userstate['display-name'];

    // Single player start
    if (msg.toLowerCase() === '!play wordfinder') {
        if (gameActive && !duelMode) {
            client.say(channel, `$${username}, a game is already running! Wait for the next round.`);
            return;
        }
        startSinglePlayer(channel, username);
        return;
    }

    // Duel start
    if (msg.toLowerCase().startsWith('!duelwordfinder')) {
        const parts = msg.split(' ');
        if (parts.length !== 2) {
            client.say(channel, "Usage: !duelwordfinder @opponent");
            return;
        }
        const opponent = parts[1].replace('@', '');
        if (username.toLowerCase() === opponent.toLowerCase()) {
            client.say(channel, "You cannot duel yourself!");
            return;
        }
        startDuel(channel, username, opponent);
        return;
    }

    // Hint
    if (msg.toLowerCase() === '!hint') {
        showHint(channel);
        return;
    }

    // Word guess
    if (msg.toLowerCase().startsWith('!word ')) {
        if (!gameActive) {
            client.say(channel, "No active game! Start one with !play wordfinder or !duelwordfinder");
            return;
        }
        const guess = msg.slice(6).trim().toLowerCase();
        if (guess === currentAnswer) {
            if (duelMode) {
                const userLower = username.toLowerCase();
                if (!duelScores.hasOwnProperty(userLower)) {
                    client.say(channel, `$${username}, you are not in this duel!`);
                    return;
                }
                duelScores[userLower]++;
                client.say(channel, `✅ Correct! $${username} scores! Current score: $${duelPlayers[0]} ${duelScores[duelPlayers[0].toLowerCase()]} - $${duelPlayers[1]} ${duelScores[duelPlayers[1].toLowerCase()]}`);

                // Check winner
                if (duelScores[userLower] >= 5) {
                    client.say(channel, `🏆 $${username} wins the duel!`);
                    gameActive = false;
                    duelMode = false;
                    duelPlayers = [];
                    duelScores = {};
                    return;
                }
            } else {
                client.say(channel, `✅ Correct, $${username}! The word was "${currentWord}".`);
            }
            // Next word
            askNewWord(channel);
        } else {
            client.say(channel, `❌ Sorry, $${username}, that's not correct.`);
        }
    }
});
