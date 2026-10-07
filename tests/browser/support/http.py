"""Serveur local partagé : mêmes chemins à la racine et sous GitHub Pages."""

from pathlib import Path
from http.server import SimpleHTTPRequestHandler

REPO = Path(__file__).resolve().parents[3]


class RepositoryHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(directory or REPO), **kwargs)

    def translate_path(self, path):
        if path.startswith('/Jeu-du-duc/'):
            path = path[len('/Jeu-du-duc') :]
        return super().translate_path(path)

    def log_message(self, *args):
        pass
