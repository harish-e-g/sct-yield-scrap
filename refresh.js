/* Auto-refresh: when a new build is published to GitHub Pages, reload to the latest version */
(function(){
  "use strict";
  var meta = document.querySelector('meta[name="build"]');
  var current = meta ? meta.getAttribute("content") : "";
  var el = document.getElementById("buildId"); if(el) el.textContent = current;
  // keep the address bar clean so copied links are the plain share URL
  if(/[?&]v=/.test(location.search) && history.replaceState){ history.replaceState(null, "", location.pathname + location.hash); }
  var toast = document.getElementById("toast");
  function check(){
    fetch("version.json?t=" + Date.now(), {cache:"no-store"})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if(!j || !j.v || j.v === current) return;
        if(toast){ toast.textContent = "New version published. Refreshing..."; toast.hidden = false; }
        setTimeout(function(){ location.replace(location.pathname + "?v=" + encodeURIComponent(j.v) + location.hash); }, 1800);
      })
      .catch(function(){});
  }
  setTimeout(check, 3000);
  setInterval(check, 30000);
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) check(); });
})();
