# Fitness Pro AI 🏋️‍♂️🤖

**Fitness Pro AI** es una aplicación web Full Stack (Node.js/Express en el backend y HTML/CSS/JS clásico en el frontend) diseñada para la gestión interactiva de la información de un gimnasio. Incorpora a **GymBot**, un asistente virtual inteligente impulsado por IA a través de la API de **OpenRouter**.

GymBot está configurado bajo estrictas restricciones semánticas para responder preguntas de manera amable, profesional y concisa, basándose exclusivamente en una base de conocimientos local en formato JSON para evitar alucinaciones.

---

## 🌟 Características

- **Asistente Inteligente (GymBot)**: Integración fluida con OpenRouter usando modelos optimizados (como `z-ai/glm-4.7-flash` o modelos similares).
- **Cero Alucinaciones**: El sistema de prompt instruye estrictamente al bot para responder solo con información confirmada dentro de la base de datos local de conocimiento (`knowledge.json`).
- **Diseño Responsivo y Atractivo**: Interfaz web intuitiva con un widget de chat flotante, micro-animaciones y soporte para interacción en dispositivos móviles y de escritorio.
- **Base de Conocimientos Robusta**: Contiene información exhaustiva del gimnasio:
  - Ubicación, estacionamiento y horarios detallados.
  - Planes de membresías (Básica, Premium, Anual) con precios y políticas de congelamiento.
  - Catálogo de clases y sus entrenadores respectivos (CrossFit, Yoga, Spinning, Zumba, etc.).
  - Servicios adicionales, políticas internas (uso de toallas, orden) y métodos de pago.
  - Venta de suplementos y datos de contacto directo (WhatsApp y correo).

---

## 🛠️ Tecnologías Utilizadas

- **Backend**: Node.js & Express
- **Frontend**: HTML5, Vanilla CSS3 (diseño responsivo, animaciones modernas) y JavaScript moderno (Fetch API).
- **IA/Integración**: API de OpenRouter (uso del modelo de lenguaje en modo conversacional con parámetros de baja temperatura para mayor factualidad).
- **Variables de Entorno**: `dotenv` para una configuración segura y limpia.

---

## 📂 Estructura del Proyecto

```text
fitness-pro-ai/
├── data/
│   └── knowledge.json        # Base de conocimiento oficial del gimnasio (más de 40 hechos concretos)
├── public/
│   ├── css/
│   │   └── style.css         # Estilos globales y del chat widget (Premium UX)
│   ├── js/
│   │   └── app.js            # Lógica del cliente para el chat e interacción
│   └── index.html            # Landing page del gimnasio con el widget de chat
├── routes/
│   └── chat.js               # Rutas API de Express para peticiones de chat
├── services/
│   └── openrouter.js         # Servicio de conexión y prompt de sistema de OpenRouter
├── .env                      # Variables de entorno locales (ignoradas por git)
├── .gitignore                # Archivos y carpetas excluidas del control de versiones
├── package.json              # Configuración de Node.js y dependencias
├── README.md                 # Documentación del proyecto (esta)
└── server.js                 # Punto de entrada de la aplicación Express
```

---

## 🚀 Instalación y Configuración

Sigue estos pasos para poner en marcha el proyecto en tu entorno local:

### 1. Clonar el Repositorio
```bash
git clone <url-del-repositorio>
cd fitness-pro-ai
```

### 2. Instalar Dependencias
Asegúrate de tener Node.js instalado (versión 18 o superior recomendada) y ejecuta:
```bash
npm install
```

### 3. Configurar las Variables de Entorno
Crea un archivo llamado `.env` en la raíz del proyecto y agrega tus claves correspondientes. Puedes basarte en el siguiente formato:
```env
# Clave API de OpenRouter (Requerido)
OPENROUTER_API_KEY=tu_api_key_de_openrouter_aqui

# Puerto en el que correrá el servidor local
PORT=3000

# Modelo opcional a utilizar (Por defecto: z-ai/glm-4.7-flash)
OPENROUTER_MODEL=z-ai/glm-4.7-flash
```

---

## 💻 Ejecución del Servidor

Para iniciar la aplicación en tu entorno local:

```bash
npm start
```

Una vez iniciado, abre tu navegador e ingresa a:
👉 [http://localhost:3000](http://localhost:3000)

---

## 🔌 API Endpoints

### Chatbot Endpoint
- **Ruta**: `/chat`
- **Método**: `POST`
- **Formato de petición (JSON)**:
  ```json
  {
    "message": "Hola, ¿cuánto cuesta la membresía premium?"
  }
  ```
- **Formato de respuesta (JSON)**:
  ```json
  {
    "reply": "¡Hola! La membresía Premium cuesta $650 al mes e incluye acceso a todas las áreas, clases, nutriólogo y estacionamiento gratis."
  }
  ```

---

## 🛡️ Políticas de Seguridad y Git

El archivo `.gitignore` configurado asegura que:
- Las dependencias locales (`node_modules/`) no se suban al repositorio.
- Las credenciales privadas (`.env`) se mantengan de manera estrictamente local.
- Se omitan configuraciones temporales de IDEs y logs de error del sistema.
