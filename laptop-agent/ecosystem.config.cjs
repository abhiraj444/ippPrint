const path = require('path');

module.exports = {
  apps: [
    {
      name: 'ipp-print-agent',
      script: path.join(__dirname, 'dist', 'index.js'),
      cwd: __dirname,
      windowsHide: true,
      env: {
        NODE_ENV: 'production',
        RELAY_URL: 'relay-worker.abhinavip.workers.dev',
        DEVICE_ID: 'default',
        USE_TLS: 'true',
        PRINT_AS_IMAGE: 'true',
        IMAGE_DPI: '150'
      },
      watch: false,
      autorestart: true,
      max_restarts: 10
    }
  ]
};
