import { useEffect } from 'react';
import '../style.css';

function App() {
  useEffect(() => {
    import('../js/game.js');
  }, []);

  return (
    <>
      <canvas id="game"></canvas>
      <canvas id="minimap" width="160" height="160"></canvas>
      <div id="controls">WASD / Arrows · SPACE to drift · C to change camera · R to restart</div>
      <div id="credits">
        Developed by{' '}
        <a href="https://waveframe.com.ar/" target="_blank" rel="noopener noreferrer">
          WaveFrame Studio
        </a>{' '}
        © {new Date().getFullYear()}
      </div>
    </>
  );
}

export default App;
