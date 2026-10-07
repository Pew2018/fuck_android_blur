# MDC Web bundle

This WebUI pins the archived classic `material-components-web` upstream release `v11.0.0` from `material-components/material-components-web` (MIT). This is the pre-switch-redesign MDC Web API and DOM used for the classic Material switch.

Only the switch, ripple, linear progress, button, dialog, and snackbar styles/runtime are bundled. `.github/scripts/build-webui.sh` compiles the Sass and bundles `webroot/app.js` into `webroot/vendor/mdc.css` and `webroot/vendor/mdc.js`. The generated files are packaged into the module installer. The installed WebUI makes no network requests for MDC resources.

Upstream references:

- https://github.com/material-components/material-components-web/tree/v11.0.0/packages/mdc-switch
- https://github.com/material-components/material-components-web/tree/v11.0.0/packages/mdc-linear-progress
- https://github.com/material-components/material-components-web/tree/v11.0.0/packages/mdc-dialog
- https://github.com/material-components/material-components-web/tree/v11.0.0/packages/mdc-snackbar
