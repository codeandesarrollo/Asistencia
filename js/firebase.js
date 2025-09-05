<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Control de Asistencia · Inicio</title>
  <link href="./css/ui.css" rel="stylesheet">
</head>
<body>
  <header>
    <h1>Control de Asistencia</h1>
  </header>

  <div class="container">
    <!-- Pantalla de Bienvenida -->
    <div class="welcome-message">
      <div class="welcome-icon">🏫</div>
      <h2>Bienvenido Maestro</h2>
      <p>Gestiona la asistencia de tus escuelas y grupos</p>
    </div>

    <!-- Estado de Firebase -->
    <div id="fbStatus" class="card">
      Conectando con Firebase…
    </div>

    <!-- Botón para ir a Escuelas -->
    <a id="goEscuelas" class="btn" href="./escuelas.html" style="pointer-events:none;opacity:.6;">
      Ir a Escuelas
    </a>
  </div>

  <!-- Firebase init -->
  <script type="module">
    import { app, db } from "./js/firebase.js";
    import { doc, setDoc, getDoc, serverTimestamp } 
      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    const fbStatus = document.getElementById("fbStatus");
    const goBtn    = document.getElementById("goEscuelas");

    async function pingFirestore(){
      try{
        const ref = doc(db,"__meta","ping");
        await setDoc(ref,{ lastPing: serverTimestamp() },{ merge:true });
        const snap = await getDoc(ref);
        return snap.exists();
      }catch(e){
        console.error(e);
        return false;
      }
    }

    (async ()=>{
      const ok = await pingFirestore();
      if(ok){
        fbStatus.textContent = "Firebase conectado ✔";
        fbStatus.style.color = "green";
        goBtn.style.pointerEvents = "auto";
        goBtn.style.opacity = "1";
      }else{
        fbStatus.textContent = "Error: no se pudo conectar a Firestore";
        fbStatus.style.color = "red";
      }
    })();
  </script>
</body>
</html>
