import { VoiceAssistantApp } from './app.js';
import { WEBSOCKET_PING_INTERVAL } from './config.js';

let appInstance: VoiceAssistantApp | null = null;

async function initializeApp(): Promise<void> {
  try {

    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve));
    }


    appInstance = new VoiceAssistantApp();
    await appInstance.initialize();


    window.addEventListener('beforeunload', () => {
      if (appInstance) {
        appInstance.cleanup();
      }
    });


    const handleResize = () => {
      const size = Math.min(window.innerWidth * 0.9, window.innerHeight * 0.9, 400);
      document.documentElement.style.setProperty('--container-size', `${size}px`);
    };

    handleResize();
    window.addEventListener('resize', handleResize);


    setInterval(() => {

    }, WEBSOCKET_PING_INTERVAL);

  } catch (error) {
    console.error('Failed to initialize application:', error);
    const container = document.querySelector('.container');
    if (container) {
      container.innerHTML = `
        <div style="color: oklch(57.7% 0.245 27.325); text-align: center; padding: 20px; font-family: Inter, sans-serif;">
          <div>Application initialization failed</div>
          <div style="margin-top: 10px; font-size: 12px; opacity: 0.8;">
            Please refresh the page or check the console for details.
          </div>
          <button onclick="window.location.reload()" 
                  style="margin-top: 15px; padding: 8px 16px; background: #333; 
                         color: white; border: 1px solid #666; border-radius: 5px; 
                         cursor: pointer;">
            Refresh Page
          </button>
        </div>
      `;
    }
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}