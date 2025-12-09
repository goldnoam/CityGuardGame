
import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameState, UpgradeStats, Difficulty } from './types';
import { Shield, Play, Zap, Crosshair, Circle, Coins, RefreshCw, Pause, Star, Anchor, Hexagon, Volume2, VolumeX, Mail } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [level, setLevel] = useState(1);
  const [credits, setCredits] = useState(0);
  const [buildingsRemaining, setBuildingsRemaining] = useState(6);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  // Difficulty State
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  
  // Upgrade State
  const [upgrades, setUpgrades] = useState<UpgradeStats>({
    speedLevel: 0,
    radiusLevel: 0,
    rateLevel: 0,
    turretLevel: 0,
    shieldLevel: 0
  });

  // Load High Score
  useEffect(() => {
    const saved = localStorage.getItem('shomrei_hair_highscore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const startGame = () => {
    setGameState(GameState.PLAYING);
    setLevel(1);
    setCredits(0);
    setBuildingsRemaining(6);
    // Reset upgrades but keep high score
    setUpgrades({ speedLevel: 0, radiusLevel: 0, rateLevel: 0, turretLevel: 0, shieldLevel: 0 }); 
  };

  const nextLevel = () => {
    setGameState(GameState.PLAYING);
    setLevel(l => l + 1);
  };

  const togglePause = () => {
    if (gameState === GameState.PLAYING) {
      setGameState(GameState.PAUSED);
    } else if (gameState === GameState.PAUSED) {
      setGameState(GameState.PLAYING);
    }
  };

  const quitToMenu = () => {
    setGameState(GameState.MENU);
  };

  const handleLevelComplete = (stats: { buildingsLost: number; enemiesDestroyed: number }) => {
    setGameState(GameState.LEVEL_COMPLETE);
    const currentRemaining = Math.max(0, buildingsRemaining - stats.buildingsLost);
    setBuildingsRemaining(currentRemaining);
    
    // Calculate Earned Credits based on difficulty
    let difficultyBonus = 1;
    if (difficulty === Difficulty.HARD) difficultyBonus = 1.5;
    if (difficulty === Difficulty.EASY) difficultyBonus = 0.8;

    const earned = Math.floor(((currentRemaining * 50) + (stats.enemiesDestroyed * 10) + 100) * difficultyBonus); 
    setCredits(c => c + earned);
  };

  const handleGameOver = (finalScore: number) => {
    setGameState(GameState.GAME_OVER);
    setBuildingsRemaining(0);
    
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('shomrei_hair_highscore', finalScore.toString());
    }
  };

  // Upgrade Logic
  const getUpgradeCost = (currentLevel: number) => 500 * (currentLevel + 1);

  const buyUpgrade = (type: keyof UpgradeStats) => {
    const cost = getUpgradeCost(upgrades[type]);
    if (credits >= cost) {
      setCredits(c => c - cost);
      setUpgrades(prev => ({
        ...prev,
        [type]: prev[type] + 1
      }));
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden select-none">
      
      {/* Game Layer */}
      <GameCanvas 
        gameState={gameState} 
        level={level}
        difficulty={difficulty}
        upgradeStats={upgrades}
        highScore={highScore}
        isMuted={isMuted}
        onGameOver={handleGameOver}
        onLevelComplete={handleLevelComplete}
      />

      {/* Mute Button (Bottom Right) */}
      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="absolute bottom-4 right-4 z-20 bg-slate-800/80 p-2 rounded-full border border-slate-600 hover:bg-slate-700 transition-colors shadow-lg active:scale-95 text-slate-300"
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </button>

      {/* Footer (Copyright & Feedback) */}
      <div className="absolute bottom-1 w-full text-center z-10 pointer-events-none">
          <div className="text-[10px] text-slate-600 font-mono pointer-events-auto inline-flex gap-4 items-center bg-slate-950/50 px-3 py-1 rounded-full backdrop-blur-sm">
              <span>(C) Noam Gold AI 2025</span>
              <a href="mailto:gold.noam@gmail.com" className="hover:text-blue-400 flex items-center gap-1 transition-colors">
                  Send Feedback <Mail className="w-3 h-3" />
              </a>
          </div>
      </div>

      {/* Pause Button */}
      {(gameState === GameState.PLAYING || gameState === GameState.PAUSED) && (
        <button 
          onClick={togglePause}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-800/80 p-2 rounded-full border border-slate-600 hover:bg-slate-700 transition-colors shadow-lg active:scale-95 animate-fade-in"
          aria-label={gameState === GameState.PAUSED ? "Resume" : "Pause"}
        >
          {gameState === GameState.PAUSED ? (
            <Play className="w-6 h-6 text-green-400" />
          ) : (
            <Pause className="w-6 h-6 text-yellow-400" />
          )}
        </button>
      )}

      {/* Main Menu Overlay */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full p-8 text-center space-y-8 animate-scale-in">
            <div className="flex justify-center">
              <Shield className="w-20 h-20 text-blue-500 drop-shadow-lg" />
            </div>
            <div>
              <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 mb-2">
                שומרי העיר
              </h1>
              <p className="text-slate-400 text-lg">מערכת הגנה אווירית מתקדמת</p>
            </div>

            {highScore > 0 && (
              <div className="bg-slate-900/80 border border-slate-700 p-3 rounded-lg flex items-center justify-center gap-2">
                 <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                 <span className="text-yellow-100 font-mono text-xl">שיא: {highScore}</span>
              </div>
            )}
            
            {/* Difficulty Selector */}
            <div className="flex justify-center gap-2 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
              <button
                onClick={() => setDifficulty(Difficulty.EASY)}
                className={`px-4 py-2 rounded-md font-bold transition-all ${difficulty === Difficulty.EASY ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-green-400'}`}
              >
                קל
              </button>
              <button
                onClick={() => setDifficulty(Difficulty.MEDIUM)}
                className={`px-4 py-2 rounded-md font-bold transition-all ${difficulty === Difficulty.MEDIUM ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-blue-400'}`}
              >
                רגיל
              </button>
              <button
                onClick={() => setDifficulty(Difficulty.HARD)}
                className={`px-4 py-2 rounded-md font-bold transition-all ${difficulty === Difficulty.HARD ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-red-400'}`}
              >
                קשה
              </button>
            </div>
            
            <button 
              onClick={startGame}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-3 group"
            >
              <Play className="fill-current group-hover:scale-110 transition-transform" />
              התחל משימה
            </button>
          </div>
        </div>
      )}

      {/* Pause Menu Overlay */}
      {gameState === GameState.PAUSED && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl text-center space-y-6 max-w-sm w-full animate-scale-in">
            <h2 className="text-3xl font-bold text-white">משחק מושהה</h2>
            
            <div className="space-y-3">
              <button 
                onClick={togglePause}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-colors hover:scale-105 transform"
              >
                <Play className="w-5 h-5" />
                המשך
              </button>
              
              <button 
                onClick={quitToMenu}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-colors hover:scale-105 transform"
              >
                <RefreshCw className="w-5 h-5" />
                חזור לתפריט
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level Complete / Upgrade Shop Overlay */}
      {gameState === GameState.LEVEL_COMPLETE && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md overflow-y-auto animate-fade-in">
          <div className="max-w-2xl w-full p-4 md:p-8 relative space-y-6">
            
            {/* Stats Summary */}
            <div className="grid grid-cols-2 gap-4 animate-slide-up">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col items-center">
                <div className="text-slate-500 text-sm mb-1">שלב הושלם</div>
                <div className="text-3xl font-mono text-green-400 font-bold">{level}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col items-center">
                <div className="text-slate-500 text-sm mb-1">בניינים שנותרו</div>
                <div className="text-3xl font-mono text-blue-400 font-bold">{buildingsRemaining}</div>
              </div>
            </div>

            {/* Armory / Upgrades */}
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 space-y-6 animate-slide-up delay-100">
              <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-6 h-6 text-blue-500" />
                  נשקייה
                </h3>
                <div className="flex items-center gap-2 text-yellow-400 font-mono text-xl">
                  <Coins className="w-5 h-5" />
                  {credits}
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[400px] pr-2">
                {/* Speed Upgrade */}
                <div className="bg-slate-800 p-3 rounded-lg flex items-center justify-between hover:bg-slate-750 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Zap className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">מהירות יירוט</div>
                      <div className="text-xs text-slate-400">רמה {upgrades.speedLevel + 1}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => buyUpgrade('speedLevel')}
                    disabled={credits < getUpgradeCost(upgrades.speedLevel)}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 rounded text-xs font-bold transition-colors"
                  >
                    שדרג ({getUpgradeCost(upgrades.speedLevel)})
                  </button>
                </div>

                {/* Radius Upgrade */}
                <div className="bg-slate-800 p-3 rounded-lg flex items-center justify-between hover:bg-slate-750 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/20 rounded-lg">
                      <Circle className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">ראש קרב</div>
                      <div className="text-xs text-slate-400">רמה {upgrades.radiusLevel + 1}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => buyUpgrade('radiusLevel')}
                    disabled={credits < getUpgradeCost(upgrades.radiusLevel)}
                    className="px-2 py-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:hover:bg-orange-600 rounded text-xs font-bold transition-colors"
                  >
                    שדרג ({getUpgradeCost(upgrades.radiusLevel)})
                  </button>
                </div>

                 {/* Fire Rate Upgrade */}
                 <div className="bg-slate-800 p-3 rounded-lg flex items-center justify-between hover:bg-slate-750 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/20 rounded-lg">
                      <Crosshair className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">קצב אש</div>
                      <div className="text-xs text-slate-400">רמה {upgrades.rateLevel + 1}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => buyUpgrade('rateLevel')}
                    disabled={credits < getUpgradeCost(upgrades.rateLevel)}
                    className="px-2 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:hover:bg-green-600 rounded text-xs font-bold transition-colors"
                  >
                    שדרג ({getUpgradeCost(upgrades.rateLevel)})
                  </button>
                </div>

                {/* Turret Upgrade */}
                <div className="bg-slate-800 p-3 rounded-lg flex items-center justify-between hover:bg-slate-750 transition-colors border border-purple-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Anchor className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">צריח אוטומטי</div>
                      <div className="text-xs text-slate-400">{upgrades.turretLevel === 0 ? 'לא נרכש' : `רמה ${upgrades.turretLevel}`}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => buyUpgrade('turretLevel')}
                    disabled={credits < getUpgradeCost(upgrades.turretLevel)}
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 rounded text-xs font-bold transition-colors"
                  >
                    {upgrades.turretLevel === 0 ? 'רכוש' : 'שדרג'} ({getUpgradeCost(upgrades.turretLevel)})
                  </button>
                </div>

                {/* Shield Upgrade */}
                <div className="bg-slate-800 p-3 rounded-lg flex items-center justify-between hover:bg-slate-750 transition-colors border border-cyan-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/20 rounded-lg">
                      <Hexagon className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">מגן אנרגיה</div>
                      <div className="text-xs text-slate-400">{upgrades.shieldLevel === 0 ? 'לא נרכש' : `רמה ${upgrades.shieldLevel}`}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => buyUpgrade('shieldLevel')}
                    disabled={credits < getUpgradeCost(upgrades.shieldLevel)}
                    className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:hover:bg-cyan-600 rounded text-xs font-bold transition-colors"
                  >
                    {upgrades.shieldLevel === 0 ? 'רכוש' : 'שדרג'} ({getUpgradeCost(upgrades.shieldLevel)})
                  </button>
                </div>

              </div>

              <button 
                onClick={nextLevel}
                className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold text-xl shadow-lg shadow-green-500/25 transition-all mt-4 hover:scale-105 transform active:scale-95"
              >
                המשך לשלב הבא
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-950/90 backdrop-blur-md animate-fade-in delay-1000 opacity-0 fill-mode-forwards" style={{animationDelay: '1.5s', animationFillMode: 'forwards'}}>
          <div className="text-center space-y-6 max-w-lg p-8 animate-scale-in">
            <h2 className="text-6xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)]">
              העיר נפלה
            </h2>
            <p className="text-red-200 text-2xl">
              כל הבניינים נהרסו. המערכה הסתיימה.
            </p>
            <div className="text-4xl font-mono font-bold text-white py-4 border-y border-white/20">
              הגעת לשלב {level}
            </div>
            <button 
              onClick={() => setGameState(GameState.MENU)}
              className="px-8 py-3 bg-white text-red-900 font-bold rounded-full hover:bg-gray-200 transition-all shadow-xl text-lg flex items-center gap-2 mx-auto hover:scale-110 transform"
            >
              <RefreshCw className="w-5 h-5" />
              חזור לתפריט הראשי
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
