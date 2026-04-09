// ─── Translations: English & Cantonese (粵語) ────────────────────────────────
export const translations = {
  en: {
    // App title & header
    appTitle: '🀄 麻雀 Mahjong',
    setup: '⚙ Setup',
    newGame: 'New Game',

    // Setup screen
    setupTitle: '🀄 麻雀',
    setupSubtitle: 'Cantonese Mahjong · 4 Players · Play vs AI',
    aiOpponents: 'AI Opponents',
    seatEast: 'East 東',
    seatSouth: 'South 南',
    seatWest: 'West 西',
    strategyGuide: 'AI Strategy Guide',
    startGame: '🀄 Start Game',

    // AI strategies
    strategies: {
      aggressive: { name: 'Aggressive Dragon', description: 'Speed runs for fast wins, discards isolated tiles quickly' },
      defensive:  { name: 'Defensive Turtle',  description: 'Plays safe, avoids risky discards, prefers pairs and honors' },
      random:     { name: 'Chaotic Monkey',    description: 'Completely random — utterly unpredictable chaos' },
      greedy:     { name: 'Greedy Panda',      description: 'Evaluates every discard option, maximises hand potential' },
    },

    // Player names
    playerNames: ['You', 'AI East', 'AI South', 'AI West'],

    // Game table
    wall: 'Wall',
    tiles: 'tiles',
    yourTurn: '⭐ Your turn',
    turnOf: (name) => `${name}'s turn`,
    yourDiscards: 'Your discards',
    southDiscards: 'South discards',
    eastDiscards: 'East discards',
    westDiscards: 'West discards',

    // Player hand
    yourHand: (n) => `Your Hand (${n} tiles)`,
    tenpai: (n) => `✨ Tenpai! Waiting for ${n} tile types`,
    clickHint: '— Click a tile to select, click again to discard',

    // Buttons
    discardSelected: 'Discard Selected',
    claimDiscard: '🀄 Claim Discard (Ron!)',

    // Win overlay
    drawGame: 'Draw Game!',
    youWon: 'You Won!',
    wins: (name) => `${name} Wins!`,
    drawDesc: 'The wall was exhausted — no winner this round.',
    youWonDesc: 'Excellent play! Your tiles aligned perfectly.',
    aiWonDesc: (name, strat) => `${name} (${strat}) claims victory.`,
    nobody: 'Nobody',

    // Log messages
    logStart: 'Game started! Drawing your tile…',
    logYouDrew: 'You drew a tile.',
    logAiDrew: (name) => `${name} drew.`,
    logYouDiscarded: 'You discarded.',
    logAiDiscarded: (name) => `${name} discarded.`,
    logYouWonTsumo: '🏆 You win by self-draw (自摸)!',
    logAiWonTsumo: (name) => `🏆 ${name} wins by self-draw (自摸)!`,
    logYouClaimed: 'You claimed the discard.',
    logYouWonRon: '🏆 You claimed & won! (炮)',
    logAiWonRon: (name) => `${name} claims discard & wins! (炮)`,
    logWallDead: '🎴 Wall exhausted — draw!',
    logAiClaimedDiscard: (name) => `${name} claimed the discard.`,

    // Tooltips
    claimTooltip: 'Click to claim!',
  },

  yue: {
    // App title & header
    appTitle: '🀄 麻雀',
    setup: '⚙ 設定',
    newGame: '新局',

    // Setup screen
    setupTitle: '🀄 麻雀',
    setupSubtitle: '廣東麻雀 · 四人局 · 挑戰電腦',
    aiOpponents: '電腦對手',
    seatEast: '東家',
    seatSouth: '南家',
    seatWest: '西家',
    strategyGuide: '電腦策略介紹',
    startGame: '🀄 開局',

    // AI strategies
    strategies: {
      aggressive: { name: '進攻龍', description: '急攻快胡，即刻打散張，唔怕輸' },
      defensive:  { name: '防守龜', description: '打安全牌，留對將，唔出危險牌' },
      random:     { name: '亂咁嚟猴', description: '完全隨機，毫無章法，乜都估唔到' },
      greedy:     { name: '計數熊貓', description: '每張牌都計清楚，揀最高分嘅打法' },
    },

    // Player names
    playerNames: ['你', '電腦東', '電腦南', '電腦西'],

    // Game table
    wall: '牌墻',
    tiles: '張',
    yourTurn: '⭐ 輪到你',
    turnOf: (name) => `${name} 行牌`,
    yourDiscards: '你嘅棄牌',
    southDiscards: '南家棄牌',
    eastDiscards: '東家棄牌',
    westDiscards: '西家棄牌',

    // Player hand
    yourHand: (n) => `你嘅手牌（${n}張）`,
    tenpai: (n) => `✨ 聽牌！等緊 ${n} 種牌`,
    clickHint: '— 撳牌選擇，再撳一次打出',

    // Buttons
    discardSelected: '打出所選',
    claimDiscard: '🀄 食炮！',

    // Win overlay
    drawGame: '流局！',
    youWon: '你贏啦！',
    wins: (name) => `${name} 贏！`,
    drawDesc: '牌墻打完，今局流局。',
    youWonDesc: '打得好！你嘅手牌完美！',
    aiWonDesc: (name, strat) => `${name}（${strat}）勝出。`,
    nobody: '無人',

    // Log messages
    logStart: '開局！幫你摸牌…',
    logYouDrew: '你摸咗一張牌。',
    logAiDrew: (name) => `${name} 摸牌。`,
    logYouDiscarded: '你打出一張牌。',
    logAiDiscarded: (name) => `${name} 打牌。`,
    logYouWonTsumo: '🏆 你自摸贏！',
    logAiWonTsumo: (name) => `🏆 ${name} 自摸贏！`,
    logYouClaimed: '你食咗隻炮牌。',
    logYouWonRon: '🏆 你食炮贏！',
    logAiWonRon: (name) => `${name} 食炮贏！`,
    logWallDead: '🎴 牌墻摸完，流局！',
    logAiClaimedDiscard: (name) => `${name} 食咗炮牌。`,

    // Tooltips
    claimTooltip: '撳呢度食炮！',
  },
}

export function t(lang, key, ...args) {
  const dict = translations[lang] || translations.en
  const val = dict[key]
  if (typeof val === 'function') return val(...args)
  return val ?? key
}
