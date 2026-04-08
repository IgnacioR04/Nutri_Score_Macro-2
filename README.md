# Dieta enero · GitHub Pages 

Web estática pensada para móvil, con estética inspirada en apps tipo Whoop / Bevel / Apple Watch:
- modo oscuro premium 
- navegación inferior tipo app
- gráfico de peso real vs estimado
- calorías, proteína, déficit acumulado
- entrenamientos por semana
- resumen mensual
- heatmap de adherencia
- sección para pegar el resumen diario y convertirlo a JSON

## Archivos
- `index.html` → estructura de la app
- `styles.css` → diseño visual
- `app.js` → lógica, gráficas y parser diario
- `data.json` → histórico diario
- `prompt-diario.txt` → prompt para pedir el resumen del día

## Cómo subirlo a GitHub Pages
1. Crea un repositorio nuevo en GitHub.
2. Sube todos los archivos del proyecto.
3. Entra en `Settings > Pages`.
4. En `Build and deployment`, elige `Deploy from a branch`.
5. Selecciona la rama `main` y la carpeta `/root`.
6. Guarda y espera unos segundos.
7. GitHub te dará una URL pública para abrirla desde el móvil.

## Cómo actualizar el histórico
1. En la pestaña `Add` de la web, pega tu resumen diario.
2. Pulsa `Convertir`.
3. Copia el JSON generado.
4. Abre `data.json` en GitHub.
5. Añade el nuevo objeto al final del array `days`.
6. Guarda el cambio.
7. Recarga la web.

## Nota
Esta primera versión no guarda sola desde la web. Está hecha para la opción A: HTML + JSON. Luego se puede conectar a una base de datos o a Google Sheets.
