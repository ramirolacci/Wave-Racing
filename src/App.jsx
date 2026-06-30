import { useEffect } from 'react';
import '../style.css';

const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

function App() {
  useEffect(() => {
    import('../js/game.js');
  }, []);

  return (
    <>
      <canvas id="game"></canvas>
      <canvas id="minimap" width="160" height="160"></canvas>
      {!isMobile && (
        <div id="controls">WASD / Flechas · ESPACIO para derrapar · C para cambiar cámara · R para reiniciar</div>
      )}
      <div id="credits">
        Desarrollado por{' '}
        <a href="https://waveframe.com.ar/" target="_blank" rel="noopener noreferrer">
          WaveFrame Studio
        </a>{' '}
        © {new Date().getFullYear()}
      </div>
    </>
  );
}

export default App;
