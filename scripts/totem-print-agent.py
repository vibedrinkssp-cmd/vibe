#!/usr/bin/env python3
"""
VIBE DRINKS — Totem Print Agent (Linux / USB ESC/POS)
====================================================

Pequeno servidor HTTP local que recebe o ticket do navegador (TotemPanelLinux)
e imprime DIRETO na impressora térmica USB usando python-escpos (libusb).

ROTA:
  POST http://127.0.0.1:9100/print
  Body JSON: {
    "store": "VIBE DRINKS",
    "customerName": "FULANO",
    "orderCode": "ABC123",
    "items": [{"name": "COCA 350ML", "qty": 2}, ...],
    "printedAt": "2026-04-30T12:00:00Z"
  }

INSTALAÇÃO (Ubuntu/Debian):
  sudo apt install python3-pip libusb-1.0-0
  pip3 install python-escpos flask flask-cors

  # Permissão da impressora USB sem precisar de sudo:
  # 1) Descubra VENDOR_ID:PRODUCT_ID com:  lsusb
  # 2) Crie /etc/udev/rules.d/99-escpos.rules com:
  #    SUBSYSTEM=="usb", ATTRS{idVendor}=="04b8", ATTRS{idProduct}=="0202", MODE="0666"
  # 3) sudo udevadm control --reload-rules && sudo udevadm trigger

CONFIGURAÇÃO:
  Edite VENDOR_ID e PRODUCT_ID abaixo conforme a sua impressora.
  Exemplos comuns:
    Epson TM-T20    : 0x04b8 / 0x0e15
    Bematech MP-4200: 0x0b1b / 0x0003
    Elgin i9        : 0x0416 / 0x5011

EXECUÇÃO:
  python3 totem-print-agent.py

  Para rodar como serviço (systemd) coloque em /etc/systemd/system/totem-print.service.
"""

import sys
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    from escpos.printer import Usb
except ImportError:
    print("ERRO: instale com: pip3 install python-escpos flask flask-cors", file=sys.stderr)
    sys.exit(1)

# ─── CONFIG ─────────────────────────────────────────────────────────────────
VENDOR_ID  = 0x04b8   # ← AJUSTE conforme sua impressora (lsusb)
PRODUCT_ID = 0x0e15   # ← AJUSTE conforme sua impressora (lsusb)
HOST = "127.0.0.1"
PORT = 9100
PAPER_WIDTH_CHARS = 32   # 58mm ≈ 32 col, 80mm ≈ 48 col
# ────────────────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("totem-print")

app = Flask(__name__)
CORS(app)  # libera chamadas do navegador (qualquer origem)


def open_printer():
    """Abre a impressora USB. Levanta exceção se não encontrar."""
    return Usb(VENDOR_ID, PRODUCT_ID, timeout=0, in_ep=0x82, out_ep=0x01)


def center(text: str) -> str:
    return text.center(PAPER_WIDTH_CHARS)


def sep() -> str:
    return "-" * PAPER_WIDTH_CHARS


def render_ticket(p, payload: dict) -> None:
    store        = payload.get("store", "VIBE DRINKS")
    customer     = (payload.get("customerName") or "CLIENTE").upper()
    order_code   = payload.get("orderCode", "------")
    items        = payload.get("items", [])
    printed_at   = payload.get("printedAt") or datetime.now().isoformat()

    try:
        dt = datetime.fromisoformat(printed_at.replace("Z", "+00:00"))
        date_str = dt.strftime("%d/%m/%y %H:%M")
    except Exception:
        date_str = datetime.now().strftime("%d/%m/%y %H:%M")

    p.set(align="center", bold=True, width=2, height=2)
    p.text(f"{store}\n")
    p.set(align="center", bold=False, width=1, height=1)
    p.text(f"{date_str}\n")
    p.text(f"{sep()}\n")

    p.set(align="center", bold=True, width=3, height=3)
    p.text(f"#{order_code}\n")
    p.set(align="center", bold=True, width=1, height=1)
    p.text(f"{customer}\n")
    p.text(f"{sep()}\n")

    p.set(align="left", bold=False, width=1, height=1)
    for it in items:
        qty = it.get("qty", 1)
        name = (it.get("name") or "").upper()
        line = f"{qty}x {name}"
        # quebra simples se passar da largura
        while len(line) > PAPER_WIDTH_CHARS:
            p.text(line[:PAPER_WIDTH_CHARS] + "\n")
            line = "    " + line[PAPER_WIDTH_CHARS:]
        p.text(line + "\n")

    p.text(f"{sep()}\n")
    p.set(align="center", bold=False)
    p.text("Aguarde a chamada\n\n")
    p.cut()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "totem-print-agent", "version": "1.0"})


@app.route("/print", methods=["POST", "OPTIONS"])
def do_print():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    log.info("recebido pedido %s para %s (%d itens)",
             payload.get("orderCode"),
             payload.get("customerName"),
             len(payload.get("items", [])))

    try:
        p = open_printer()
    except Exception as e:
        log.exception("falha ao abrir impressora USB")
        return jsonify({"ok": False, "error": f"printer-open: {e}"}), 500

    try:
        render_ticket(p, payload)
        return jsonify({"ok": True})
    except Exception as e:
        log.exception("falha ao imprimir")
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        try:
            p.close()
        except Exception:
            pass


if __name__ == "__main__":
    log.info("totem-print-agent ouvindo em http://%s:%d (vendor=%#x product=%#x)",
             HOST, PORT, VENDOR_ID, PRODUCT_ID)
    app.run(host=HOST, port=PORT, debug=False)
