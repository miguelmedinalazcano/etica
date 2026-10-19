# La ética del periodismo · votaciones en directo

Web de apoyo a la presentación *La ética del periodismo: rigor periodístico vs. línea editorial* (Ética Empresarial y RSC, ICAI).

| Página | Para quién | Ruta |
|---|---|---|
| Móvil del alumno | La clase, por QR. Cambia sola con cada votación. | `/` |
| Consola de ponente | Los ponentes, en su móvil. Abre las votaciones, calcula los resultados, guion y reloj. | `/mando/` |
| Presentación HTML | Opcional: la presentación completa con gráficos en vivo. `?solo=N` muestra una sola slide (para incrustarla en PowerPoint). | `/proyector/` |

## Cómo funciona

- **Sin cuentas ni servidor propio.** Las páginas son estáticas (GitHub Pages). Los datos viajan por dos brokers MQTT públicos a la vez (HiveMQ y EMQX): si uno falla, sigue el otro.
- **Respuestas cifradas.** Cada móvil cifra su respuesta (ECDH P-256 + AES-GCM) con la clave pública de los ponentes. Solo un dispositivo con la clave de ponente puede leerlas y calcular los resultados.
- **Control firmado.** Mover la presentación, abrir votaciones, moderar o publicar resultados exige la clave de ponente (firma ECDSA). Un mensaje sin firma válida se ignora.
- **Anónimo.** Sin registro ni datos personales. Cada móvil tiene un identificador aleatorio. Al abrir una sesión nueva se borran los mensajes de la anterior.
- **Modo guía** (`strict: true` en `config.js`): solo las votaciones que pide la guía de la presentación (slides 2, 12, 18 y 27).

La clave de ponente **no está en este repositorio**: viaja en los enlaces de ponente (`#k=…`), que se comparten en privado.

## Probar en local

```bash
node ../.claude/serve.js . 8765
```

Añade `?local` a cualquier página para usar el modo local (todas las pestañas del mismo navegador comparten datos) y `?demo` para rellenar con datos simulados.

## Archivos

- `config.js`: brokers, sala, claves públicas, modo guía.
- `assets/js/questions.js`: preguntas, qué ve el móvil en cada slide, guion del ponente.
- `assets/js/store.js`: almacén de datos (MQTT, local o Firebase).
- `assets/js/mqtt-lite.js`, `assets/js/crypto.js`: cliente MQTT mínimo y criptografía (WebCrypto).
- `assets/vendor/`: Reveal.js 5.1.0 y qrcode-generator 1.4.4 (copias locales).
