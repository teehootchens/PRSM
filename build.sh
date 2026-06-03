#!/bin/bash
set -e
sudo chown -R your-username:your-username /opt/PRSM/backend/static
cd /opt/PRSM/frontend
npm run build
sudo chown -R prsm:prsm /opt/PRSM/backend/static
sudo systemctl restart prsm
echo "Build complete"
