#!/bin/bash
set -e
sudo chown -R your-username:your-username /opt/PRSM/backend/static
cd /opt/PRSM/frontend
npm run build
sudo chown -R prsm:prsm /opt/PRSM/backend/static
sudo chown your-username:prsm /opt/PRSM/.env
sudo chown your-username:prsm /opt/PRSM/whitelist.db
sudo chmod 664 /opt/PRSM/whitelist.db
sudo systemctl restart prsm
echo "Build complete"
