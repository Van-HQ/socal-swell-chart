#!/bin/sh
# Rebuilds index.html (the page GitHub Pages serves) from the pieces in src/.
cd "$(dirname "$0")"
{ cat src/head.html; echo '<script>'; printf 'const LAND='; cat src/land.json; echo ';'; printf 'const BUILD="%s";\n' "$(date +%s)"; cat src/spots.js src/app.js src/session.js src/settings.js; echo '</script>'; echo '</body></html>'; } > index.html
wc -c index.html
