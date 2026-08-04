const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

const splashHTML = `  <!-- CryoLedger Global Splash Screen -->
  <div id="cryo-global-splash" style="position:fixed; top:0; left:0; width:100%; height:100%; background:#0B1120; z-index:9999999; display:flex; flex-direction:column; align-items:center; justify-content:center; transition:opacity 0.8s ease, visibility 0.8s ease;">
    <style>
      @keyframes cryoSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .cryo-spinner { width: 48px; height: 48px; border: 4px solid rgba(16,185,129,0.2); border-left-color: #10b981; border-radius: 50%; animation: cryoSpin 1s linear infinite; margin-top: 2rem; margin-bottom: 2rem; }
      .cryo-logo-text { font-size: 3rem; font-weight: 800; background: linear-gradient(135deg, #fff 30%, #10b981 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-family: 'Outfit', sans-serif; display:flex; align-items:center; gap:0.5rem;}
      @media(max-width: 600px) {
         .cryo-logo-text { font-size: 2.2rem; }
         .cryo-splash-msg { font-size: 0.95rem; text-align: center; padding: 0 1rem; }
      }
    </style>
    <div class="cryo-logo-text">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      CryoLedger
    </div>
    <div class="cryo-spinner"></div>
    <div class="cryo-splash-msg" style="color: #94a3b8; font-family: 'Inter', sans-serif; font-weight: 500;">Please wait while the application is loading...</div>
  </div>
  <script>
    (function(){
      let isReady = false;
      let isWindowLoaded = false;
      
      const checkReady = () => {
        if(isReady && isWindowLoaded) {
          const splash = document.getElementById('cryo-global-splash');
          if(splash) {
            splash.style.opacity = '0';
            splash.style.visibility = 'hidden';
            setTimeout(() => splash.remove(), 800);
          }
        }
      };

      window.addEventListener('load', () => {
        isWindowLoaded = true;
        checkReady();
      });

      const pingHealth = () => {
        fetch('/api/health')
          .then(res => {
            if(res.ok) {
              isReady = true;
              checkReady();
            } else {
              setTimeout(pingHealth, 1000);
            }
          })
          .catch(() => {
            setTimeout(pingHealth, 1000);
          });
      };
      
      pingHealth();
      
      // Complete fallback in case there is no connection for 30s
      setTimeout(() => {
         if(!isReady) {
            isReady = true;
            checkReady();
         }
      }, 30000);
    })();
  </script>
`;

fs.readdirSync(publicDir).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(publicDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        if (!content.includes('id="cryo-global-splash"')) {
            content = content.replace('<body>', '<body>\n' + splashHTML);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log("Added splash screen to " + file);
        }
    }
});
console.log("Done adding splash screens.");
