#!/bin/bash
set -e
sudo chown -R "$(id -un)":"$(id -un)" /opt/PRSM/backend/static
cd /opt/PRSM/frontend
npm run build
sudo chown -R prsm:prsm /opt/PRSM/backend/static
sudo chown prsm:prsm /opt/PRSM/.env
sudo chown prsm:prsm /opt/PRSM/whitelist.db
sudo chmod 664 /opt/PRSM/whitelist.db
sudo systemctl restart prsm
echo "Build complete"
