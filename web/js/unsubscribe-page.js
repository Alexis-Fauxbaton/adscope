// /app/desabonnement.html — le point d'entrée de la page, hors module
// inline : une Content-Security-Policy `script-src 'self'` (C-7/INJ-2, audit
// config/injection) refuse tout `<script>` sans fichier, même de type
// "module". Même mécanique que `balayage-page.js`/`revisits-page.js`.

import { render } from './unsubscribe.js'

render(document.getElementById('racine'))
