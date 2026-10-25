// Punto de entrada: carga el entorno y levanta el servidor.
require('dotenv').config();
const app = require('./src/app');
const config = require('./src/config');

app.listen(config.port, () => {
  console.log(`Servidor escuchando en el puerto ${config.port}`);
});
