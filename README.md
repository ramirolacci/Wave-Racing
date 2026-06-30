<div align="center">

<img src="./public/WaveIcon.png" width="100" alt="Wave Racing Icon" />

# WAVE RACING

**Un juego de carreras arcade 3D construido desde cero con Three.js**

![Threejs](https://img.shields.io/badge/threejs-black?style=for-the-badge&logo=three.js&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
[![Mobile Ready](https://img.shields.io/badge/Mobile-Ready-00FFD5?style=for-the-badge&logo=android&logoColor=white)](#mobile)

<br/>

*Desarrollado por [WaveFrame Studio](https://waveframe.com.ar/) — © 2026*

</div>

---

## ✨ Características

<table>
<tr>
<td width="50%">

**🎮 Gameplay**
- Carreras de 3 vueltas contra 4 rivales con IA
- Sistema de drift con física arcade realista
- Detección de posición en tiempo real
- Pantalla de resultados con tabla de tiempos

</td>
<td width="50%">

**🎨 Visual & Audio**
- Motor 3D con Three.js y tone mapping cinemático
- Efectos de humo, polvo y marcas de neumáticos
- Motor de audio procedural por síntesis
- Música de fondo dinámica y sonido 3D espacial

</td>
</tr>
<tr>
<td>

**📷 Cámaras**
- Tercera persona dinámica
- Vista cockpit con tablero
- Perspectiva bumper (ras del suelo)
- Cámara aérea / bird's-eye

</td>
<td>

**📱 Mobile**
- Controles táctiles en modo landscape
- Joystick virtual flotante
- Detección automática de orientación
- Soporte para notch / safe area

</td>
</tr>
</table>

---

## 📸 Capturas

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./screenshots/attract.png" alt="Wave Racing — Attract Mode" width="100%" />
      <br/><br/>
      <b>Attract Mode — Vista Aérea</b>
    </td>
    <td align="center" width="50%">
      <img src="./screenshots/gameplay.png" alt="Wave Racing — Gameplay" width="100%" />
      <br/><br/>
      <b>En Carrera — Cámara Tercera Persona</b>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="./screenshots/results.png" alt="Wave Racing — Resultados" width="100%" />
      <br/><br/>
      <b>Tabla de Resultados — Fin de Carrera</b>
    </td>
  </tr>
</table>

---

## 🎮 Controles

### ⌨️ Teclado

| Acción | Tecla |
|--------|-------|
| Acelerar | `W` / `↑` |
| Frenar / Reversa | `S` / `↓` |
| Girar | `A` `D` / `←` `→` |
| Derrape / Freno de mano | `SPACE` |
| Cambiar cámara | `C` |
| Reiniciar carrera | `R` |

### 📱 Mobile (Landscape)

| Zona | Control |
|------|---------|
| Mitad izquierda | Joystick virtual — dirección |
| Botón superior derecha | GAS ▲ |
| Botón inferior derecha | FRENO ▼ |
| Botón superior izquierda (derecha) | DRIFT ⚡ |

> El juego detecta automáticamente si estás en un dispositivo táctil y activa los controles móviles. Se requiere **modo horizontal (landscape)**.

---

## 🤖 Inteligencia Artificial

Los rivales usan un sistema de IA basado en waypoints con:

- **Seguimiento de línea de carrera** por curva de Bézier
- **Adelantamientos y bloqueos** según posición relativa
- **Variación de agresividad** por piloto
- **Sonido 3D espacializado** por posición del auto rival

### Pilotos incluidos

| Piloto | Color |
|--------|-------|
| F. Colapinto | 🔵 Azul |
| A. Senna | 🟡 Dorado |
| L. Hamilton | 🟢 Verde |
| M. Verstappen | 🟠 Naranja |

---

## ⚙️ Stack Técnico

```
Wave Racing
├── Three.js          → Motor 3D, renderizado, física de cámara
├── React 18          → Shell de la aplicación
├── Vite 5            → Dev server con HMR
├── Web Audio API     → Síntesis de motor y música procedural
└── Canvas 2D API     → HUD y minimapa
```

---

## 👥 Créditos

<div align="center">

**Desarrollado y diseñado íntegramente por**

### [WaveFrame Studio](https://waveframe.com.ar/)

🌐 [waveframe.com.ar](https://waveframe.com.ar/)

*© 2026 WaveFrame Studio. Todos los derechos reservados.*

</div>
