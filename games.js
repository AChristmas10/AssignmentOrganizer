// MINI GAMES SYSTEM FOR DO2DATE
// Add this to the end of script.js or include as separate file

let currentGame = null;
let gameScores = {}; // Store scores for each game

// Show games menu
function showGamesMenu() {
    const menuHTML = `
        <div id="gamesMenu" style="position:fixed; top:80px; right:20px; background:var(--bg-primary); padding:20px; border-radius:12px; box-shadow:var(--shadow-lg); z-index:1000; border:1px solid var(--border); min-width:350px; max-width:90vw;" onclick="event.stopPropagation()">
            <h3 style="margin:0 0 16px 0; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                🎮 <span>Mini Games</span>
            </h3>
            
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="game-option" onclick="startGame('oddEmoji')" style="padding:12px; background:var(--bg-secondary); border-radius:8px; cursor:pointer; transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='var(--bg-secondary)'">
                    <div>
                        <div style="font-weight:600; color:var(--text-primary);">👀 Spot the Odd One</div>
                        <div style="font-size:0.85em; color:var(--text-secondary); margin-top:2px;">Find the different emoji - 5 rounds</div>
                    </div>
                    <button onclick="event.stopPropagation(); showLeaderboard('oddEmoji')" style="padding:6px 12px; background:var(--primary); color:white; border:none; border-radius:6px; font-size:0.85em;">🏆</button>
                </div>
                
                <div class="game-option" onclick="startGame('reaction')" style="padding:12px; background:var(--bg-secondary); border-radius:8px; cursor:pointer; transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='var(--bg-secondary)'">
                    <div>
                        <div style="font-weight:600; color:var(--text-primary);">⚡ React!</div>
                        <div style="font-size:0.85em; color:var(--text-secondary); margin-top:2px;">Test your reaction speed - 5 rounds</div>
                    </div>
                    <button onclick="event.stopPropagation(); showLeaderboard('reaction')" style="padding:6px 12px; background:var(--primary); color:white; border:none; border-radius:6px; font-size:0.85em;">🏆</button>
                </div>
                
                <div class="game-option" onclick="startGame('cubeRunner')" style="padding:12px; background:var(--bg-secondary); border-radius:8px; cursor:pointer; transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='var(--bg-secondary)'">
                    <div>
                        <div style="font-weight:600; color:var(--text-primary);">🟦 Cube Runner</div>
                        <div style="font-size:0.85em; color:var(--text-secondary); margin-top:2px;">Jump over obstacles</div>
                    </div>
                    <button onclick="event.stopPropagation(); showLeaderboard('cubeRunner')" style="padding:6px 12px; background:var(--primary); color:white; border:none; border-radius:6px; font-size:0.85em;">🏆</button>
                </div>
                
                <div class="game-option" onclick="startGame('tower')" style="padding:12px; background:var(--bg-secondary); border-radius:8px; cursor:pointer; transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='var(--bg-secondary)'">
                    <div>
                        <div style="font-weight:600; color:var(--text-primary);">🏗️ Tower</div>
                        <div style="font-size:0.85em; color:var(--text-secondary); margin-top:2px;">Stack blocks as high as you can</div>
                    </div>
                    <button onclick="event.stopPropagation(); showLeaderboard('tower')" style="padding:6px 12px; background:var(--primary); color:white; border:none; border-radius:6px; font-size:0.85em;">🏆</button>
                </div>
                
                <div class="game-option" onclick="startGame('pattern')" style="padding:12px; background:var(--bg-secondary); border-radius:8px; cursor:pointer; transition:all 0.2s; display:flex; justify-content:space-between; align-items:center;" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='var(--bg-secondary)'">
                    <div>
                        <div style="font-weight:600; color:var(--text-primary);">🧠 Pattern Master</div>
                        <div style="font-size:0.85em; color:var(--text-secondary); margin-top:2px;">Remember the sequence</div>
                    </div>
                    <button onclick="event.stopPropagation(); showLeaderboard('pattern')" style="padding:6px 12px; background:var(--primary); color:white; border:none; border-radius:6px; font-size:0.85em;">🏆</button>
                </div>
            </div>
            
            ${!currentUser ? `
                <div style="margin-top:12px; padding:10px; background:rgba(99, 102, 241, 0.1); border-radius:6px; font-size:0.85em; color:var(--text-secondary); text-align:center;">
                    ⚠️ Sign in to save your scores to the leaderboard!
                </div>
            ` : ''}
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', menuHTML);

    setTimeout(() => {
        document.addEventListener('click', closeGamesMenu);
    }, 100);
}

function closeGamesMenu() {
    const menu = document.getElementById('gamesMenu');
    if (menu) {
        menu.remove();
        document.removeEventListener('click', closeGamesMenu);
    }
}

// Start a game
function startGame(gameType) {
    closeGamesMenu();
    currentGame = gameType;

    switch(gameType) {
        case 'oddEmoji':
            startOddEmojiGame();
            break;
        case 'reaction':
            startReactionGame();
            break;
        case 'cubeRunner':
            startCubeRunnerGame();
            break;
        case 'tower':
            startTowerGame();
            break;
        case 'pattern':
            startPatternGame();
            break;
    }
}

// Close any game
function closeGame() {
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.remove();
    }
    currentGame = null;
}

// GAME 1: SPOT THE ODD EMOJI
function startOddEmojiGame() {
    const emojiSets = [
        ['😊', '😀'], ['🥰', '😍'], ['🤔', '🤨'], ['😴', '😪'],
        ['🎉', '🎊'], ['❤️', '💛'], ['👍', '👎'], ['🔥', '💧']
    ];

    let round = 0;
    let times = [];
    let startTime;

    function nextRound() {
        round++;
        if (round > 5) {
            // Game over - calculate average
            const avgTime = (times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(2);
            showGameOver('oddEmoji', parseFloat(avgTime), `${avgTime}s avg`, 'Lower is better!');
            return;
        }

        const gridSize = 15 + (round * 5); // 20, 25, 30, 35, 40 emojis
        const set = emojiSets[Math.floor(Math.random() * emojiSets.length)];
        const normalEmoji = set[0];
        const oddEmoji = set[1];
        const oddIndex = Math.floor(Math.random() * gridSize);

        const gameHTML = `
            <div id="gameContainer" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:2000; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div style="background:var(--bg-primary); padding:32px; border-radius:16px; max-width:600px; width:100%; box-shadow:var(--shadow-lg);">
                    <div style="text-align:center; margin-bottom:20px;">
                        <h2 style="margin:0; color:var(--text-primary);">👀 Spot the Odd One</h2>
                        <p style="color:var(--text-secondary); margin:8px 0;">Round ${round}/5</p>
                        <div style="display:flex; gap:4px; justify-content:center; margin-top:12px;">
                            ${Array(5).fill(0).map((_, i) => `
                                <div style="width:40px; height:6px; background:${i < round ? 'var(--primary)' : 'var(--bg-tertiary)'}; border-radius:3px;"></div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div id="emojiGrid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(50px, 1fr)); gap:8px; margin:20px 0;">
                        ${Array(gridSize).fill(0).map((_, i) => `
                            <div onclick="checkEmoji(${i === oddIndex})" style="font-size:2.5rem; padding:8px; background:var(--bg-secondary); border-radius:8px; cursor:pointer; text-align:center; transition:transform 0.1s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                                ${i === oddIndex ? oddEmoji : normalEmoji}
                            </div>
                        `).join('')}
                    </div>
                    
                    <button onclick="closeGame()" style="width:100%; padding:12px; background:var(--bg-tertiary); color:var(--text-primary); border:none; border-radius:8px; cursor:pointer;">
                        Quit Game
                    </button>
                </div>
            </div>
        `;

        const existing = document.getElementById('gameContainer');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', gameHTML);
        startTime = Date.now();
    }

    window.checkEmoji = function(isCorrect) {
        if (isCorrect) {
            const time = Date.now() - startTime;
            times.push(time);
            nextRound();
        }
    };

    nextRound();
}

// GAME 2: REACTION TIME
function startReactionGame() {
    const colors = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE'];
    const colorHex = {
        'RED': '#ef4444',
        'BLUE': '#3b82f6',
        'GREEN': '#10b981',
        'YELLOW': '#f59e0b',
        'PURPLE': '#8b5cf6'
    };

    let round = 0;
    let times = [];
    let startTime;
    let targetColor;
    let isWaiting = false;

    function nextRound() {
        round++;
        if (round > 5) {
            // Calculate average excluding penalties
            const validTimes = times.filter(t => t < 2000);
            const avgTime = validTimes.length > 0 ?
                Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 999;
            showGameOver('reaction', avgTime, `${avgTime}ms avg`, 'Lower is better!');
            return;
        }

        targetColor = colors[Math.floor(Math.random() * colors.length)];
        const wrongColors = colors.filter(c => c !== targetColor);

        const gameHTML = `
            <div id="gameContainer" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:2000; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div style="background:var(--bg-primary); padding:32px; border-radius:16px; max-width:500px; width:100%; box-shadow:var(--shadow-lg);">
                    <div style="text-align:center; margin-bottom:20px;">
                        <h2 style="margin:0; color:var(--text-primary);">⚡ React!</h2>
                        <p style="color:var(--text-secondary); margin:8px 0;">Round ${round}/5</p>
                        <div style="font-size:1.2em; font-weight:600; color:var(--text-primary); margin-top:16px;">
                            Click when <span style="color:${colorHex[targetColor]}">${targetColor}</span>
                        </div>
                    </div>
                    
                    <div id="reactionBox" onclick="handleReactionClick()" style="height:300px; background:var(--bg-secondary); border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:3rem; font-weight:700; transition:background 0.3s;">
                        GET READY
                    </div>
                    
                    <div style="text-align:center; margin-top:12px; font-size:0.85em; color:var(--text-secondary);">
                        ${times.length > 0 ? `Previous: ${times[times.length - 1]}ms` : 'Click when you see the target color!'}
                    </div>
                    
                    <button onclick="closeGame()" style="width:100%; margin-top:16px; padding:12px; background:var(--bg-tertiary); color:var(--text-primary); border:none; border-radius:8px; cursor:pointer;">
                        Quit Game
                    </button>
                </div>
            </div>
        `;

        const existing = document.getElementById('gameContainer');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', gameHTML);

        startColorSequence();
    }

    function startColorSequence() {
        const box = document.getElementById('reactionBox');
        isWaiting = true;
        startTime = null;

        // Show 3-5 wrong colors first
        const wrongColors = colors.filter(c => c !== targetColor);
        const numWrong = 3 + Math.floor(Math.random() * 3);
        let colorIndex = 0;

        function showNextColor() {
            if (colorIndex < numWrong) {
                const wrongColor = wrongColors[Math.floor(Math.random() * wrongColors.length)];
                box.style.background = colorHex[wrongColor];
                box.textContent = wrongColor;
                colorIndex++;
                setTimeout(showNextColor, 400 + Math.random() * 400);
            } else {
                // Show target color!
                box.style.background = colorHex[targetColor];
                box.textContent = targetColor;
                startTime = Date.now();
                isWaiting = false;
            }
        }

        setTimeout(showNextColor, 500);
    }

    window.handleReactionClick = function() {
        if (startTime) {
            const time = Date.now() - startTime;
            times.push(time);
            nextRound();
        } else if (isWaiting) {
            // Clicked too early - penalty
            times.push(2000); // 2 second penalty
            const box = document.getElementById('reactionBox');
            box.style.background = '#ef4444';
            box.textContent = 'TOO EARLY!';
            setTimeout(nextRound, 1000);
        }
    };

    nextRound();
}

// Game over screen
function showGameOver(gameType, score, scoreText, subtitle) {
    const gameTitles = {
        'oddEmoji': '👀 Spot the Odd One',
        'reaction': '⚡ React!',
        'cubeRunner': '🟦 Cube Runner',
        'tower': '🏗️ Tower',
        'pattern': '🧠 Pattern Master'
    };

    const gameHTML = `
        <div id="gameContainer" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:2000; display:flex; align-items:center; justify-content:center; padding:20px;">
            <div style="background:var(--bg-primary); padding:32px; border-radius:16px; max-width:500px; width:100%; box-shadow:var(--shadow-lg); text-align:center;">
                <h2 style="margin:0 0 8px 0; color:var(--text-primary);">Game Over!</h2>
                <p style="color:var(--text-secondary); margin:0 0 24px 0;">${gameTitles[gameType]}</p>
                
                <div style="background:linear-gradient(135deg, var(--primary), var(--secondary)); padding:24px; border-radius:12px; margin-bottom:24px;">
                    <div style="font-size:3rem; font-weight:700; color:white; margin-bottom:4px;">
                        ${scoreText}
                    </div>
                    <div style="font-size:0.9em; color:rgba(255,255,255,0.9);">${subtitle}</div>
                </div>
                
                ${currentUser ? `
                    <button onclick="submitScore('${gameType}', ${score})" style="width:100%; padding:14px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size:1em; margin-bottom:12px;">
                        🏆 Submit to Leaderboard
                    </button>
                ` : `
                    <div style="padding:14px; background:rgba(239, 68, 68, 0.1); border:2px dashed #ef4444; border-radius:8px; margin-bottom:12px; color:var(--text-primary);">
                        <strong>⚠️ Not signed in</strong><br>
                        <span style="font-size:0.9em; color:var(--text-secondary);">Sign in to save your score!</span>
                    </div>
                `}
                
                <div style="display:flex; gap:8px;">
                    <button onclick="startGame('${gameType}')" style="flex:1; padding:12px; background:var(--bg-tertiary); color:var(--text-primary); border:none; border-radius:8px; cursor:pointer;">
                        Play Again
                    </button>
                    <button onclick="closeGame(); showGamesMenu();" style="flex:1; padding:12px; background:var(--bg-tertiary); color:var(--text-primary); border:none; border-radius:8px; cursor:pointer;">
                        Menu
                    </button>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById('gameContainer');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', gameHTML);
}

// Submit score to leaderboard
async function submitScore(gameType, score) {
    if (!currentUser) {
        alert('You must be signed in to submit scores!');
        return;
    }

    const username = currentUser.email.split('@')[0]; // Email before @
    const timestamp = Date.now();

    try {
        const leaderboardRef = window.firebaseRef(window.firebaseDatabase, `leaderboards/${gameType}/${currentUser.uid}`);
        await window.firebaseSet(leaderboardRef, {
            username: username,
            score: score,
            timestamp: timestamp
        });

        console.log('✅ Score submitted to leaderboard');
        closeGame();
        showLeaderboard(gameType);
    } catch (error) {
        console.error('❌ Error submitting score:', error);
        alert('Failed to submit score. Please try again.');
    }
}

// Show leaderboard
async function showLeaderboard(gameType) {
    closeGamesMenu();

    const gameTitles = {
        'oddEmoji': '👀 Spot the Odd One',
        'reaction': '⚡ React!',
        'cubeRunner': '🟦 Cube Runner',
        'tower': '🏗️ Tower',
        'pattern': '🧠 Pattern Master'
    };

    const loadingHTML = `
        <div id="leaderboardModal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:2000; display:flex; align-items:center; justify-content:center; padding:20px;">
            <div style="background:var(--bg-primary); padding:32px; border-radius:16px; max-width:500px; width:100%; box-shadow:var(--shadow-lg);">
                <h2 style="margin:0 0 16px 0; color:var(--text-primary);">🏆 Leaderboard</h2>
                <p style="color:var(--text-secondary);">${gameTitles[gameType]}</p>
                <div style="text-align:center; padding:40px; color:var(--text-secondary);">Loading...</div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', loadingHTML);

    try {
        const leaderboardRef = window.firebaseRef(window.firebaseDatabase, `leaderboards/${gameType}`);
        const snapshot = await window.firebaseGet(leaderboardRef);

        let scores = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            scores = Object.entries(data).map(([uid, scoreData]) => ({
                uid,
                ...scoreData
            }));
        }

        // Sort by score (lower is better for time-based games)
        const timeBased = ['oddEmoji', 'reaction'].includes(gameType);
        scores.sort((a, b) => timeBased ? a.score - b.score : b.score - a.score);
        scores = scores.slice(0, 10); // Top 10

        // Find user's rank
        let userRank = null;
        if (currentUser) {
            userRank = scores.findIndex(s => s.uid === currentUser.uid) + 1;
        }

        const leaderboardHTML = `
            <div id="leaderboardModal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:2000; display:flex; align-items:center; justify-content:center; padding:20px;" onclick="event.target.id === 'leaderboardModal' && closeLeaderboard()">
                <div style="background:var(--bg-primary); padding:32px; border-radius:16px; max-width:500px; width:100%; box-shadow:var(--shadow-lg); max-height:80vh; overflow-y:auto;">
                    <h2 style="margin:0 0 8px 0; color:var(--text-primary);">🏆 Leaderboard</h2>
                    <p style="color:var(--text-secondary); margin:0 0 20px 0;">${gameTitles[gameType]}</p>
                    
                    ${userRank ? `
                        <div style="background:linear-gradient(135deg, var(--primary), var(--secondary)); padding:12px; border-radius:8px; margin-bottom:16px; color:white; text-align:center; font-weight:600;">
                            Your Rank: #${userRank} out of ${scores.length} players
                        </div>
                    ` : ''}
                    
                    ${scores.length === 0 ? `
                        <div style="text-align:center; padding:40px; color:var(--text-secondary);">
                            No scores yet. Be the first!
                        </div>
                    ` : `
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${scores.map((s, i) => `
                                <div style="display:flex; align-items:center; gap:12px; padding:12px; background:${s.uid === currentUser?.uid ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-secondary)'}; border-radius:8px; border:${s.uid === currentUser?.uid ? '2px solid var(--primary)' : '2px solid transparent'};">
                                    <div style="font-size:1.2em; font-weight:700; color:${i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#f97316' : 'var(--text-secondary)'}; min-width:30px;">
                                        ${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                                    </div>
                                    <div style="flex:1;">
                                        <div style="font-weight:600; color:var(--text-primary);">${s.username}</div>
                                        <div style="font-size:0.85em; color:var(--text-secondary);">
                                            ${new Date(s.timestamp).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div style="font-size:1.1em; font-weight:700; color:var(--primary);">
                                        ${timeBased ? `${s.score}ms` : s.score}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                    
                    <button onclick="closeLeaderboard()" style="width:100%; margin-top:20px; padding:12px; background:var(--bg-tertiary); color:var(--text-primary); border:none; border-radius:8px; cursor:pointer;">
                        Close
                    </button>
                </div>
            </div>
        `;

        document.getElementById('leaderboardModal').remove();
        document.body.insertAdjacentHTML('beforeend', leaderboardHTML);

    } catch (error) {
        console.error('Error loading leaderboard:', error);
        document.getElementById('leaderboardModal').remove();
        alert('Failed to load leaderboard');
    }
}

function closeLeaderboard() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) modal.remove();
}

console.log('🎮 Games system loaded!');

// GAME 3: CUBE RUNNER
function startCubeRunnerGame() {
    let score = 0;
    let isJumping = false;
    let isDucking = false;
    let gameSpeed = 5;
    let gameLoop;
    let obstacleInterval;
    let obstacles = [];
    let gameRunning = true;

    const gameHTML = `
        <div id="gameContainer" style="position:fixed; top:0; left:0; right:0; bottom:0; background:linear-gradient(180deg, #1a1a2e 0%, #0f0f1e 100%); z-index:2000; overflow:hidden;">
            <div style="position:absolute; top:20px; left:50%; transform:translateX(-50%); text-align:center;">
                <h2 style="margin:0; color:white; text-shadow:0 0 10px rgba(99, 102, 241, 0.5);">🟦 Cube Runner</h2>
                <div id="cubeScore" style="font-size:2rem; font-weight:700; color:#6366f1; margin-top:8px;">0</div>
            </div>
            
            <button onclick="closeGame(); gameRunning = false;" style="position:absolute; top:20px; right:20px; padding:8px 16px; background:rgba(255,255,255,0.1); color:white; border:2px solid rgba(255,255,255,0.3); border-radius:8px; cursor:pointer;">
                Quit
            </button>
            
            <canvas id="gameCanvas" width="800" height="400" style="position:absolute; bottom:100px; left:50%; transform:translateX(-50%); border:2px solid #6366f1; border-radius:12px; box-shadow:0 0 30px rgba(99, 102, 241, 0.3);"></canvas>
            
            <div style="position:absolute; bottom:30px; left:50%; transform:translateX(-50%); color:rgba(255,255,255,0.7); font-size:0.9em;">
                SPACE or CLICK to Jump • ↓ to Duck
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', gameHTML);

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const player = {
        x: 100,
        y: 300,
        width: 40,
        height: 40,
        velocityY: 0,
        gravity: 0.8
    };

    function createObstacle() {
        const types = ['barrier', 'orb'];
        const type = types[Math.floor(Math.random() * types.length)];

        if (type === 'barrier') {
            obstacles.push({
                type: 'barrier',
                x: canvas.width,
                y: 300,
                width: 30,
                height: 60
            });
        } else {
            obstacles.push({
                type: 'orb',
                x: canvas.width,
                y: 200,
                width: 40,
                height: 40
            });
        }
    }

    function jump() {
        if (!isJumping && player.y >= 300) {
            player.velocityY = -15;
            isJumping = true;
        }
    }

    function duck() {
        if (!isJumping) {
            isDucking = true;
        }
    }

    function update() {
        if (!gameRunning) return;

        // Clear canvas
        ctx.fillStyle = '#0f0f1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw track
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 340);
        ctx.lineTo(canvas.width, 340);
        ctx.stroke();

        // Update player
        player.velocityY += player.gravity;
        player.y += player.velocityY;

        if (player.y >= 300) {
            player.y = 300;
            player.velocityY = 0;
            isJumping = false;
        }

        // Draw player (cube)
        const playerHeight = isDucking ? 20 : 40;
        const playerY = isDucking ? player.y + 20 : player.y;

        ctx.fillStyle = '#6366f1';
        ctx.shadowColor = '#6366f1';
        ctx.shadowBlur = 20;
        ctx.fillRect(player.x, playerY, player.width, playerHeight);
        ctx.shadowBlur = 0;

        isDucking = false;

        // Update and draw obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            obs.x -= gameSpeed;

            // Draw obstacle
            if (obs.type === 'barrier') {
                ctx.fillStyle = '#ef4444';
                ctx.shadowColor = '#ef4444';
                ctx.shadowBlur = 15;
                ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            } else {
                ctx.fillStyle = '#f59e0b';
                ctx.shadowColor = '#f59e0b';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(obs.x + obs.width/2, obs.y + obs.height/2, obs.width/2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;

            // Check collision
            if (obs.x < player.x + player.width &&
                obs.x + obs.width > player.x &&
                obs.y < playerY + playerHeight &&
                obs.y + obs.height > playerY) {
                gameOver();
                return;
            }

            // Remove off-screen obstacles
            if (obs.x + obs.width < 0) {
                obstacles.splice(i, 1);
                score++;
                document.getElementById('cubeScore').textContent = score;

                // Increase speed every 10 points
                if (score % 10 === 0) {
                    gameSpeed += 0.5;
                }
            }
        }

        gameLoop = requestAnimationFrame(update);
    }

    function gameOver() {
        gameRunning = false;
        cancelAnimationFrame(gameLoop);
        clearInterval(obstacleInterval);
        showGameOver('cubeRunner', score, score, 'Distance traveled');
    }

    // Controls
    document.addEventListener('keydown', (e) => {
        if (!gameRunning) return;
        if (e.code === 'Space') {
            e.preventDefault();
            jump();
        } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            duck();
        }
    });

    canvas.addEventListener('click', () => {
        if (gameRunning) jump();
    });

    // Start game
    obstacleInterval = setInterval(createObstacle, 2000);
    update();
}

// GAME 4: TOWER (STACK BLOCKS)
function startTowerGame() {
    let blocks = [];
    let currentBlock = null;
    let score = 0;
    let direction = 1;
    let speed = 3;
    let misses = 0;
    let gameRunning = true;
    let gameLoop;

    const gameHTML = `
        <div id="gameContainer" style="position:fixed; top:0; left:0; right:0; bottom:0; background:linear-gradient(180deg, #0f172a 0%, #1e293b 100%); z-index:2000; overflow:hidden;">
            <div style="position:absolute; top:20px; left:50%; transform:translateX(-50%); text-align:center;">
                <h2 style="margin:0; color:white;">🏗️ Tower</h2>
                <div id="towerScore" style="font-size:2rem; font-weight:700; color:#8b5cf6; margin-top:8px;">0</div>
                <div id="towerLives" style="font-size:1.2rem; color:#ef4444; margin-top:4px;">❤️ ❤️ ❤️</div>
            </div>
            
            <button onclick="closeGame(); gameRunning = false;" style="position:absolute; top:20px; right:20px; padding:8px 16px; background:rgba(255,255,255,0.1); color:white; border:2px solid rgba(255,255,255,0.3); border-radius:8px; cursor:pointer;">
                Quit
            </button>
            
            <canvas id="gameCanvas" width="400" height="600" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); border:2px solid #8b5cf6; border-radius:12px; box-shadow:0 0 30px rgba(139, 92, 246, 0.3);"></canvas>
            
            <div style="position:absolute; bottom:30px; left:50%; transform:translateX(-50%); color:rgba(255,255,255,0.7); font-size:0.9em;">
                CLICK or SPACE to Drop Block
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', gameHTML);

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // First block (stationary)
    blocks.push({
        x: canvas.width / 2 - 75,
        y: canvas.height - 30,
        width: 150,
        height: 30
    });

    function createNewBlock() {
        if (!gameRunning) return;

        const lastBlock = blocks[blocks.length - 1];
        const newWidth = Math.max(30, lastBlock.width - 5); // Get narrower

        currentBlock = {
            x: 0,
            y: lastBlock.y - 35,
            width: newWidth,
            height: 30,
            moving: true
        };
    }

    function dropBlock() {
        if (!currentBlock || !currentBlock.moving) return;

        currentBlock.moving = false;
        const lastBlock = blocks[blocks.length - 1];

        // Check overlap
        const overlapLeft = Math.max(currentBlock.x, lastBlock.x);
        const overlapRight = Math.min(currentBlock.x + currentBlock.width, lastBlock.x + lastBlock.width);
        const overlap = overlapRight - overlapLeft;

        if (overlap > 0) {
            // Successful stack!
            currentBlock.width = overlap;
            currentBlock.x = overlapLeft;
            blocks.push(currentBlock);
            score++;
            speed += 0.1; // Increase difficulty

            document.getElementById('towerScore').textContent = score;

            // Scroll canvas down if tower gets too high
            if (currentBlock.y < 100) {
                for (let block of blocks) {
                    block.y += 35;
                }
            }

            currentBlock = null;
            setTimeout(createNewBlock, 300);
        } else {
            // Miss!
            misses++;
            const hearts = ['❤️ ❤️ ❤️', '❤️ ❤️', '❤️', ''][misses];
            document.getElementById('towerLives').textContent = hearts || 'Game Over';

            if (misses >= 3) {
                gameOver();
                return;
            }

            currentBlock = null;
            setTimeout(createNewBlock, 500);
        }
    }

    function update() {
        if (!gameRunning) return;

        // Clear canvas
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw blocks
        blocks.forEach((block, i) => {
            const hue = (i * 20) % 360;
            ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
            ctx.shadowColor = `hsl(${hue}, 70%, 60%)`;
            ctx.shadowBlur = 10;
            ctx.fillRect(block.x, block.y, block.width, block.height);
            ctx.shadowBlur = 0;
        });

        // Update and draw current block
        if (currentBlock && currentBlock.moving) {
            currentBlock.x += direction * speed;

            // Bounce off edges
            if (currentBlock.x <= 0 || currentBlock.x + currentBlock.width >= canvas.width) {
                direction *= -1;
            }

            ctx.fillStyle = '#8b5cf6';
            ctx.shadowColor = '#8b5cf6';
            ctx.shadowBlur = 15;
            ctx.fillRect(currentBlock.x, currentBlock.y, currentBlock.width, currentBlock.height);
            ctx.shadowBlur = 0;
        }

        gameLoop = requestAnimationFrame(update);
    }

    function gameOver() {
        gameRunning = false;
        cancelAnimationFrame(gameLoop);
        showGameOver('tower', score, score, 'Blocks stacked');
    }

    // Controls
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && gameRunning) {
            e.preventDefault();
            dropBlock();
        }
    });

    canvas.addEventListener('click', () => {
        if (gameRunning) dropBlock();
    });

    // Start game
    createNewBlock();
    update();
}

// GAME 5: PATTERN MASTER (MEMORY GAME)
function startPatternGame() {
    let sequence = [];
    let playerSequence = [];
    let round = 0;
    let lives = 3;
    let isPlaying = false;
    let canClick = false;

    const gameHTML = `
        <div id="gameContainer" style="position:fixed; top:0; left:0; right:0; bottom:0; background:linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); z-index:2000; display:flex; align-items:center; justify-content:center; padding:20px;">
            <div style="background:rgba(255,255,255,0.05); padding:32px; border-radius:16px; max-width:500px; width:100%; backdrop-filter:blur(10px); border:2px solid rgba(255,255,255,0.1);">
                <div style="text-align:center; margin-bottom:20px;">
                    <h2 style="margin:0; color:white;">🧠 Pattern Master</h2>
                    <div style="display:flex; justify-content:center; gap:20px; margin-top:12px;">
                        <div>
                            <div style="font-size:0.85em; color:rgba(255,255,255,0.7);">Round</div>
                            <div id="patternRound" style="font-size:1.5rem; font-weight:700; color:#8b5cf6;">0</div>
                        </div>
                        <div>
                            <div style="font-size:0.85em; color:rgba(255,255,255,0.7);">Lives</div>
                            <div id="patternLives" style="font-size:1.5rem; font-weight:700; color:#ef4444;">❤️❤️❤️</div>
                        </div>
                    </div>
                </div>
                
                <div id="patternGrid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin:24px 0;">
                    ${Array(9).fill(0).map((_, i) => `
                        <div id="cell${i}" onclick="handleCellClick(${i})" style="aspect-ratio:1; background:rgba(255,255,255,0.1); border-radius:12px; cursor:pointer; transition:all 0.2s; border:2px solid transparent;">
                        </div>
                    `).join('')}
                </div>
                
                <div id="patternMessage" style="text-align:center; color:white; font-size:1.1em; font-weight:600; min-height:30px; margin-bottom:12px;">
                    Watch the pattern...
                </div>
                
                <button onclick="closeGame()" style="width:100%; padding:12px; background:rgba(255,255,255,0.1); color:white; border:2px solid rgba(255,255,255,0.3); border-radius:8px; cursor:pointer;">
                    Quit Game
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', gameHTML);

    function nextRound() {
        round++;
        playerSequence = [];
        sequence.push(Math.floor(Math.random() * 9));

        document.getElementById('patternRound').textContent = round;
        document.getElementById('patternMessage').textContent = 'Watch the pattern...';

        isPlaying = true;
        canClick = false;

        playSequence();
    }

    function playSequence() {
        let i = 0;
        const interval = setInterval(() => {
            if (i >= sequence.length) {
                clearInterval(interval);
                isPlaying = false;
                canClick = true;
                document.getElementById('patternMessage').textContent = 'Your turn!';
                return;
            }

            lightUpCell(sequence[i]);
            i++;
        }, 600);
    }

    function lightUpCell(index) {
        const cell = document.getElementById(`cell${index}`);
        cell.style.background = '#8b5cf6';
        cell.style.borderColor = '#8b5cf6';
        cell.style.boxShadow = '0 0 30px #8b5cf6';

        setTimeout(() => {
            cell.style.background = 'rgba(255,255,255,0.1)';
            cell.style.borderColor = 'transparent';
            cell.style.boxShadow = 'none';
        }, 400);
    }

    window.handleCellClick = function(index) {
        if (!canClick || isPlaying) return;

        lightUpCell(index);
        playerSequence.push(index);

        // Check if correct
        const currentIndex = playerSequence.length - 1;
        if (playerSequence[currentIndex] !== sequence[currentIndex]) {
            // Wrong!
            lives--;
            const hearts = ['❤️❤️❤️', '❤️❤️', '❤️', ''][3 - lives];
            document.getElementById('patternLives').textContent = hearts;
            document.getElementById('patternMessage').textContent = '❌ Wrong!';

            if (lives <= 0) {
                setTimeout(() => {
                    showGameOver('pattern', round - 1, round - 1, 'Longest sequence');
                }, 1000);
                return;
            }

            setTimeout(nextRound, 1500);
            return;
        }

        // Check if sequence complete
        if (playerSequence.length === sequence.length) {
            document.getElementById('patternMessage').textContent = '✅ Correct!';
            canClick = false;
            setTimeout(nextRound, 1000);
        }
    };

    // Start first round
    setTimeout(nextRound, 1000);
}

console.log('✅ All 5 games loaded and ready!');