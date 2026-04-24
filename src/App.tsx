import { useState, useEffect, useRef } from 'react';
import { GameEngine } from './gameEngine';
import { GameState, ScoreData, SKINS } from './constants';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Coins, Play, Pause, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Volume2, VolumeX, Sparkles, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [score, setScore] = useState<ScoreData>({ 
    distance: 0, 
    coins: 0, 
    highScore: 0,
    selectedSkin: 'classic'
  });
  const [currentScore, setCurrentScore] = useState({ distance: 0, coins: 0, speed: 0 });
  const [isMuted, setIsMuted] = useState(false);
  const [showSkins, setShowSkins] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const gameStateRef = useRef<GameState>('START');

  // Sync ref with state
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    // Load local storage data
    const savedHighScore = localStorage.getItem('temple_escape_high_score');
    const savedSkin = localStorage.getItem('temple_escape_selected_skin');
    
    setScore(prev => ({ 
        ...prev, 
        highScore: savedHighScore ? parseInt(savedHighScore) : 0,
        selectedSkin: savedSkin || 'classic'
    }));
  }, []);

  const selectSkin = (skinId: string) => {
      const skin = SKINS.find(s => s.id === skinId);
      if (skin && score.highScore >= skin.requiredDistance) {
          setScore(prev => ({ ...prev, selectedSkin: skinId }));
          localStorage.setItem('temple_escape_selected_skin', skinId);
          if (engineRef.current) {
              engineRef.current.updateSkin(skin.color);
          }
      }
  };

  useEffect(() => {
    if (!engineRef.current && containerRef.current) {
      const engine = new GameEngine(containerRef.current, (p) => {
          setLoadingProgress(p);
          if (p >= 1) {
              setTimeout(() => {
                  setGameState('START');
              }, 500);
          }
      });
      engineRef.current = engine;

      // Apply initial skin
      const currentSkin = SKINS.find(s => s.id === score.selectedSkin);
      if (currentSkin) engine.updateSkin(currentSkin.color);

      engine.onGameOver = (distance, coins) => {
        setGameState('GAMEOVER');
        setCurrentScore({ distance, coins });
        
        setScore(prev => {
          const newHighScore = Math.max(prev.highScore, distance);
          localStorage.setItem('temple_escape_high_score', newHighScore.toString());
          
          if (distance > prev.highScore && distance > 0) {
            confetti({
              particleCount: 150,
              spread: 70,
              origin: { y: 0.6 }
            });
          }
          
          return {
            ...prev,
            distance,
            coins: prev.coins + coins,
            highScore: newHighScore
          };
        });
        
        // Don't destroy on game over, just stop
        engine.stop();
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (gameStateRef.current !== 'PLAYING') return;
        switch (e.key) {
          case 'ArrowLeft':
          case 'a':
            engine.moveLeft();
            break;
          case 'ArrowRight':
          case 'd':
            engine.moveRight();
            break;
          case 'ArrowUp':
          case 'w':
          case ' ':
            engine.jump();
            break;
          case 'ArrowDown':
          case 's':
            engine.slide();
            break;
        }
      };

      // Input Handling for swipes/flicks
      let startX = 0;
      let startY = 0;
      
      const handleInputStart = (x: number, y: number) => {
        startX = x;
        startY = y;
      };

      const handleInputEnd = (x: number, y: number) => {
        if (gameStateRef.current !== 'PLAYING') return;
        
        const dx = x - startX;
        const dy = y - startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (Math.max(absX, absY) > 20) {
          if (absX > absY) {
            if (dx > 0) engine.moveRight();
            else engine.moveLeft();
          } else {
            if (dy > 0) engine.slide();
            else engine.jump();
          }
        }
      };

      const preventDefault = (e: TouchEvent) => {
        if (gameStateRef.current === 'PLAYING') e.preventDefault();
      };

      // Events initialization
      window.addEventListener('keydown', handleKeyDown);
      
      // Touch listeners
      const onTouchStart = (e: TouchEvent) => handleInputStart(e.touches[0].clientX, e.touches[0].clientY);
      const onTouchEnd = (e: TouchEvent) => handleInputEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      
      // Mouse listeners (Flicking)
      const onMouseDown = (e: MouseEvent) => handleInputStart(e.clientX, e.clientY);
      const onMouseUp = (e: MouseEvent) => handleInputEnd(e.clientX, e.clientY);

      window.addEventListener('touchstart', onTouchStart, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchmove', preventDefault, { passive: false });
      
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);

      const scoreInterval = setInterval(() => {
        if (engineRef.current && gameStateRef.current === 'PLAYING') {
          setCurrentScore({
            distance: Math.floor(engineRef.current.distance),
            coins: engineRef.current.coins,
            speed: Math.floor(engineRef.current.speed)
          });
        }
      }, 100);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchmove', preventDefault);
        window.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mouseup', onMouseUp);
        clearInterval(scoreInterval);
        engine.destroy();
        engineRef.current = null;
      };
    }
  }, []); // Run once on mount

  useEffect(() => {
      if (gameState === 'PLAYING' && engineRef.current && !engineRef.current.isRunning) {
          engineRef.current.start();
      } else if (gameState === 'PAUSED' && engineRef.current && engineRef.current.isRunning) {
          engineRef.current.stop();
      }
  }, [gameState]);

  const togglePause = () => {
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
    } else if (gameState === 'PAUSED') {
      setGameState('PLAYING');
    }
  };

  return (
    <div 
      className="relative w-full h-screen bg-neutral-900 overflow-hidden font-sans text-white select-none"
      style={{ touchAction: 'none' }}
    >
      {/* 3D Canvas Container */}
      <div 
        ref={containerRef} 
        className="absolute inset-0 w-full h-full" 
        style={{ touchAction: 'none' }}
      />

      {/* Settings Overlay */}
      <div className="absolute top-6 left-6 z-[60] flex gap-2">
          <motion.button 
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
                if (engineRef.current) {
                    setIsMuted(engineRef.current.toggleMute());
                } else {
                    setIsMuted(!isMuted);
                }
            }}
            className="p-3 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 hover:bg-black/60 transition-colors pointer-events-auto"
          >
            {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
          </motion.button>
      </div>

      {/* UI Overlays */}
      <AnimatePresence mode="wait">
        {gameState === 'LOADING' && (
          <motion.div
            key="loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 z-[100] gap-8 p-12 text-center"
          >
            <div className="relative">
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="w-32 h-32 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold font-mono">{Math.floor(loadingProgress * 100)}%</span>
                </div>
            </div>

            <div className="flex flex-col gap-2 max-w-sm w-full">
                <div className="flex justify-between text-xs font-bold tracking-widest text-neutral-500 uppercase">
                    <span>Initializing Jungle</span>
                    <span>{Math.floor(loadingProgress * 100)}%</span>
                </div>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                        className="h-full bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.5)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${loadingProgress * 100}%` }}
                    />
                </div>
                <p className="text-xs text-neutral-600 italic mt-2">"Deep within the ruins, old spirits awaken..."</p>
            </div>
          </motion.div>
        )}

        {gameState === 'START' && (
          <motion.div
            key="start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-6 text-center"
          >
            <motion.h1 
                initial={{ y: -50 }}
                animate={{ y: 0 }}
                className="text-6xl md:text-8xl font-black tracking-tighter mb-4 text-yellow-500 drop-shadow-2xl"
            >
              TEMPLE ESCAPE
            </motion.h1>
            <p className="text-xl md:text-2xl text-neutral-300 mb-12 max-w-md">
              Run for your life! Avoid obstacles and collect gold.
            </p>

            <div className="flex flex-col gap-8 w-full max-w-xs pointer-events-auto">
                <motion.button
                    whileHover={{ scale: 1.08, y: -5, boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}
                    whileTap={{ scale: 0.95 }}
                    onMouseEnter={() => engineRef.current?.setHighlight(true)}
                    onMouseLeave={() => engineRef.current?.setHighlight(false)}
                    onClick={() => setGameState('PLAYING')}
                    className="flex items-center justify-center gap-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-4 px-8 rounded-2xl text-2xl transition-all shadow-xl"
                >
                    <Play size={28} fill="currentColor" />
                    START RUN
                </motion.button>

                <div className="bg-white/10 p-4 rounded-xl border border-white/10 flex items-center justify-between">
                    <span className="text-neutral-400 font-medium">HIGH SCORE</span>
                    <span className="text-2xl font-bold flex items-center gap-2">
                        <Trophy className="text-yellow-500" size={20} />
                        {score.highScore}m
                    </span>
                </div>

                <motion.button
                    whileHover={{ scale: 1.05, y: -2, backgroundColor: "rgba(255,255,255,0.15)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowSkins(true)}
                    className="flex items-center justify-center gap-3 bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                    <Sparkles className="text-yellow-500" size={20} />
                    CHARACTER SKINS
                </motion.button>
            </div>

            <div className="mt-16 grid grid-cols-2 gap-8 text-xs uppercase tracking-widest text-neutral-500">
                <div className="flex flex-col items-center gap-2">
                    <div className="p-2 border border-neutral-700 rounded-lg"><ArrowUp size={16} /></div>
                    JUMP (SPACE)
                </div>
                <div className="flex flex-col items-center gap-2">
                    <div className="p-2 border border-neutral-700 rounded-lg"><ArrowDown size={16} /></div>
                    SLIDE (S)
                </div>
            </div>
          </motion.div>
        )}

        {gameState === 'PLAYING' && (
          <motion.div
            key="hud"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-0 left-0 right-0 p-6 pointer-events-none z-10 flex justify-between items-start"
          >
            <div className="flex flex-col gap-1">
                <span className="text-sm font-bold tracking-widest text-yellow-500/80">DISTANCE</span>
                <span className="text-4xl font-mono font-black">{currentScore.distance}m</span>
                
                {/* Speedometer */}
                <div className="mt-4 flex flex-col gap-1">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-neutral-400">SPEED</span>
                    <div className="flex items-center gap-3">
                        <div className="relative w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                                className="absolute top-0 left-0 h-full bg-cyan-400"
                                animate={{ width: `${(currentScore.speed / 60) * 100}%` }}
                                transition={{ type: "spring", stiffness: 100 }}
                            />
                        </div>
                        <span className="text-xl font-mono font-bold text-cyan-400">{currentScore.speed}<span className="text-[10px] ml-1">KPH</span></span>
                    </div>
                </div>
            </div>
            
            <div className="flex flex-col items-end gap-1">
                 <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                    <Coins className="text-yellow-400" size={24} />
                    <span className="text-2xl font-bold font-mono">{currentScore.coins}</span>
                </div>
                
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={togglePause}
                    className="mt-2 p-3 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 hover:bg-black/60 transition-colors pointer-events-auto"
                >
                    <Pause size={24} />
                </motion.button>
            </div>
          </motion.div>
        )}

        {gameState === 'PAUSED' && (
          <motion.div
            key="paused"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-50 p-6 text-center"
          >
            <h2 className="text-6xl font-black text-white mb-8 tracking-tighter">PAUSED</h2>
            
            <div className="flex flex-col gap-4 w-full max-w-xs pointer-events-auto">
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setGameState('PLAYING')}
                    className="flex items-center justify-center gap-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-4 px-8 rounded-2xl text-2xl transition-all shadow-xl"
                >
                    <Play size={28} fill="currentColor" />
                    RESUME
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                        if (engineRef.current) engineRef.current.stop();
                        setGameState('START');
                    }}
                    className="flex items-center justify-center gap-3 bg-neutral-800 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                    QUIT TO MENU
                </motion.button>
            </div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div
            key="gameover"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-md z-50 p-6 text-center"
          >
            <h2 className="text-7xl font-black text-white mb-2">CRASHED!</h2>
            <p className="text-red-300 text-xl mb-12 uppercase tracking-[0.2em]">Game Over</p>

            <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-12">
                <div className="bg-black/30 p-6 rounded-2xl border border-white/5">
                    <div className="text-xs text-neutral-400 mb-1">SCORE</div>
                    <div className="text-3xl font-bold">{currentScore.distance}m</div>
                </div>
                <div className="bg-black/30 p-6 rounded-2xl border border-white/5">
                    <div className="text-xs text-neutral-400 mb-1">GOLD</div>
                    <div className="text-3xl font-bold text-yellow-400">{currentScore.coins}</div>
                </div>
                <div className="col-span-2 bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20 flex justify-between items-center px-8">
                    <span className="text-sm text-yellow-500 font-bold uppercase tracking-widest">Best Run</span>
                    <span className="text-2xl font-black">{score.highScore}m</span>
                </div>
            </div>

            <motion.button
                whileHover={{ scale: 1.05, y: -5, boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setGameState('PLAYING')}
                className="flex items-center justify-center gap-3 bg-white text-black font-bold py-4 px-12 rounded-2xl text-2xl transition-all shadow-2xl hover:bg-neutral-200"
            >
                <RotateCcw size={28} />
                PLAY AGAIN
            </motion.button>
            
            <motion.button
                whileHover={{ scale: 1.05, color: "#fff" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setGameState('START')}
                className="mt-6 text-neutral-400 hover:text-white transition-colors"
            >
                BACK TO MENU
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skin Selection Modal */}
      <AnimatePresence>
          {showSkins && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-lg z-[100] flex items-center justify-center p-6"
              >
                  <div className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-3xl overflow-hidden flex flex-col max-h-[80vh]">
                      <div className="p-8 border-b border-white/10 flex justify-between items-center">
                          <h3 className="text-3xl font-black flex items-center gap-3 italic tracking-tighter">
                            <Sparkles className="text-yellow-500" />
                            CHARACTER SKINS
                          </h3>
                          <div className="flex items-center gap-2 text-neutral-400 text-sm">
                             <Trophy size={16} /> Best: {score.highScore}m
                          </div>
                      </div>

                      <div className="p-8 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                          {SKINS.map(skin => {
                              const isUnlocked = score.highScore >= skin.requiredDistance;
                              const isSelected = score.selectedSkin === skin.id;

                              return (
                                  <motion.button
                                    key={skin.id}
                                    whileHover={isUnlocked ? { scale: 1.02, y: -4, backgroundColor: "rgba(255,255,255,0.1)" } : {}}
                                    whileTap={isUnlocked ? { scale: 0.98 } : {}}
                                    onMouseEnter={() => {
                                        if (isUnlocked && engineRef.current) {
                                            engineRef.current.updateSkin(skin.color);
                                            engineRef.current.setHighlight(true);
                                        }
                                    }}
                                    onMouseLeave={() => {
                                        if (engineRef.current) {
                                            const originalSkin = SKINS.find(s => s.id === score.selectedSkin);
                                            if (originalSkin) engineRef.current.updateSkin(originalSkin.color);
                                            engineRef.current.setHighlight(false);
                                        }
                                    }}
                                    disabled={!isUnlocked}
                                    onClick={() => selectSkin(skin.id)}
                                    className={`
                                        p-4 rounded-2xl border-2 transition-all flex items-center gap-4 text-left
                                        ${isSelected ? 'border-yellow-500 bg-yellow-500/10' : isUnlocked ? 'border-white/10 bg-white/5 hover:border-white/30' : 'border-white/5 bg-black/40 opacity-50 cursor-not-allowed'}
                                    `}
                                  >
                                      <div 
                                        className="w-12 h-12 rounded-xl shadow-lg border-2 border-white/20"
                                        style={{ backgroundColor: `#${skin.color.toString(16).padStart(6, '0')}` }}
                                      />
                                      <div className="flex-1">
                                          <div className="font-bold text-lg">{skin.name}</div>
                                          {!isUnlocked ? (
                                              <div className="text-red-400 text-xs flex items-center gap-1 font-bold">
                                                  <Lock size={12} /> UNLOCK AT {skin.requiredDistance}m
                                              </div>
                                          ) : (
                                              <div className="text-green-500 text-xs font-bold">UNLOCKED</div>
                                          )}
                                      </div>
                                      {isSelected && <div className="bg-yellow-500 text-black px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight">Active</div>}
                                  </motion.button>
                              );
                          })}
                      </div>

                      <div className="p-8 bg-neutral-950/50 flex justify-center">
                          <motion.button
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowSkins(false)}
                            className="bg-white text-black font-bold py-3 px-12 rounded-xl hover:bg-neutral-200 transition-all uppercase tracking-widest text-sm"
                          >
                            Done
                          </motion.button>
                      </div>
                  </div>
              </motion.div>
          )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
      `}} />
    </div>
  );
}
