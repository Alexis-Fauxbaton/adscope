"""Plusieurs uvicorn sur des ports distincts, et des requêtes lâchées ensemble.

Le banc d'essai des épreuves multi-processus, isolé ici parce qu'il ne dit rien
de ce qu'on mesure : il monte les processus, les attend, tire, et les tue.
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request


def post(port, payload, key):
    """Le code de retour d'un lot, ou None si le port ne répond pas encore."""
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/observations",
        data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as answer:
            return answer.status
    except urllib.error.HTTPError as refused:
        return refused.code
    except OSError:
        return None


def spawn(count, url, first=8801):
    """Autant d'uvicorn que demandé, sur la même base, jamais sur le port 8000.

    Chaque processus a sa propre réserve de connexions : c'est tout l'intérêt.
    On attend que chacun réponde — n'importe quel code, le refus d'une licence
    absente suffit à prouver qu'il écoute.
    """
    ports = list(range(first, first + count))
    processes = [
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "adscope_api.main:app", "--host",
             "127.0.0.1", "--port", str(port), "--log-level", "warning"],
            env={**os.environ, "DATABASE_URL": url},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for port in ports
    ]
    for port in ports:
        deadline = time.time() + 30
        while post(port, {"items": []}, "absente") is None and time.time() < deadline:
            time.sleep(0.1)
    return processes, ports


def kill(processes):
    for process in processes:
        process.terminate()
    for process in processes:
        process.wait(timeout=10)


def fire(ports, payloads, key):
    """Un fil par lot, réparti sur les ports, tous lâchés sur une barrière.

    Sans la barrière les fils se suivent au lieu de se heurter, et l'épreuve ne
    prouve rien — c'est la leçon de `tests/conftest.py`, portée au réseau.
    """
    barrier = threading.Barrier(len(payloads))
    codes = [None] * len(payloads)

    def one(index):
        barrier.wait(timeout=30)
        codes[index] = post(ports[index % len(ports)], payloads[index], key)

    threads = [threading.Thread(target=one, args=(i,)) for i in range(len(payloads))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=120)
    return codes
