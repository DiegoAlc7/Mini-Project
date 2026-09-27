# Mini-Project 🚀
### Sistema Integral de Gestión de Proyectos con EDT, PERT y CPM (Ruta Crítica)

Una plataforma web interactiva y moderna para la planificación, estructuración y control cuantitativo de proyectos. Diseñada siguiendo las mejores prácticas de dirección de proyectos (PMBOK) e investigación de operaciones.

---

## 🌟 Características Principales

### 1. 🌳 Estructura de Desglose del Trabajo (EDT / WBS)
- **Árbol Jerárquico Dinámico:** Visualización tabular estructurada en Fases y Tareas (`TreeGrid`).
- **Numeración Automática:** Codificación estándar (1, 1.1, 1.1.1...) calculada dinámicamente según nivel de indentación.
- **Creación Rápida en Línea:** Creación ágil de fases y subtareas directamente desde la tabla jerárquica.
- **Detección Estricta de Nodos:** Distinción automática entre nodos contenedores (fases de resumen) y nodos hoja ejecutables.

### 2. ⏱️ Estimación Probabilística de Tiempos (PERT)
- **Cálculo de Tres Puntos:**
  - $a$: Tiempo optimista
  - $m$: Tiempo más probable
  - $b$: Tiempo pesimista
- **Tiempo Esperado ($T_e$):** Calculado automáticamente mediante distribución Beta:
  $$T_e = \frac{a + 4m + b}{6}$$
- **Varianza ($\sigma^2$):** Medida de incertidumbre cuantitativa:
  $$\sigma^2 = \left(\frac{b - a}{6}\right)^2$$
- **Validación Matemática Rigurosa:** Control estricto para garantizar que $0 < a \le m \le b$.

### 3. 🎯 Motor CPM y Ruta Crítica (Cálculo Reactivo en Segundo Plano)
- **Auto-Run en Segundo Plano:** El algoritmo CPM se recalcula automáticamente en segundo plano tras cualquier modificación en duraciones o dependencias.
- **Pasada hacia adelante (Forward Pass):** Cálculo de Inicio Temprano ($ES$) y Fin Temprano ($EF$).
- **Pasada hacia atrás (Backward Pass):** Cálculo de Inicio Tardío ($LS$) y Fin Tardío ($LF$).
- **Cálculo de Holguras:**
  - Holgura Total ($HT = LS - ES = LF - EF$).
  - Holgura Libre ($HL = \min(ES_{sucesores}) - EF$).
- **Identificación de la Ruta Crítica:** Detección de actividades sin margen de retraso ($HT = 0$), resaltadas visualmente en color rojo.
- **Duración de Fases Dinámica:** En lugar de suma lineal bruta, las fases calculan su duración real basada en la red ($EF_{\max} - ES_{\min}$).

### 4. 🔗 Gestión de Dependencias
- **Relaciones Fin-Inicio (FS):** Vinculación fluida entre actividades ejecutoras.
- **Prevención de Ciclos:** Bloqueo preventivo en interfaz y backend para imposibilitar dependencias circulares o autoreferencias.
- **Selector Flotante Inteligente:** Interfaz mediante React Portals para vinculación y desvinculación rápida sin recargar la página.

### 5. 📊 Diagrama de Gantt
- **Escala Temporal en Días Hábiles:** Salto automático de fines de semana (sábados y domingos).
- **Barras Diferenciadas:** Marcado en rojo para actividades críticas y azul para actividades con holgura.
- **Métricas Globales:** Visualización de duración total del proyecto, fechas de inicio/fin y conteo de tareas críticas.

### 6. 👥 Gestión de Recursos y Equipo
- **Catálogo de Miembros:** Asignación visual de responsables por tarea con avatares y roles profesionales.
- **Modal de Administración de Equipo:** Registro, edición y filtrado de miembros del proyecto.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS v4, Lucide React |
| **Backend** | Node.js, Express, TypeScript, tsx |
| **Base de Datos** | SQLite3 a través de `sql.js` (WebAssembly / In-Memory con persistencia en disco) |
| **Arquitectura** | Monorepo con npm workspaces (`client` y `server`) |

---

## 📂 Estructura del Repositorio

```text
Mini-Project/
├── client/                     # Aplicación Frontend (React + Vite)
│   ├── src/
│   │   ├── components/         # Componentes UI (TreeGrid, Gantt, Team Modal, etc.)
│   │   ├── context/            # ResourceContext (Equipo del proyecto)
│   │   ├── lib/                # Cliente API HTTP
│   │   ├── pages/              # Páginas principales (Dashboard, ProyectoView)
│   │   └── types/              # Definiciones TypeScript
│   ├── package.json
│   └── vite.config.ts
├── server/                     # Servidor API REST (Express + SQLite)
│   ├── src/
│   │   ├── db/                 # Conexión sql.js y schema.sql
│   │   ├── routes/             # Endpoints (proyectos, edt, actividades, dependencias, cpm)
│   │   ├── services/           # Algoritmos CPM y cálculo de días hábiles
│   │   └── index.ts            # Punto de entrada del servidor
│   ├── package.json
│   └── seed.js                 # Script de inicialización con caso de prueba realista
├── package.json                # Configuración raíz de npm workspaces
├── .gitignore                  # Reglas de exclusión de archivos
└── README.md                   # Documentación del proyecto
```

---

## 🚀 Instalación y Puesta en Marcha

### Prerrequisitos
- **Node.js** (v18.0.0 o superior)
- **npm** (v9.0.0 o superior)

### 1. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/TU_REPOSITORIO.git
cd Mini-Project
```

### 2. Instalar dependencias
Al utilizar npm workspaces, puedes instalar todas las dependencias del proyecto desde la raíz con un solo comando:
```bash
npm install
```

### 3. Iniciar en modo desarrollo
Para ejecutar el backend y el frontend simultáneamente:

**Terminal 1 (Backend):**
```bash
npm run dev:server
```
*Servidor API disponible en:* `http://localhost:3001`

**Terminal 2 (Frontend):**
```bash
npm run dev:client
```
*Aplicación web disponible en:* `http://localhost:5173`

---

## 🧪 Cargar Datos de Prueba (Opcional)
Para inicializar la base de datos con un proyecto completo y realista (*"Sistema de Recaudo Electrónico para Transporte Urbano"*) con EDT de 4 niveles, estimaciones PERT y dependencias preconfiguradas:

1. Asegúrate de tener el backend corriendo (`npm run dev:server`).
2. En otra terminal, ejecuta desde la raíz:
```bash
npm run seed
```

---

## 🏗️ Compilación para Producción

Para validar tipos TypeScript y compilar tanto el servidor como el cliente:
```bash
npm run build
```
O de manera individual:
- Servidor: `npm run build:server`
- Cliente: `npm run build:client`

---

## 📄 Licencia
Este proyecto fue desarrollado con fines académicos y profesionales. Distribuido bajo la licencia MIT.
