# RozzaMC online website

Upload the contents of this folder as the static document root. It includes the
public website and the player panel:

- `/panel/` — player account, shop, companies, and plots
- `/dzialki/` — standalone plot management page
- `/admin/dzialki/` — separate plot administration page

The panel sends its API requests to the same origin under `/api/`. Configure the
web server to reverse-proxy `/api/` to the RealLifeCore dashboard on the server
(normally `127.0.0.1:8123`). Keep the dashboard bound to localhost; do not expose
port 8123 directly to the internet. Serve the website and proxy over HTTPS.

The panel uses relative same-origin API URLs by default. If the static site and
API are hosted on different origins, the API needs an explicit `api-base` on the
panel page and correctly restricted CORS support; the current dashboard is
intended to be used behind a same-origin reverse proxy.
