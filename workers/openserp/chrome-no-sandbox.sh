#!/bin/sh
# OpenSERP's browser library only adds --no-sandbox when it recognises a container, and it doesn't on
# Railway, where Chrome then dies with "Permission denied" setting up its sandbox. OpenSERP 0.8.17 has
# no setting for this. Safe here: it has no public address and only opens Google.
exec /headless-shell/headless-shell --no-sandbox "$@"
