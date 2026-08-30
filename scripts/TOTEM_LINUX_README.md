# Totem Linux — Impressão USB ESC/POS direta

Tela: **`/totempanel-linux`** (clone do `/totempanel`).
Diferença única: em vez de usar `window.print()` da impressora padrão do Windows,
o navegador faz `POST http://127.0.0.1:9100/print` para um agente Python local
que envia comandos ESC/POS direto à impressora USB.

## 1. Instalar o agente no PC do totem (Linux)

```bash
sudo apt install python3-pip libusb-1.0-0
pip3 install python-escpos flask flask-cors
```

Edite `scripts/totem-print-agent.py` e ajuste `VENDOR_ID` / `PRODUCT_ID`
(use `lsusb` para descobrir).

Crie regra udev para permitir acesso USB sem sudo:
```
# /etc/udev/rules.d/99-escpos.rules
SUBSYSTEM=="usb", ATTRS{idVendor}=="04b8", ATTRS{idProduct}=="0e15", MODE="0666"
```
```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
```

## 2. Rodar como serviço (systemd)

`/etc/systemd/system/totem-print.service`:
```ini
[Unit]
Description=VM Brasil Totem Print Agent
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/vmbrasil/totem-print-agent.py
Restart=always
User=totem

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now totem-print
```

## 3. Abrir o navegador no totem

```bash
chromium --kiosk --noerrdialogs --disable-translate \
  https://SEU-DOMINIO/totempanel-linux
```

## 4. Override do endpoint (opcional)

No DevTools do totem:
```js
localStorage.setItem('TOTEM_PRINT_AGENT_URL', 'http://127.0.0.1:9100/print');
```

## 5. Teste rápido

```bash
curl -X POST http://127.0.0.1:9100/print \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"TESTE","orderCode":"ABC123","items":[{"name":"COCA 350ML","qty":2}]}'
```
